/**
 * 智能问答 SSE 流式接口
 * POST /api/chat/stream
 * 接收用户问题，识别意图、查询数据，并通过 SSE 流式返回 AI 回答
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { chatbot } from '@/lib/ai/chatbot';
import { chatCompletionStream } from '@/lib/ai';
import { sanitizeUserInput, CONSTITUTIONAL_REFUSAL } from '@/lib/ai/security';
import { createSSEStream } from '@/lib/llm/stream-utils';

// ============================================
// 请求体验证
// ============================================

/** 单条对话消息 Schema */
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

/** SSE 流式对话请求体 Schema */
const ChatStreamRequestSchema = z.object({
  question: z.string().min(1, '问题不能为空'),
  history: z.array(ChatMessageSchema).optional(),
});

/** SSE 流式对话请求体类型 */
type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;

// ============================================
// SSE 响应头
// ============================================

/** 标准 SSE 响应头 */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

// ============================================
// Prompt 构建
// ============================================

/** 构建 System Prompt，追加宪法安全声明 */
function buildSystemPrompt(): string {
  return `你是 NPS Insight 智能问答助手，专门回答关于 feelgood 用户反馈数据的问题。

回答规则：
1. 用友好、专业的中文回答
2. 数据要准确，不要编造
3. 适当使用emoji增加可读性
4. 如果数据为空，礼貌说明暂无相关数据
5. 回答要简洁，控制在300字以内
6. 对于反馈列表，只展示关键信息（内容摘要、评分、标签）

当前是5分制NPS评分：
- 4-5分：推荐者
- 3分：被动者
- 1-2分：贬损者

${CONSTITUTIONAL_REFUSAL}`;
}

/** 构建 User Prompt，包含用户问题、查询摘要和详细数据 */
function buildUserPrompt(question: string, summary: string, data: unknown): string {
  const dataJson = JSON.stringify(data, null, 2);
  return `用户问题：${question}\n\n查询结果：${summary}\n\n详细数据：\n${dataJson}\n\n请生成回答：`;
}

/** 构建低置信度时的友好提示流 */
function createFallbackStream(): ReadableStream<Uint8Array> {
  const message =
    '抱歉，我没理解您的问题🤔\n\n' +
    '您可以这样问我：\n' +
    '• "NPS总体情况如何？"\n' +
    '• "最近有什么Bug反馈？"\n' +
    '• "评分分布怎么样？"\n' +
    '• "1-2分的反馈有哪些？"\n\n' +
    '输入"帮助"查看更多信息。';

  // 按字符切分，模拟逐字流式效果
  async function* generateChars(): AsyncGenerator<string> {
    for (const char of message) {
      yield char;
    }
  }

  return createSSEStream(generateChars());
}

// ============================================
// 主处理函数
// ============================================

/**
 * POST /api/chat/stream
 * 处理用户问题并以 SSE 格式流式返回答案
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 解析并校验请求体
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[ChatStream] 请求体解析失败', parseError);
      return new Response(
        JSON.stringify({ success: false, error: '请求体必须是合法 JSON', code: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const validation = ChatStreamRequestSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map((e) => e.message).join('; ');
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, code: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { question, history = [] } = validation.data;

    // 2. 清洗用户输入
    const sanitized = sanitizeUserInput(question);
    if (sanitized.blocked) {
      console.warn('[ChatStream] 输入被安全策略拦截:', sanitized.threats);
      return new Response(
        JSON.stringify({
          success: false,
          error: '输入包含不安全内容，请修改后重试',
          code: 400,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. 识别查询意图
    const intent = await chatbot.recognizeIntent(sanitized.cleaned);

    // 4. 置信度不足时直接返回友好提示
    if (intent.intent === 'unknown' || intent.confidence < 0.5) {
      const fallbackStream = createFallbackStream();
      return new Response(fallbackStream, { headers: SSE_HEADERS });
    }

    // 5. 根据意图查询数据
    const queryResult = await chatbot.executeQuery(intent.intent, intent.params);

    // 6. 构建消息列表（System + 历史 + 当前 User Prompt）
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt() },
      ...history,
      {
        role: 'user' as const,
        content: buildUserPrompt(sanitized.cleaned, queryResult.summary, queryResult.data),
      },
    ];

    // 7. 调用流式聊天补全，传递请求信号用于客户端断开时取消
    const stream = await chatCompletionStream(messages, {
      temperature: 0.5,
      maxTokens: 1024,
      abortSignal: request.signal,
      taskType: 'chatStream',
    });

    // 8. 直接返回 SSE 流
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '流式调用失败';
    console.error('[ChatStream] 流式接口异常', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, code: 500 }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
