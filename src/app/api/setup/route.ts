/**
 * 系统初始化API
 * POST /api/setup - 创建多维表格及表结构
 */

import { NextRequest, NextResponse } from 'next/server';
import { runSetup } from '@/lib/feishu/setup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/setup
 * 执行系统初始化，创建多维表格和表结构
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[API] 收到系统初始化请求');

    // 获取 ownerId
    const ownerId = process.env.DEFAULT_OWNER_ID || 'default_owner';
    console.log('[API] 使用 ownerId:', ownerId);

    // 执行初始化
    const result = await runSetup(ownerId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || '初始化失败',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        bitableToken: result.bitableToken,
        tables: result.tables,
        message: '系统初始化成功',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 系统初始化失败', error);

    // 返回详细错误信息，方便排查
    const errorDetail = error instanceof Error ? error.stack || error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        detail: errorDetail,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/setup
 * 检查系统初始化状态
 */
export async function GET() {
  try {
    const bitableToken = process.env.BITABLE_TOKEN;
    const isInitialized = !!bitableToken;

    return NextResponse.json({
      success: true,
      data: {
        initialized: isInitialized,
        bitableToken: isInitialized ? `${bitableToken.substring(0, 8)}...` : null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
