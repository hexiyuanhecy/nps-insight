/**
 * AgnesAI 适配模块
 * 使用 OpenAI SDK 接入 AgnesAI，提供AI分析、打标、摘要等能力
 * 支持模型路由：根据任务类型自动选择大小模型和参数
 * 支持：JSON Schema 结构化输出、工具调用（Function Calling）
 */

import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { safeChatCompletionJSON } from './security';
import { countMessageTokens, countTokens, estimateCost } from './token-counter';
import { logAIUsage } from './usage-logger';
import { LLMProviderFactory } from '@/lib/llm/provider-factory';
import { AgnesAIProvider, ToolDefinition, StructuredResponse } from '@/lib/llm/agnesai-provider';
import { AIAnalysisRequest, AITagResult, AIBatchRequest, AIBatchResult, Priority } from '@/lib/types';
import { route, TaskType } from './model-router';
import { queryCache, writeCache, updateCacheStats } from './semantic-cache';

// ============================================
// 客户端创建
// ============================================

/**
 * 创建 AgnesAI 客户端
 * @returns OpenAI 客户端实例
 */
export function createAIClient(): OpenAI {
  const apiKey = process.env.AGNESAI_API_KEY;
  const baseURL = process.env.AGNESAI_BASE_URL || 'https://api-hub.agnes-ai.com/v1';

  if (!apiKey) {
    throw new Error('AGNESAI_API_KEY 未配置，请设置环境变量');
  }

  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 60000, // 60秒超时
    maxRetries: 3,  // 失败重试3次
  });
}

/**
 * 获取全局AI客户端（懒加载）
 */
let globalAIClient: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (!globalAIClient) {
    globalAIClient = createAIClient();
  }
  return globalAIClient;
}

// ============================================
// 模型配置
// ============================================

/** 获取使用的模型名称 */
export function getModel(): string {
  return process.env.AGNESAI_MODEL || 'agnes-2.0-flash';
}

// ============================================
// 核心AI调用
// ============================================

/**
 * 发送聊天补全请求
 * @param messages 消息列表
 * @param options 额外选项，支持 taskType 自动路由到合适的模型
 * @returns AI响应内容
 */
export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
    taskType?: string | TaskType;
  } = {}
): Promise<string> {
  const startTime = Date.now();
  const taskType = options.taskType || 'unknown';

  // 获取路由决策（根据任务类型选择模型和参数）
  let model = getModel();
  let temperature = options.temperature ?? 0.3;
  let maxTokens = options.maxTokens ?? 2048;

  if (taskType !== 'unknown') {
    try {
      const decision = await route(taskType as TaskType);
      model = decision.model;
      temperature = options.temperature ?? decision.temperature;
      maxTokens = options.maxTokens ?? decision.maxTokens;
    } catch (error) {
      console.warn('[AI] 模型路由失败，使用默认配置:', error);
    }
  }

  // 查询语义缓存（仅对支持缓存的任务类型）
  if (taskType !== 'unknown') {
    try {
      const userMessage = messages.find(m => m.role === 'user')?.content || '';
      const cacheResult = await queryCache(userMessage, taskType as TaskType);
      if (cacheResult.hit && cacheResult.answer) {
        console.log(`[AI] 语义缓存命中，跳过 API 调用，相似度: ${cacheResult.similarity?.toFixed(4)}`);
        await updateCacheStats(true);
        return cacheResult.answer;
      }
      await updateCacheStats(false);
    } catch (error) {
      console.warn('[AI] 查询语义缓存失败，继续正常调用:', error);
    }
  }

  const client = getAIClient();
  const inputTokens = countMessageTokens(messages, model);

  try {
    // AgnesAI 2.0 Flash 不支持 response_format 参数，传了会导致返回空内容
    // 改为在 Prompt 中明确要求 JSON 输出
    const requestParams: {
      model: string;
      messages: typeof messages;
      temperature: number;
      max_tokens: number;
      response_format?: { type: 'json_object' };
    } = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    // 仅对支持 response_format 的模型传递此参数
    // AgnesAI 2.0 Flash 当前不支持，跳过
    if (options.responseFormat && model !== 'agnes-2.0-flash') {
      requestParams.response_format = options.responseFormat;
    }

    const response = await client.chat.completions.create(requestParams);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI返回内容为空');
    }

    // 写入语义缓存（仅对支持缓存的任务类型）
    if (taskType !== 'unknown') {
      try {
        const userMessage = messages.find(m => m.role === 'user')?.content || '';
        await writeCache(userMessage, content, taskType as TaskType);
      } catch (error) {
        console.warn('[AI] 写入语义缓存失败:', error);
      }
    }

    // 记录 Token 消耗与耗时
    const outputTokens = response.usage?.completion_tokens ?? countTokens(content, model);
    const totalTokens = inputTokens + outputTokens;
    const durationMs = Date.now() - startTime;
    const costUsd = estimateCost(inputTokens, outputTokens, model);

    await logAIUsage({
      timestamp: startTime,
      model,
      taskType,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs,
      costUsd,
    });

    return content;
  } catch (error) {
    console.error('[AI] 聊天补全请求失败', error);
    throw error;
  }
}

