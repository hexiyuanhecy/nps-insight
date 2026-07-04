/**
 * 模型路由（大小模型分流）
 * 根据任务类型自动选择合适的模型和参数
 * 轻量任务用小模型/低配置，重量任务用大模型/高配置
 */

import { getValue, setValue } from '../storage/kv-storage';

// ============================================
// 任务类型定义
// ============================================

/** AI 任务类型枚举 */
export const TASK_TYPES = {
  TAGGING: 'tagging',
  EVOLUTION: 'evolution',
  INTENT: 'intent',
  ANSWER: 'answer',
  SUMMARY: 'summary',
  ANALYZE_FEEDBACK: 'analyzeFeedback',
  BATCH_ANALYZE: 'batchAnalyzeFeedbacks',
} as const;

/** 任务类型 */
export type TaskType = (typeof TASK_TYPES)[keyof typeof TASK_TYPES];

/** 任务类型分类 */
export const TASK_CATEGORIES: Record<TaskType, 'heavy' | 'light'> = {
  [TASK_TYPES.TAGGING]: 'heavy',
  [TASK_TYPES.EVOLUTION]: 'heavy',
  [TASK_TYPES.BATCH_ANALYZE]: 'heavy',
  [TASK_TYPES.ANALYZE_FEEDBACK]: 'heavy',
  [TASK_TYPES.INTENT]: 'light',
  [TASK_TYPES.ANSWER]: 'light',
  [TASK_TYPES.SUMMARY]: 'light',
};

// ============================================
// 默认配置
// ============================================

/** 默认模型配置 */
const DEFAULT_MODEL_CONFIG: ModelRouteConfig = {
  routingEnabled: true,
  heavyModel: process.env.AGNESAI_MODEL || 'agnes-2.0-flash',
  lightModel: process.env.AGNESAI_MODEL || 'agnes-2.0-flash',
  lightTemperature: 0.1,
  lightMaxTokens: 512,
  heavyTemperature: 0.3,
  heavyMaxTokens: 8192,
  overrides: {},
};

/** 模型路由配置 */
export interface ModelRouteConfig {
  /** 是否启用路由 */
  routingEnabled: boolean;
  /** 重量任务使用的模型 */
  heavyModel: string;
  /** 轻量任务使用的模型 */
  lightModel: string;
  /** 轻量任务温度参数 */
  lightTemperature: number;
  /** 轻量任务最大 Token 数 */
  lightMaxTokens: number;
  /** 重量任务温度参数 */
  heavyTemperature: number;
  /** 重量任务最大 Token 数 */
  heavyMaxTokens: number;
  /** 按任务类型的覆盖配置 */
  overrides: Partial<Record<TaskType, { model?: string; temperature?: number; maxTokens?: number }>>;
}

/** 路由决策结果 */
export interface RouteDecision {
  /** 选择的模型 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 任务分类 */
  category: 'heavy' | 'light';
  /** 是否使用了路由（还是回退到默认） */
  routed: boolean;
}

// ============================================
// KV 存储键
// ============================================

const ROUTE_CONFIG_KEY = 'ai:model-route-config';

// ============================================
// 配置缓存
// ============================================

let cachedConfig: ModelRouteConfig | null = null;
let configLastLoaded = 0;
const CONFIG_CACHE_TTL_MS = 60000; // 1 分钟缓存

/**
 * 获取当前路由配置（带缓存）
 */
export async function getRouteConfig(): Promise<ModelRouteConfig> {
  const now = Date.now();

  if (cachedConfig && now - configLastLoaded < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const raw = await getValue(ROUTE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelRouteConfig>;
      cachedConfig = { ...DEFAULT_MODEL_CONFIG, ...parsed };
    } else {
      cachedConfig = { ...DEFAULT_MODEL_CONFIG };
    }
  } catch (error) {
    console.warn('[ModelRouter] 读取路由配置失败，使用默认配置:', error);
    cachedConfig = { ...DEFAULT_MODEL_CONFIG };
  }

  configLastLoaded = now;
  return cachedConfig;
}

/**
 * 更新路由配置
 * @param config 新配置（增量更新）
 */
export async function updateRouteConfig(config: Partial<ModelRouteConfig>): Promise<void> {
  const current = await getRouteConfig();
  const merged = { ...current, ...config };

  try {
    await setValue(ROUTE_CONFIG_KEY, JSON.stringify(merged));
    cachedConfig = merged;
    configLastLoaded = Date.now();
    console.log('[ModelRouter] 路由配置已更新:', merged);
  } catch (error) {
    console.error('[ModelRouter] 更新路由配置失败:', error);
    throw error;
  }
}

/**
 * 清除配置缓存（触发重新加载）
 */
export function invalidateRouteConfigCache(): void {
  cachedConfig = null;
  configLastLoaded = 0;
}

// ============================================
// 路由决策
// ============================================

/**
 * 根据任务类型获取路由决策
 * @param taskType 任务类型
 * @returns 路由决策（模型、温度、最大 Token）
 */
export async function route(taskType: TaskType): Promise<RouteDecision> {
  const config = await getRouteConfig();

  // 如果路由未启用，返回默认配置
  if (!config.routingEnabled) {
    return {
      model: DEFAULT_MODEL_CONFIG.heavyModel,
      temperature: DEFAULT_MODEL_CONFIG.heavyTemperature,
      maxTokens: DEFAULT_MODEL_CONFIG.heavyMaxTokens,
      category: 'heavy',
      routed: false,
    };
  }

  // 获取任务分类
  const category = TASK_CATEGORIES[taskType] || 'heavy';

  // 检查是否有任务级别的覆盖配置
  const override = config.overrides[taskType];

  let model: string;
  let temperature: number;
  let maxTokens: number;

  if (override?.model) {
    model = override.model;
  } else {
    model = category === 'light' ? config.lightModel : config.heavyModel;
  }

  if (override?.temperature !== undefined) {
    temperature = override.temperature;
  } else {
    temperature = category === 'light' ? config.lightTemperature : config.heavyTemperature;
  }

  if (override?.maxTokens !== undefined) {
    maxTokens = override.maxTokens;
  } else {
    maxTokens = category === 'light' ? config.lightMaxTokens : config.heavyMaxTokens;
  }

  return {
    model,
    temperature,
    maxTokens,
    category,
    routed: true,
  };
}

/**
 * 根据任务类型获取默认参数
 * @param taskType 任务类型
 * @returns 温度和最大 Token 参数
 */
export async function getDefaultParams(taskType: TaskType): Promise<{ temperature: number; maxTokens: number }> {
  const decision = await route(taskType);
  return {
    temperature: decision.temperature,
    maxTokens: decision.maxTokens,
  };
}

// ============================================
// 便捷方法
// ============================================

/**
 * 判断任务是否为轻量任务
 */
export function isLightTask(taskType: TaskType): boolean {
  return TASK_CATEGORIES[taskType] === 'light';
}

/**
 * 判断任务是否为重量任务
 */
export function isHeavyTask(taskType: TaskType): boolean {
  return TASK_CATEGORIES[taskType] === 'heavy';
}
