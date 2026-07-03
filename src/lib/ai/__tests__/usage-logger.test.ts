/**
 * AI 用量日志单元测试
 * 使用 KV 存储的内存降级模式验证日志记录、统计与清理
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  logAIUsage,
  getAIUsageStats,
  getRecentLogs,
  clearUsageLogs,
  AIUsageLog,
} from '../usage-logger';

/** 构建测试日志 */
function buildLog(overrides: Partial<AIUsageLog> = {}): AIUsageLog {
  return {
    timestamp: new Date('2026-07-01T00:00:00.000Z').getTime(),
    model: 'agnes-2.0-flash',
    taskType: 'tagging',
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    durationMs: 200,
    costUsd: 0.001,
    ...overrides,
  };
}

describe('logAIUsage', () => {
  beforeEach(async () => {
    await clearUsageLogs('2026-07');
  });

  it('应将日志追加到 KV 存储', async () => {
    const log = buildLog();
    await logAIUsage(log);

    const stats = await getAIUsageStats('2026-07');
    expect(stats.calls).toBe(1);
    expect(stats.inputTokens).toBe(log.inputTokens);
  });

  it('应保留已有日志并追加新日志', async () => {
    await logAIUsage(buildLog({ taskType: 'chat' }));
    await logAIUsage(buildLog({ taskType: 'tagging' }));

    const stats = await getAIUsageStats('2026-07');
    expect(stats.calls).toBe(2);
    expect(stats.byTaskType.chat.calls).toBe(1);
    expect(stats.byTaskType.tagging.calls).toBe(1);
  });

  it('超过 1000 条时应删除最早日志', async () => {
    const logs: AIUsageLog[] = Array.from({ length: 1001 }, (_, index) =>
      buildLog({ timestamp: new Date('2026-07-01T00:00:00.000Z').getTime() + index })
    );

    // 一次性写入 1001 条日志
    for (const log of logs) {
      await logAIUsage(log);
    }

    const recent = await getRecentLogs(1000);
    expect(recent).toHaveLength(1000);
    // 最早的一条应被移除
    expect(recent[0].timestamp).toBe(logs[1].timestamp);
  });
});

describe('getAIUsageStats', () => {
  beforeEach(async () => {
    await clearUsageLogs('2026-07');
  });

  it('无日志时应返回零值统计', async () => {
    const stats = await getAIUsageStats('2026-07');

    expect(stats.calls).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.costUsd).toBe(0);
    expect(Object.keys(stats.byTaskType)).toHaveLength(0);
  });

  it('应按任务类型统计用量', async () => {
    await logAIUsage(buildLog({ taskType: 'tagging', inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.001 }));
    await logAIUsage(buildLog({ taskType: 'tagging', inputTokens: 200, outputTokens: 100, totalTokens: 300, costUsd: 0.002 }));
    await logAIUsage(buildLog({ taskType: 'chat', inputTokens: 50, outputTokens: 50, totalTokens: 100, costUsd: 0.0005 }));

    const stats = await getAIUsageStats('2026-07');

    expect(stats.calls).toBe(3);
    expect(stats.inputTokens).toBe(350);
    expect(stats.outputTokens).toBe(200);
    expect(stats.totalTokens).toBe(550);
    expect(stats.costUsd).toBe(0.0035);
    expect(stats.byTaskType.tagging).toEqual({ calls: 2, tokens: 450 });
    expect(stats.byTaskType.chat).toEqual({ calls: 1, tokens: 100 });
  });

  it('缺失 taskType 时应归类为 unknown', async () => {
    await logAIUsage(buildLog({ taskType: '' }));

    const stats = await getAIUsageStats('2026-07');

    expect(stats.byTaskType.unknown).toEqual({ calls: 1, tokens: 150 });
  });
});

describe('getRecentLogs', () => {
  beforeEach(async () => {
    await clearUsageLogs();
  });

  it('应返回最近 N 条日志', async () => {
    const now = Date.now();
    for (let index = 0; index < 10; index += 1) {
      await logAIUsage(buildLog({ timestamp: now + index, taskType: `task-${index}` }));
    }

    const recent = await getRecentLogs(3);

    expect(recent).toHaveLength(3);
    expect(recent[0].taskType).toBe('task-7');
    expect(recent[2].taskType).toBe('task-9');
  });

  it('默认应返回 50 条', async () => {
    const now = Date.now();
    for (let index = 0; index < 100; index += 1) {
      await logAIUsage(buildLog({ timestamp: now + index }));
    }

    const recent = await getRecentLogs();

    expect(recent).toHaveLength(50);
  });

  it('无日志时应返回空数组', async () => {
    const recent = await getRecentLogs(10);

    expect(recent).toEqual([]);
  });
});

describe('clearUsageLogs', () => {
  it('应清空指定月份日志', async () => {
    await logAIUsage(buildLog());
    await clearUsageLogs('2026-07');

    const stats = await getAIUsageStats('2026-07');
    expect(stats.calls).toBe(0);
  });
});
