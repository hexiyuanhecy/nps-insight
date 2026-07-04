/**
 * 语义缓存 API
 * GET /api/ai/cache - 获取缓存统计和配置
 * PUT /api/ai/cache/config - 更新缓存配置
 * DELETE /api/ai/cache - 清除缓存
 * POST /api/ai/cache/test - 测试缓存查询
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCacheStats,
  getCacheConfig,
  updateCacheConfig,
  clearCache,
  queryCache,
  writeCache,
} from '@/lib/ai/semantic-cache';
import { TASK_TYPES } from '@/lib/ai/model-router';

export async function GET(request: NextRequest) {
  try {
    const [stats, config] = await Promise.all([
      getCacheStats(),
      getCacheConfig(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        config,
        taskTypes: TASK_TYPES,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/cache] 获取缓存信息失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled 必须是布尔值', code: 400 },
        { status: 400 }
      );
    }

    if (body.ttlSeconds !== undefined && (typeof body.ttlSeconds !== 'number' || body.ttlSeconds < 0)) {
      return NextResponse.json(
        { success: false, error: 'ttlSeconds 必须是非负整数', code: 400 },
        { status: 400 }
      );
    }

    if (body.similarityThreshold !== undefined && (typeof body.similarityThreshold !== 'number' || body.similarityThreshold < 0 || body.similarityThreshold > 1)) {
      return NextResponse.json(
        { success: false, error: 'similarityThreshold 必须在 0-1 之间', code: 400 },
        { status: 400 }
      );
    }

    await updateCacheConfig(body);
    const updatedConfig = await getCacheConfig();

    return NextResponse.json({
      success: true,
      message: '缓存配置已更新',
      data: updatedConfig,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/cache] 更新配置失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskType = searchParams.get('taskType');

    await clearCache(taskType as any);

    return NextResponse.json({
      success: true,
      message: taskType ? `${taskType} 缓存已清除` : '所有缓存已清除',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/cache] 清除缓存失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, taskType, answer, action } = await request.json();

    if (action === 'test') {
      if (!query || !taskType) {
        return NextResponse.json(
          { success: false, error: 'query 和 taskType 是必填项', code: 400 },
          { status: 400 }
        );
      }

      const result = await queryCache(query, taskType as any);

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    if (action === 'write') {
      if (!query || !answer || !taskType) {
        return NextResponse.json(
          { success: false, error: 'query、answer 和 taskType 是必填项', code: 400 },
          { status: 400 }
        );
      }

      await writeCache(query, answer, taskType as any);

      return NextResponse.json({
        success: true,
        message: '缓存已写入',
      });
    }

    return NextResponse.json(
      { success: false, error: '未知操作类型', code: 400 },
      { status: 400 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /ai/cache] 操作失败:', error);
    return NextResponse.json(
      { success: false, error: errorMessage, code: 500 },
      { status: 500 }
    );
  }
}
