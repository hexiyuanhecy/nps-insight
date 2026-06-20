/**
 * NPS Insight - 智能问答引擎
 * 支持自然语言问答，基于 feelgood 反馈数据回答用户问题
 *
 * 流程：
 * 1. 意图识别：用 LLM 解析用户问题 → 查询意图 + 参数
 * 2. 数据查询：根据意图从 Mock API / Bitable 获取数据
 * 3. 回答生成：用 LLM 将数据转化为自然语言回复
 */

import { chatCompletion, chatCompletionJSON } from './index';
import { Feedback } from '@/lib/types';

// ============================================
// 类型定义
// ============================================

/** 查询意图类型 */
export type QueryIntent =
  | 'nps_overview'      // NPS总体概况
  | 'score_distribution' // 评分分布
  | 'top_issues'        // TOP问题
  | 'recent_feedback'   // 最新反馈
  | 'tag_stats'         // 标签统计
  | 'trend_analysis'    // 趋势分析
  | 'specific_feedback' // 特定反馈查询
  | 'help'              // 帮助
  | 'unknown';          // 未知意图

/** 意图解析结果 */
export interface IntentResult {
  intent: QueryIntent;
  params: {
    timeRange?: string;     // 时间范围：today, week, month, quarter, year, all
    tagFilter?: string;     // 标签过滤
    scoreFilter?: string;   // 评分过滤：low(1-2), mid(3), high(4-5)
    limit?: number;         // 数量限制
    keywords?: string[];    // 关键词
  };
  confidence: number;
}

/** 查询结果 */
export interface QueryResult {
  intent: QueryIntent;
  data: unknown;
  summary: string;
}

