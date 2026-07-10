/**
 * 定时同步任务API
 * GET /api/cron/sync - 由Vercel Cron触发
 * POST /api/cron/sync - 手动触发同步（用于测试）
 *
 * 同步逻辑已移至 sync-task.ts，避免 HTTP fetch 死锁问题
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSyncTask } from './sync-task';

// Increase timeout for sync task (200 records + AI tagging + notification)
export const maxDuration = 120;

/**
 * GET /api/cron/sync
 * Vercel Cron定时触发
 * 
 * Vercel Cron会添加 x-vercel-id 和 x-vercel-signature 头
 * 同时支持手动触发时的 CRON_SECRET 认证
 */
export async function GET(request: NextRequest) {
  try {
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
          { success: false, error: '未授权的访问' },
          { status: 401 }
        );
      }
    }

    console.log('[Cron] 定时同步任务开始执行');

    const result = await runSyncTask();

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Cron] 定时任务执行失败', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/sync
 * 手动触发同步（用于测试）
 */
export async function POST(request: NextRequest) {
  try {
    // 验证授权：支持三种方式
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
          { success: false, error: '未授权的访问' },
          { status: 401 }
        );
      }
    }

    console.log('[Cron] 手动触发同步任务');

    const result = await runSyncTask();

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Cron] 手动同步失败', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
