/**
 * 模型路由配置 API
 * GET /api/ai/model-route - 获取路由配置
 * PUT /api/ai/model-route - 更新路由配置
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRouteConfig,
  updateRouteConfig,
  invalidateRouteConfigCache,
  route,
  TASK_TYPES,
} from '@/lib/ai/model-router';

export async function GET(request: NextRequest) {
  try {
    const config = await getRouteConfig();

    return NextResponse.json({
      success: true,
      data: {
        ...config,
        taskTypes: TASK_TYPES,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/model-route] 获取配置失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // 校验必要字段
    if (body.routingEnabled !== undefined && typeof body.routingEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'routingEnabled 必须是布尔值', code: 400 },
        { status: 400 }
      );
    }

    if (body.heavyModel && typeof body.heavyModel !== 'string') {
      return NextResponse.json(
        { success: false, error: 'heavyModel 必须是字符串', code: 400 },
        { status: 400 }
      );
    }

    if (body.lightModel && typeof body.lightModel !== 'string') {
      return NextResponse.json(
        { success: false, error: 'lightModel 必须是字符串', code: 400 },
        { status: 400 }
      );
    }

    await updateRouteConfig(body);
    invalidateRouteConfigCache();

    const updatedConfig = await getRouteConfig();

    return NextResponse.json({
      success: true,
      message: '模型路由配置已更新',
      data: updatedConfig,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/model-route] 更新配置失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}

/**
 * 测试路由决策
 * POST /api/ai/model-route/test
 */
export async function POST(request: NextRequest) {
  try {
    const { taskType } = await request.json();

    if (!taskType) {
      return NextResponse.json(
        { success: false, error: 'taskType 是必填项', code: 400 },
        { status: 400 }
      );
    }

    const decision = await route(taskType as any);

    return NextResponse.json({
      success: true,
      data: decision,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/model-route/test] 测试路由失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}