/** 问答上下文 */
export interface ChatContext {
  chatId: string;
  senderId: string;
  messageId: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ============================================
// 意图识别
// ============================================

/**
 * 识别用户查询意图
 * @param question 用户问题
 * @returns 意图解析结果
 */
export async function recognizeIntent(question: string): Promise<IntentResult> {
  const systemPrompt = `你是 NPS Insight 智能问答系统的意图识别引擎。

你的任务是将用户的自然语言问题解析为结构化的查询意图。

支持的意图类型：
- nps_overview: NPS总体概况（如"NPS多少分"、"总体情况"）
- score_distribution: 评分分布（如"各分数段分布"、"几分的人最多"）
- top_issues: TOP问题（如"最多问题是什么"、"主要抱怨"）
- recent_feedback: 最新反馈（如"最近有什么反馈"、"最新的差评"）
- tag_stats: 标签统计（如"Bug有多少"、"功能优化类反馈"）
- trend_analysis: 趋势分析（如"最近有改善吗"、"趋势如何"）
- specific_feedback: 特定反馈查询（如"关于打卡的反馈"、"定位相关"）
- help: 帮助（如"怎么用"、"能做什么"）
- unknown: 无法识别的意图

时间范围参数(timeRange)：
- today: 今天
- week: 本周/最近7天
- month: 本月/最近30天
- quarter: 本季度
- year: 本年
- all: 全部时间（默认）

评分过滤参数(scoreFilter)：
- low: 1-2分（差评）
- mid: 3分（中评）
- high: 4-5分（好评）

请严格按以下JSON格式输出，不要输出其他内容：
{
  "intent": "意图类型",
  "params": {
    "timeRange": "时间范围",
    "tagFilter": "标签过滤",
    "scoreFilter": "评分过滤",
    "limit": 数量限制,
    "keywords": ["关键词1", "关键词2"]
  },
  "confidence": 0.95
}`;

  try {
    const result = await chatCompletionJSON<IntentResult>(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      { temperature: 0.1, maxTokens: 512 }
    );

    // 默认值填充
    return {
      intent: result.intent || 'unknown',
      params: {
        timeRange: result.params?.timeRange || 'all',
        tagFilter: result.params?.tagFilter,
        scoreFilter: result.params?.scoreFilter,
        limit: result.params?.limit || 10,
        keywords: result.params?.keywords || [],
      },
      confidence: result.confidence || 0.5,
    };
  } catch (error) {
    console.error('[ChatBot] 意图识别失败', error);
    return {
      intent: 'unknown',
      params: { limit: 10 },
      confidence: 0,
    };
  }
}

// ============================================
// 数据查询
// ============================================

/**
 * 获取反馈数据（优先从 Mock API，fallback 到内存）
 */
async function fetchFeedbacks(): Promise<Feedback[]> {
  try {
    // 优先尝试从 Mock API 获取
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/mock/feedbacks`, {
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      if (data.feedbacks && Array.isArray(data.feedbacks)) {
        return data.feedbacks.map((f: unknown) => normalizeFeedback(f));
      }
    }
  } catch (error) {
    console.warn('[ChatBot] Mock API 获取失败，使用内存数据', error);
  }

  // Fallback：返回空数组，后续可以接入 Bitable
  return [];
}

/**
 * 规范化反馈数据
 */
function normalizeFeedback(raw: unknown): Feedback {
  const r = raw as Record<string, unknown>;
  return {
    feedbackId: String(r.feedbackId || r.id || ''),
    tenantId: String(r.tenantId || ''),
    tenantName: String(r.tenantName || ''),
    tenantScale: String(r.tenantScale || ''),
    userId: String(r.userId || ''),
    userName: String(r.userName || '匿名用户'),
    createTime: String(r.createTime || r.createdAt || new Date().toISOString()),
    module: String(r.module || '未分类'),
    content: String(r.content || ''),
    npsScore: Number(r.npsScore || r.score || 0),
    source: String(r.source || 'api'),
    tag1: String(r.tag1 || r.tag1Id || ''),
    tag2: String(r.tag2 || r.tag2Id || ''),
    tag3: String(r.tag3 || r.tag3Id || ''),
    confidence: Number(r.confidence || 0),
    tagTime: String(r.tagTime || ''),
    status: (String(r.status || '待审核') as Feedback['status']),
  };
}

/**
 * 过滤反馈数据
 */
function filterFeedbacks(
  feedbacks: Feedback[],
  params: IntentResult['params']
): Feedback[] {
  let result = [...feedbacks];

  // 时间过滤
  if (params.timeRange && params.timeRange !== 'all') {
    const now = new Date();
    let cutoff = new Date();

    switch (params.timeRange) {
      case 'today':
        cutoff.setHours(0, 0, 0, 0);
        break;
      case 'week':
        cutoff.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoff.setDate(now.getDate() - 30);
        break;
      case 'quarter':
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
    }

    result = result.filter((f) => new Date(f.createTime) >= cutoff);
  }

  // 评分过滤（5分制）
  if (params.scoreFilter) {
    switch (params.scoreFilter) {
      case 'low':
        result = result.filter((f) => f.npsScore >= 1 && f.npsScore <= 2);
        break;
      case 'mid':
        result = result.filter((f) => f.npsScore === 3);
        break;
      case 'high':
        result = result.filter((f) => f.npsScore >= 4 && f.npsScore <= 5);
        break;
    }
  }

  // 标签过滤
  if (params.tagFilter) {
    const tagLower = params.tagFilter.toLowerCase();
    result = result.filter(
      (f) =>
        f.tag1?.toLowerCase().includes(tagLower) ||
        f.tag2?.toLowerCase().includes(tagLower) ||
        f.tag3?.toLowerCase().includes(tagLower)
    );
  }

  // 关键词过滤
  if (params.keywords && params.keywords.length > 0) {
    result = result.filter((f) =>
      params.keywords!.some(
        (kw) =>
          f.content.toLowerCase().includes(kw.toLowerCase()) ||
          f.module.toLowerCase().includes(kw.toLowerCase()) ||
          f.tag1?.toLowerCase().includes(kw.toLowerCase())
      )
    );
  }

  return result;
}

/**
 * 执行数据查询
 */
async function executeQuery(
  intent: QueryIntent,
  params: IntentResult['params']
): Promise<QueryResult> {
  const feedbacks = await fetchFeedbacks();
  const filtered = filterFeedbacks(feedbacks, params);

  switch (intent) {
    case 'nps_overview': {
      const total = filtered.length;
      if (total === 0) {
        return { intent, data: { total: 0 }, summary: '暂无反馈数据' };
      }

      // 5分制 NPS 计算：4-5分为推荐者，3分为被动者，1-2分为贬损者
      const promoter = filtered.filter((f) => f.npsScore >= 4).length;
      const passive = filtered.filter((f) => f.npsScore === 3).length;
      const detractor = filtered.filter((f) => f.npsScore <= 2).length;

      // NPS = (推荐者% - 贬损者%) * 100
      const npsScore = Math.round(((promoter - detractor) / total) * 100);
      const avgScore = total > 0 ? (filtered.reduce((s, f) => s + f.npsScore, 0) / total).toFixed(1) : '0';

      return {
        intent,
        data: {
          total,
          npsScore,
          avgScore,
          promoter,
          passive,
          detractor,
          promoterPct: ((promoter / total) * 100).toFixed(1),
          passivePct: ((passive / total) * 100).toFixed(1),
          detractorPct: ((detractor / total) * 100).toFixed(1),
        },
        summary: `共${total}条反馈，NPS得分${npsScore}，平均分${avgScore}分`,
      };
    }

    case 'score_distribution': {
      const distribution = [1, 2, 3, 4, 5].map((score) => ({
        score,
        count: filtered.filter((f) => f.npsScore === score).length,
      }));
      const total = filtered.length;

      return {
        intent,
        data: { distribution, total },
        summary: `评分分布：${distribution.map((d) => `${d.score}分:${d.count}条`).join('，')}`,
      };
    }

    case 'top_issues': {
      // 按标签统计
      const tagCounts: Record<string, number> = {};
      filtered.forEach((f) => {
        const tag = f.tag1 || '未分类';
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      const topIssues = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, params.limit || 5);

      return {
        intent,
        data: { topIssues, total: filtered.length },
        summary: `TOP${topIssues.length}问题：${topIssues.map((t) => `${t[0]}(${t[1]}条)`).join('，')}`,
      };
    }

    case 'recent_feedback': {
      const sorted = filtered
        .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
        .slice(0, params.limit || 5);

      return {
        intent,
        data: { feedbacks: sorted },
        summary: `最新${sorted.length}条反馈已获取`,
      };
    }

    case 'tag_stats': {
      const tagCounts: Record<string, { count: number; avgScore: number; scores: number[] }> = {};

      filtered.forEach((f) => {
        const tag = f.tag1 || '未分类';
        if (!tagCounts[tag]) {
          tagCounts[tag] = { count: 0, avgScore: 0, scores: [] };
        }
        tagCounts[tag].count++;
        tagCounts[tag].scores.push(f.npsScore);
      });

      const stats = Object.entries(tagCounts).map(([tag, data]) => ({
        tag,
        count: data.count,
        avgScore: (data.scores.reduce((a, b) => a + b, 0) / data.count).toFixed(1),
      }));

      return {
        intent,
        data: { stats },
        summary: `标签统计：${stats.map((s) => `${s.tag}:${s.count}条(均分${s.avgScore})`).join('，')}`,
      };
    }

    case 'specific_feedback': {
      const limited = filtered.slice(0, params.limit || 5);
      return {
        intent,
        data: { feedbacks: limited, total: filtered.length },
        summary: `找到${filtered.length}条相关反馈，展示前${limited.length}条`,
      };
    }

    case 'trend_analysis': {
      // 按周分组
      const weekly: Record<string, { count: number; totalScore: number }> = {};
      filtered.forEach((f) => {
        const date = new Date(f.createTime);
        const weekKey = `${date.getFullYear()}-W${Math.ceil((date.getDate()) / 7)}`;
        if (!weekly[weekKey]) {
          weekly[weekKey] = { count: 0, totalScore: 0 };
        }
        weekly[weekKey].count++;
        weekly[weekKey].totalScore += f.npsScore;
      });

      const trend = Object.entries(weekly)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, data]) => ({
          week,
          count: data.count,
          avgScore: (data.totalScore / data.count).toFixed(1),
        }));

      return {
        intent,
        data: { trend },
        summary: `趋势数据：共${trend.length}周数据`,
      };
    }

    default:
      return {
        intent: 'unknown',
        data: null,
        summary: '未能理解您的问题',
      };
  }
}

// ============================================
// 回答生成
// ============================================

/**
 * 生成自然语言回答
 */
async function generateAnswer(
  question: string,
  queryResult: QueryResult,
  context?: ChatContext
): Promise<string> {
  const systemPrompt = `你是 NPS Insight 智能问答助手，专门回答关于 feelgood 用户反馈数据的问题。

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
- 1-2分：贬损者`;

  const dataJson = JSON.stringify(queryResult.data, null, 2);

  try {
    const answer = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户问题：${question}\n\n查询结果：${queryResult.summary}\n\n详细数据：\n${dataJson}\n\n请生成回答：` },
      ],
      { temperature: 0.5, maxTokens: 1024 }
    );

    return answer.trim();
  } catch (error) {
    console.error('[ChatBot] 回答生成失败', error);
    // Fallback：使用模板化回答
    return generateFallbackAnswer(question, queryResult);
  }
}

