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
 * 适配腾讯云定时触发器：
 * 1. 腾讯云定时触发器会带特定User-Agent
 * 2. 手动触发可通过 CRON_SECRET 或 X-Cron-Secret 认证
 * 3. 本地开发绕过认证
 */
export async function GET(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  // 验证授权
  const userAgent = request.headers.get('user-agent') || '';
  const isTencentCloud = userAgent.includes('SCF') || userAgent.includes('TencentCloud');
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';

  if (isTencentCloud || isDev) {
    // 继续执行
  } else if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret && cronSecretHeader !== cronSecret) {
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
  const userAgent = request.headers.get('user-agent') || '';
  const isTencentCloud = userAgent.includes('SCF') || userAgent.includes('TencentCloud');
  const authHeader = request.headers.get('authorization');
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';

  if (isTencentCloud || isDev) {
    // 继续执行
  } else if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret && cronSecretHeader !== cronSecret) {
      return NextResponse.json(
        { success: false, error: '未授权', timestamp: Date.now(), evolution: null, topIssues: null, formulaSync: false, meetingDoc: null, notification: false } as MonthlyTaskResult,
        { status: 401 }
      );
    }
  }

  const result = await runMonthlyTask();
  return NextResponse.json(result);
}
