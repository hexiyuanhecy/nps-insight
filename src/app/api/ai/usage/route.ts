/**
 * AI 用量统计 API
 * GET /api/ai/usage?month=YYYY-MM
 * 返回指定月份的 AI 调用用量统计
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAIUsageStats } from '@/lib/ai/usage-logger';

/** 美元兑人民币汇率（固定值，后续可配置） */
const USD_TO_CNY_RATE = 7.3;

/**
 * 校验月份格式是否为 YYYY-MM
 */
function isValidMonthKey(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

/**
 * 获取当前月份键（YYYY-MM）
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get('month');
    const month = monthParam || getCurrentMonthKey();

    if (!isValidMonthKey(month)) {
      return NextResponse.json(
        { success: false, error: '月份格式错误，应为 YYYY-MM', code: 400 },
        { status: 400 }
      );
    }

    const stats = await getAIUsageStats(month);

    return NextResponse.json({
      success: true,
      data: {
        month,
        calls: stats.calls,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        totalTokens: stats.totalTokens,
        costUsd: stats.costUsd,
        costCny: Number((stats.costUsd * USD_TO_CNY_RATE).toFixed(2)),
        byTaskType: stats.byTaskType,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/usage] 获取用量统计失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}