/**
 * 生成模板化回答（LLM失败时的Fallback）
 */
function generateFallbackAnswer(question: string, result: QueryResult): string {
  const data = result.data as Record<string, unknown>;

  switch (result.intent) {
    case 'nps_overview': {
      return `📊 NPS概况\n\n` +
        `• 总反馈数：${data.total}条\n` +
        `• NPS得分：${data.npsScore}\n` +
        `• 平均分：${data.avgScore}分\n` +
        `• 推荐者(4-5分)：${data.promoter}条(${data.promoterPct}%)\n` +
        `• 被动者(3分)：${data.passive}条(${data.passivePct}%)\n` +
        `• 贬损者(1-2分)：${data.detractor}条(${data.detractorPct}%)`;
    }

    case 'score_distribution': {
      const dist = (data.distribution as Array<{ score: number; count: number }>) || [];
      return `📈 评分分布\n\n` +
        dist.map((d) => `• ${d.score}分：${d.count}条`).join('\n') +
        `\n\n总计：${data.total}条`;
    }

    case 'top_issues': {
      const issues = (data.topIssues as Array<[string, number]>) || [];
      return `🔥 TOP问题\n\n` +
        issues.map((issue, i) => `${i + 1}. ${issue[0]}：${issue[1]}条`).join('\n');
    }

    case 'recent_feedback': {
      const fbs = (data.feedbacks as Feedback[]) || [];
      return `📝 最新反馈\n\n` +
        fbs.map((f, i) =>
          `${i + 1}. [${f.npsScore}分] ${f.tag1 || '未分类'}\n${f.content.substring(0, 50)}...`
        ).join('\n\n');
    }

    case 'tag_stats': {
      const stats = (data.stats as Array<{ tag: string; count: number; avgScore: string }>) || [];
      return `🏷️ 标签统计\n\n` +
        stats.map((s) => `• ${s.tag}：${s.count}条（均分${s.avgScore}）`).join('\n');
    }

    default:
      return '抱歉，我暂时无法回答这个问题。您可以尝试问：\n• NPS总体情况如何？\n• 最近有什么反馈？\n• 最多问题是什么？';
  }
}

