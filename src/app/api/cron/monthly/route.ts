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
 * 
 * Vercel Cron会添加 x-vercel-id 和 x-vercel-signature 头
 * 同时支持手动触发时的 CRON_SECRET 认证
 */
export async function GET(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  // 验证授权：支持两种方式
  // 1. Vercel Cron触发（通过x-vercel-id头判断）
  // 2. 手动触发（通过CRON_SECRET认证）
  const vercelId = request.headers.get('x-vercel-id');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // 如果配置了CRON_SECRET，且不是Vercel Cron触发，则需要验证
  if (cronSecret && !vercelId) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json(
        { success: false, error: '未授权的访问', timestamp: Date.now(), evolution: null, topIssues: null, formulaSync: false, meetingDoc: null, notification: false } as MonthlyTaskResult,
        { status: 401 }
      );
    }
  }

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
