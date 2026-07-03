/**
 * AgnesAI 适配模块
 * 使用 OpenAI SDK 接入 AgnesAI，提供AI分析、打标、摘要等能力
 */

import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { safeChatCompletionJSON } from './security';
import { LLMProviderFactory } from '@/lib/llm/provider-factory';
import { AIAnalysisRequest, AITagResult, AIBatchRequest, AIBatchResult, Priority } from '@/lib/types';

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
 * @param options 额外选项
 * @returns AI响应内容
 */
export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
  } = {}
): Promise<string> {
  const client = getAIClient();
  const model = getModel();

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
      response_format: options.responseFormat,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI返回内容为空');
    }

    return content;
  } catch (error) {
    console.error('[AI] 聊天补全请求失败', error);
    throw error;
  }
}

/**
 * 发送流式聊天补全请求
 * 统一使用 LLMProviderFactory 创建 Provider，返回 SSE 格式字节流
 * @param messages 消息列表
 * @param options 额外选项，支持 temperature、maxTokens、abortSignal
 * @returns SSE 格式的 ReadableStream
 */
export async function chatCompletionStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    abortSignal?: AbortSignal;
  }
): Promise<ReadableStream<Uint8Array>> {
  try {
    const provider = LLMProviderFactory.createFromEnv();
    return await provider.chatStream(messages, options);
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
  } = {}
): Promise<T> {
  if (options.schema) {
    return safeChatCompletionJSON(messages, options.schema, options);
  }

  const content = await chatCompletion(messages, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: { type: 'json_object' },
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
// 便捷导出
// ============================================

export const aiClient = {
  chatCompletion,
  chatCompletionStream,
  chatCompletionJSON,
  chatCompletionJSONSafe,
  getModel,
};
