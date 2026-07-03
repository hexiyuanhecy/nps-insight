/**
 * AI 调用用量日志
 * 记录每次 AI 调用的 Token 消耗、耗时与费用估算
 */

import { getValue, setValue } from '../storage/kv-storage';

// ============================================
// 类型定义
// ============================================

/** AI 调用日志条目 */
export interface AIUsageLog {
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 使用的模型 */
  model: string;
  /** 任务类型标识 */
  taskType: string;
  /** 输入 Token 数 */
  inputTokens: number;
  /** 输出 Token 数 */
  outputTokens: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 调用耗时（毫秒） */
  durationMs: number;
  /** 估算费用（美元） */
  costUsd: number;
  /** 是否为流式调用 */
  isStream?: boolean;
}

/** 用量统计结果 */
export interface AIUsageStats {
  /** 调用次数 */
  calls: number;
  /** 输入 Token 总数 */
  inputTokens: number;
  /** 输出 Token 总数 */
  outputTokens: number;
  /** 总 Token 数 */
  totalTokens: number;
  /** 总费用（美元） */
  costUsd: number;
  /** 按任务类型汇总 */
  byTaskType: Record<string, { calls: number; tokens: number }>;
}

// ============================================
// 常量
// ============================================

/** 单个月份最多保留的日志条数 */
const MAX_LOGS_PER_MONTH = 1000;

/** 日志键前缀 */
const USAGE_KEY_PREFIX = 'ai:usage:';

// ============================================
// 工具函数
// ============================================

/**
 * 获取当前月份键（YYYY-MM）
 * @param date 日期对象
 * @returns 月份键
 */
function getMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 构建 KV 存储键
 * @param monthKey 月份键
 * @returns 完整键名
 */
function buildUsageKey(monthKey: string): string {
  return `${USAGE_KEY_PREFIX}${monthKey}`;
}

/**
 * 读取指定月份的日志列表
 * @param monthKey 月份键
 * @returns 日志数组
 */
async function readLogs(monthKey: string): Promise<AIUsageLog[]> {
  try {
    const raw = await getValue(buildUsageKey(monthKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AIUsageLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`[UsageLogger] 读取 ${monthKey} 日志失败:`, error);
    return [];
  }
}

/**
 * 写入指定月份的日志列表
 * @param monthKey 月份键
 * @param logs 日志数组
 */
async function writeLogs(monthKey: string, logs: AIUsageLog[]): Promise<void> {
  try {
    await setValue(buildUsageKey(monthKey), JSON.stringify(logs));
  } catch (error) {
    console.warn(`[UsageLogger] 写入 ${monthKey} 日志失败:`, error);
  }
}

// ============================================
// 核心方法
// ============================================

/**
 * 记录一次 AI 调用日志
 * @param log 日志对象
 */
export async function logAIUsage(log: AIUsageLog): Promise<void> {
  try {
    const monthKey = getMonthKey(new Date(log.timestamp));
    const logs = await readLogs(monthKey);

    logs.push(log);

    // 超过最大条数时，删除最早的日志
    if (logs.length > MAX_LOGS_PER_MONTH) {
      logs.splice(0, logs.length - MAX_LOGS_PER_MONTH);
    }

    await writeLogs(monthKey, logs);
  } catch (error) {
    console.warn('[UsageLogger] 记录 AI 调用日志失败:', error);
  }
}

/**
 * 获取指定月份的用量统计
 * @param monthKey 月份键（YYYY-MM），默认当前月
 * @returns 用量统计
 */
export async function getAIUsageStats(monthKey?: string): Promise<AIUsageStats> {
  const targetMonth = monthKey || getMonthKey();
  const logs = await readLogs(targetMonth);

  const stats: AIUsageStats = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    byTaskType: {},
  };

  for (const log of logs) {
    stats.calls += 1;
    stats.inputTokens += log.inputTokens;
    stats.outputTokens += log.outputTokens;
    stats.totalTokens += log.totalTokens;
    stats.costUsd += log.costUsd;

    const taskType = log.taskType || 'unknown';
    if (!stats.byTaskType[taskType]) {
      stats.byTaskType[taskType] = { calls: 0, tokens: 0 };
    }
    stats.byTaskType[taskType].calls += 1;
    stats.byTaskType[taskType].tokens += log.totalTokens;
  }

  // 费用保留 6 位小数，避免浮点累加误差过大
  stats.costUsd = Number(stats.costUsd.toFixed(6));

  return stats;
}

/**
 * 获取最近 N 条日志
 * @param limit 返回条数，默认 50
 * @returns 最近日志列表
 */
export async function getRecentLogs(limit: number = 50): Promise<AIUsageLog[]> {
  const monthKey = getMonthKey();
  const logs = await readLogs(monthKey);

  if (logs.length === 0) return [];
  return logs.slice(-Math.max(1, limit));
}

/**
 * 清除指定月份或当前月的日志
 * @param monthKey 月份键（YYYY-MM），默认当前月
 */
export async function clearUsageLogs(monthKey?: string): Promise<void> {
  const targetMonth = monthKey || getMonthKey();
  try {
    await setValue(buildUsageKey(targetMonth), JSON.stringify([]));
  } catch (error) {
    console.warn(`[UsageLogger] 清除 ${targetMonth} 日志失败:`, error);
  }
}
