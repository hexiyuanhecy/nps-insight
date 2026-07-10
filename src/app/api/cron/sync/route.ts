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
 * 由腾讯云定时触发器调用
 *
 * 适配腾讯云定时触发器认证：
 * 1. 腾讯云定时触发器会带 "TencentCloudEvent" 或特定用户代理头
 * 2. 手动触发可通过 CRON_SECRET 或 X-Cron-Secret 头认证
 * 3. 本地开发可绕过认证
 */
export async function GET(request: NextRequest) {
  try {
    // 验证授权：支持多种方式
    // 1. 腾讯云定时触发器（通过User-Agent或特殊头识别）
    // 2. 手动触发（通过CRON_SECRET或X-Cron-Secret认证）
    // 3. 本地开发（NODE_ENV=development）
    const userAgent = request.headers.get('user-agent') || '';
    const isTencentCloud = userAgent.includes('SCF') || userAgent.includes('TencentCloud');
    const authHeader = request.headers.get('authorization');
    const cronSecretHeader = request.headers.get('x-cron-secret');
    const cronSecret = process.env.CRON_SECRET;
    const isDev = process.env.NODE_ENV === 'development';

    // 腾讯云定时触发器 或 本地开发 直接放行
    if (isTencentCloud || isDev) {
      // 继续执行
    } else if (cronSecret) {
      // 配置了密钥时，验证密钥
      const bearerToken = authHeader?.replace('Bearer ', '');
      if (bearerToken !== cronSecret && cronSecretHeader !== cronSecret) {
        return NextResponse.json(
          { success: false, error: '未授权的访问' },
          { status: 401 }
        );
      }
    }

    console.log('[Cron] 定时同步任务开始执行（腾讯云触发器）');

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
    // 验证授权：支持多种方式
    // 1. 腾讯云定时触发器（通过User-Agent识别）
    // 2. 手动触发（通过CRON_SECRET或X-Cron-Secret认证）
    // 3. 本地开发（NODE_ENV=development）
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