// ============================================
// 主入口
// ============================================

/**
 * 处理用户问答
 * @param question 用户问题
 * @param context 对话上下文
 * @returns 回答文本
 */
export async function handleQuestion(
  question: string,
  context?: ChatContext
): Promise<string> {
  console.log(`[ChatBot] 收到问题: ${question}`);

  // 1. 意图识别
  const intent = await recognizeIntent(question);
  console.log(`[ChatBot] 意图识别: ${intent.intent}, 置信度: ${intent.confidence}`);

  if (intent.intent === 'help') {
    return getHelpMessage();
  }

  if (intent.intent === 'unknown' || intent.confidence < 0.5) {
    return '抱歉，我没理解您的问题🤔\n\n您可以这样问我：\n• "NPS总体情况如何？"\n• "最近有什么Bug反馈？"\n• "评分分布怎么样？"\n• "1-2分的反馈有哪些？"\n\n输入"帮助"查看更多信息。';
  }

  // 2. 数据查询
  const queryResult = await executeQuery(intent.intent, intent.params);
  console.log(`[ChatBot] 数据查询: ${queryResult.summary}`);

  // 3. 生成回答
  const answer = await generateAnswer(question, queryResult, context);
  console.log(`[ChatBot] 生成回答: ${answer.substring(0, 100)}...`);

  return answer;
}

/**
 * 获取帮助信息
 */
function getHelpMessage(): string {
  return `🤖 **NPS Insight 问答助手**\n\n` +
    `我可以帮您查询 feelgood 反馈数据，支持以下类型的问题：\n\n` +
    `📊 **概况查询**\n` +
    `• "NPS多少分？" / "总体情况如何？"\n\n` +
    `📈 **分布统计**\n` +
    `• "评分分布怎么样？" / "几分的人最多？"\n\n` +
    `🔥 **问题分析**\n` +
    `• "最多问题是什么？" / "主要抱怨有哪些？"\n\n` +
    `📝 **反馈查询**\n` +
    `• "最近有什么反馈？" / "关于打卡的反馈"\n` +
    `• "1-2分的差评有哪些？"\n\n` +
    `🏷️ **标签统计**\n` +
    `• "Bug类反馈有多少？" / "功能优化类多吗？"\n\n` +
    `⏰ **时间范围**\n` +
    `• 支持：今天、本周、本月、本季度、本年\n` +
    `• 示例："本周的NPS" / "这个月的Bug反馈"`;
}

// ============================================
// 导出
// ============================================

export const chatbot = {
  handleQuestion,
  recognizeIntent,
  executeQuery,
  generateAnswer,
};
