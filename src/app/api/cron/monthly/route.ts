/**
 * 月度任务 API
 * 执行顺序：标签自进化 → Top问题生成 → 公式同步 → 会议文档 → 通知
 *
 * 多用户支持：
 * - 遍历所有 KV 中的配置，为每个用户执行月度任务
 * - 若无 KV 配置，回退到环境变量配置（向后兼容）
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMonthlyTask, MonthlyTaskResult } from '@/lib/monthly-task-runner';

export type { MonthlyTaskResult };

/**
 * GET /api/cron/monthly
 * 执行月度任务
 */
export async function GET(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  const result = await runMonthlyTask();
  return NextResponse.json(result);
}

/**
 * POST /api/cron/monthly
 * 手动触发月度任务
 */
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  // 验证授权
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json(
        { success: false, error: '未授权', timestamp: Date.now(), evolution: null, topIssues: null, formulaSync: false, meetingDoc: null, notification: false } as MonthlyTaskResult,
        { status: 401 }
      );
    }
  }

  const result = await runMonthlyTask();
  return NextResponse.json(result);
}
