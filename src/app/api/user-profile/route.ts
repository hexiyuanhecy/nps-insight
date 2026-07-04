/**
 * 用户画像 API
 * GET    /api/user-profile          获取当前用户画像
 * POST   /api/user-profile/refresh  强制刷新用户画像
 * POST   /api/user-profile/adjust   人工调整画像（修正主导问题、重点关注等）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig, getValue, setValue } from '@/lib/storage/kv-storage';
import { generateUserProfile, getUserProfile, type UserProfile } from '@/lib/ai/user-profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AdjustProfileRequest {
  dominantIssueType?: string;
  focusTags?: string[];
  userNotes?: string;
}

function getOwnerId(req: NextRequest): string {
  const ownerId = req.headers.get('x-owner-id') || 'default';
  return ownerId;
}

export async function GET(req: NextRequest) {
  try {
    const ownerId = getOwnerId(req);
    const profile = await getUserProfile(ownerId);

    if (!profile) {
      return NextResponse.json({
        success: true,
        data: null,
        message: '画像尚未生成，请先触发一次同步',
      });
    }

    const adjustmentRaw = await getValue(`user_profile_adjustment:${ownerId}`);
    const adjustment = adjustmentRaw ? JSON.parse(adjustmentRaw) : null;

    return NextResponse.json({
      success: true,
      data: {
        profile,
        adjustment,
      },
    });
  } catch (error) {
    console.error('[UserProfile API] 获取画像失败:', error);
    return NextResponse.json(
      { success: false, error: '获取画像失败', code: 500 },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'refresh') {
    return handleRefresh(req);
  } else if (action === 'adjust') {
    return handleAdjust(req);
  }

  return NextResponse.json(
    { success: false, error: '无效的 action 参数', code: 400 },
    { status: 400 }
  );
}

async function handleRefresh(req: NextRequest) {
  try {
    const ownerId = getOwnerId(req);
    const config = await getConfig(ownerId);

    if (!config) {
      return NextResponse.json(
        { success: false, error: '配置未初始化', code: 400 },
        { status: 400 }
      );
    }

    const profile = await generateUserProfile(ownerId);

    return NextResponse.json({
      success: true,
      data: profile,
      message: '画像刷新成功',
    });
  } catch (error) {
    console.error('[UserProfile API] 刷新画像失败:', error);
    return NextResponse.json(
      { success: false, error: '刷新画像失败', code: 500 },
      { status: 500 }
    );
  }
}

async function handleAdjust(req: NextRequest) {
  try {
    const ownerId = getOwnerId(req);
    const body = (await req.json()) as AdjustProfileRequest;

    const adjustmentKey = `user_profile_adjustment:${ownerId}`;
    const existingRaw = await getValue(adjustmentKey);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};

    const updated = {
      ...existing,
      ...(body.dominantIssueType !== undefined && { dominantIssueType: body.dominantIssueType }),
      ...(body.focusTags !== undefined && { focusTags: body.focusTags }),
      ...(body.userNotes !== undefined && { userNotes: body.userNotes }),
      updatedAt: Date.now(),
    };

    await setValue(adjustmentKey, JSON.stringify(updated));

    return NextResponse.json({
      success: true,
      data: updated,
      message: '画像调整已保存',
    });
  } catch (error) {
    console.error('[UserProfile API] 调整画像失败:', error);
    return NextResponse.json(
      { success: false, error: '调整画像失败', code: 500 },
      { status: 500 }
    );
  }
}
