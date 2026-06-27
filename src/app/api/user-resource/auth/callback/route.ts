/**
 * 飞书 OAuth 授权回调路由
 * GET /api/user-resource/auth/callback - 处理飞书授权回调，code 换 token 后重定向回管理页面
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import { exchangeCodeForToken, getUserInfo } from '@/lib/feishu/user-auth';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.json(
        { success: false, error: '缺少授权码 code' },
        { status: 400 }
      );
    }

    console.log('\n' + '='.repeat(60));
    console.log('【OAuth Callback】用户授权回调处理');
    console.log(`  state: ${state}`);
    console.log('='.repeat(60) + '\n');

    // 用 code 换取 token
    const tokenResponse = await exchangeCodeForToken(code);

    // 获取用户信息
    const userInfo = await getUserInfo(tokenResponse.access_token);

    const expiresAt = getCurrentTimestampSeconds() + tokenResponse.expires_in;

    // 保存到用户资源存储
    const store = createUserResourceStore();
    const existingResource = await store.get();

    const updatedResource = {
      ...(existingResource || {
        rootFolderToken: '',
        reportFolderToken: '',
        monthFolderToken: '',
        bitableBaseToken: '',
      }),
      userOpenId: userInfo.open_id,
      userName: userInfo.name,
      userAccessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenExpiresAt: expiresAt,
    };

    await store.save(updatedResource);

    console.log(`【OAuth Callback】用户授权成功: ${userInfo.name} (${userInfo.open_id})`);

    // 重定向回管理页面
    return NextResponse.redirect(new URL('/admin', request.url));
  } catch (error) {
    console.error('[OAuth Callback] 错误:', error);
    // 重定向回管理页面并带上错误参数
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : '授权失败'
    );
    return NextResponse.redirect(
      new URL(`/admin?auth_error=${errorMessage}`, request.url)
    );
  }
}
