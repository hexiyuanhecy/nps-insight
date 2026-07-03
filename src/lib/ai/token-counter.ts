/**
 * Token 计数器
 * 基于 js-tiktoken 对文本和消息列表进行 Token 估算
 */

import { encodingForModel, getEncoding } from 'js-tiktoken';
import { LLMMessage } from '@/lib/llm/base-provider';

// ============================================
// 模型单价配置（美元 / 1M tokens）
// ============================================

/** 支持的模型单价表 */
interface ModelPricing {
  input: number;
  output: number;
}

/** 默认模型单价（美元 / 1M tokens） */
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'agnes-2.0-flash': { input: 2, output: 6 },
};

/** 默认编码器名称 */
const DEFAULT_ENCODING = 'cl100k_base';

/** 已知模型到编码器的映射 */
const MODEL_ENCODING_MAP: Record<string, string> = {
  'gpt-4': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-3.5-turbo': 'cl100k_base',
};

// ============================================
// 编码器缓存
// ============================================

/** 缓存已创建的编码器，避免重复初始化 */
const encodingCache = new Map<string, ReturnType<typeof getEncoding>>();

/**
 * 获取编码器
 * 优先使用模型对应的编码器，未知模型回退到 cl100k_base
 */
function getEncoder(model?: string): ReturnType<typeof getEncoding> {
  const normalizedModel = (model || '').toLowerCase().trim();
  const encodingName = normalizedModel ? MODEL_ENCODING_MAP[normalizedModel] || DEFAULT_ENCODING : DEFAULT_ENCODING;

  if (!encodingCache.has(encodingName)) {
    try {
      // 优先尝试通过模型名获取编码器
      if (normalizedModel) {
        try {
          const encoder = encodingForModel(normalizedModel as 'gpt-4o');
          encodingCache.set(encodingName, encoder);
          return encoder;
        } catch {
          // 模型名未知时回退到编码名
        }
      }
      encodingCache.set(encodingName, getEncoding(encodingName as 'cl100k_base'));
    } catch {
      // 任何异常都回退到 cl100k_base
      encodingCache.set(encodingName, getEncoding(DEFAULT_ENCODING));
    }
  }

  return encodingCache.get(encodingName) ?? getEncoding(DEFAULT_ENCODING);
}

// ============================================
// Token 计数
// ============================================

/**
 * 统计单段文本的 Token 数
 * @param text 待统计文本
 * @param model 模型名称（用于选择编码器）
 * @returns Token 数量
 */
export function countTokens(text: string, model?: string): number {
  if (!text) return 0;

  try {
    const encoder = getEncoder(model);
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    console.warn('[TokenCounter] Token 编码失败，使用字符数估算:', error);
    // 失败时按字符数粗略估算（英文约 4 字符/token，中文约 1.5 字符/token）
    return Math.ceil(text.length / 3);
  }
}

/**
 * 统计消息列表的 Token 数
 * 每条消息格式为 `${role}\n${content}`
 * @param messages 消息列表
 * @param model 模型名称
 * @returns Token 数量
 */
export function countMessageTokens(messages: LLMMessage[], model?: string): number {
  if (!messages || messages.length === 0) return 0;

  let total = 0;
  for (const message of messages) {
    const text = `${message.role}\n${message.content}`;
    total += countTokens(text, model);
  }
  return total;
}

// ============================================
// 费用估算
// ============================================

/**
 * 估算调用费用（美元）
 * @param inputTokens 输入 Token 数
 * @param outputTokens 输出 Token 数
 * @param model 模型名称
 * @returns 费用（美元）
 */
export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const normalizedModel = (model || '').toLowerCase().trim();
  const pricing = DEFAULT_PRICING[normalizedModel] || DEFAULT_PRICING['agnes-2.0-flash'];

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return Number((inputCost + outputCost).toFixed(6));
}