/**
 * 包装 ReadableStream，在流结束或取消时记录用量日志
 */
function wrapStreamWithUsageLogging(
  stream: ReadableStream<Uint8Array>,
  logBase: {
    timestamp: number;
    model: string;
    taskType: string;
    inputTokens: number;
  }
): ReadableStream<Uint8Array> {
  const startTime = logBase.timestamp;
  const reader = stream.getReader();

  const logUsage = async (): Promise<void> => {
    const durationMs = Date.now() - startTime;
    await logAIUsage({
      timestamp: startTime,
      model: logBase.model,
      taskType: logBase.taskType,
      inputTokens: logBase.inputTokens,
      outputTokens: 0,
      totalTokens: logBase.inputTokens,
      durationMs,
      costUsd: 0,
      isStream: true,
    });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await logUsage();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        await logUsage();
      }
    },
    async cancel() {
      await reader.cancel();
      await logUsage();
    },
  });
}

/**
 * 发送流式聊天补全请求
 * 统一使用 LLMProviderFactory 创建 Provider，返回 SSE 格式字节流
 * 支持模型路由：根据 taskType 自动选择模型和参数
 * @param messages 消息列表
 * @param options 额外选项，支持 temperature、maxTokens、abortSignal、taskType
 * @returns SSE 格式的 ReadableStream
 */
export async function chatCompletionStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
    taskType?: string | TaskType;
  }
): Promise<ReadableStream<Uint8Array>> {
  const startTime = Date.now();
  const taskType = options?.taskType || 'unknown';

  // 获取路由决策（根据任务类型选择模型和参数）
  let model = getModel();
  let temperature = options?.temperature ?? 0.3;
  let maxTokens = options?.maxTokens ?? 2048;

  if (taskType !== 'unknown') {
    try {
      const decision = await route(taskType as TaskType);
      model = decision.model;
      temperature = options?.temperature ?? decision.temperature;
      maxTokens = options?.maxTokens ?? decision.maxTokens;
    } catch (error) {
      console.warn('[AI] 流式请求模型路由失败，使用默认配置:', error);
    }
  }

  const inputTokens = countMessageTokens(messages, model);

  try {
    const provider = LLMProviderFactory.createFromEnv();
    const stream = await provider.chatStream(messages, {
      temperature,
      maxTokens,
      abortSignal: options?.abortSignal,
    });
    return wrapStreamWithUsageLogging(stream, { timestamp: startTime, model, taskType, inputTokens });
  } catch (error) {
    console.error('[AI] 流式聊天补全请求失败', error);
    throw error;
  }
}

/**
 * 发送结构化JSON请求
 * 支持可选的 Zod Schema 校验；未提供 schema 时保持原有 JSON.parse 行为
 * @param messages 消息列表
 * @param options 额外选项，可包含 zod schema
 * @returns 解析后的JSON对象
 */
export async function chatCompletionJSON<T = unknown>(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    schema?: ZodSchema<T>;
    taskType?: string;
  } = {}
): Promise<T> {
  if (options.schema) {
    return safeChatCompletionJSON(messages, options.schema, options);
  }

  const content = await chatCompletion(messages, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: { type: 'json_object' },
    taskType: options.taskType,
  });

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    console.error('[AI] JSON解析失败', error);
    console.error('[AI] 原始内容:', content);
    throw new Error('AI返回的JSON格式无效');
  }
}

/**
 * 带 Zod Schema 校验的 JSON 请求（推荐新业务使用）
 * @param messages 消息列表
 * @param schema Zod Schema
 * @param options 额外选项
 * @returns 校验通过的 JSON 对象
 */
export async function chatCompletionJSONSafe<T = unknown>(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  schema: ZodSchema<T>,
  options: {
    temperature?: number;
    maxTokens?: number;
    taskType?: string;
  } = {}
): Promise<T> {
  return safeChatCompletionJSON(messages, schema, options);
}

// ============================================
// JSON Schema 结构化输出（替代 Zod + 重试）
// ============================================

/**
 * 使用 JSON Schema 进行结构化输出
 * 利用 AgnesAI 的原生 JSON Schema 支持，一次调用直接返回符合 schema 的 JSON
 * 优势：不需要重试，减少 token 消耗，输出格式更稳定
 * @param messages 消息列表
 * @param schema JSON Schema 对象
 * @param options 额外选项
 * @returns 解析后的 JSON 对象
 */
export async function chatCompletionJsonSchema<T = unknown>(
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  schema: Record<string, unknown>,
  options: {
    temperature?: number;
    maxTokens?: number;
    taskType?: string;
  } = {}
): Promise<T> {
  const startTime = Date.now();
  const taskType = options.taskType || 'jsonSchema';

  let model = getModel();
  let temperature = options.temperature ?? 0.3;
  let maxTokens = options.maxTokens ?? 4096;

  if (taskType !== 'unknown') {
    try {
      const decision = await route(taskType as TaskType);
      model = decision.model;
      temperature = options.temperature ?? decision.temperature;
      maxTokens = options.maxTokens ?? decision.maxTokens;
    } catch (error) {
      console.warn('[AI] JSON Schema 模型路由失败，使用默认配置:', error);
    }
  }

  const inputTokens = countMessageTokens(messages, model);

  try {
    const provider = new AgnesAIProvider();
    const response = await provider.chatWithJsonSchema<T>(messages, schema, {
      temperature,
      maxTokens,
    });

    if (!response.data) {
      throw new Error('AI返回内容为空');
    }

    const outputTokens = response.usage?.completion_tokens ?? countTokens(response.content, model);
    const totalTokens = inputTokens + outputTokens;
    const durationMs = Date.now() - startTime;
    const costUsd = estimateCost(inputTokens, outputTokens, model);

    await logAIUsage({
      timestamp: startTime,
      model,
      taskType: `${taskType}_json_schema`,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs,
      costUsd,
    });

    return response.data;
  } catch (error) {
    console.error('[AI] JSON Schema 请求失败', error);
    throw error;
  }
}

// ============================================
// 工具调用（Function Calling）
// ============================================

/**
 * 使用工具调用进行对话
 * AI 可以调用工具函数来查询数据、创建资源等
 * @param messages 消息列表
 * @param tools 工具定义列表
 * @param options 额外选项
 * @returns 包含工具调用结果或直接回答的响应
 */
export async function chatCompletionWithTools(
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
  tools: ToolDefinition[],
  options: {
    temperature?: number;
    maxTokens?: number;
    taskType?: string;
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  } = {}
): Promise<StructuredResponse> {
  const startTime = Date.now();
  const taskType = options.taskType || 'toolCalling';

  let model = getModel();
  let temperature = options.temperature ?? 0.3;
  let maxTokens = options.maxTokens ?? 4096;

  if (taskType !== 'unknown') {
    try {
      const decision = await route(taskType as TaskType);
      model = decision.model;
      temperature = options.temperature ?? decision.temperature;
      maxTokens = options.maxTokens ?? decision.maxTokens;
    } catch (error) {
      console.warn('[AI] 工具调用模型路由失败，使用默认配置:', error);
    }
  }

  const inputTokens = countMessageTokens(messages, model);

  try {
    const provider = new AgnesAIProvider();
    const response = await provider.chatWithTools(messages, tools, {
      temperature,
      maxTokens,
      toolChoice: options.toolChoice,
    });

    const outputTokens = response.usage?.completion_tokens ?? countTokens(response.content, model);
    const totalTokens = inputTokens + outputTokens;
    const durationMs = Date.now() - startTime;
    const costUsd = estimateCost(inputTokens, outputTokens, model);

    await logAIUsage({
      timestamp: startTime,
      model,
      taskType: `${taskType}_tool_calling`,
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs,
      costUsd,
    });

    return response;
  } catch (error) {
    console.error('[AI] 工具调用请求失败', error);
    throw error;
  }
}

// ============================================
// 便捷导出
// ============================================

export const aiClient = {
  chatCompletion,
  chatCompletionStream,
  chatCompletionJSON,
  chatCompletionJSONSafe,
  chatCompletionJsonSchema,
  chatCompletionWithTools,
  getModel,
};
