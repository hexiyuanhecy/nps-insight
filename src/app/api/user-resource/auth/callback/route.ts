/**
 * 飞书 OAuth 授权回调路由
 * GET /api/user-resource/auth/callback - 处理飞书授权回调，code 换 token 后重定向回管理页面
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import { exchangeCodeForToken, getUserInfo, type FeishuAppConfig } from '@/lib/feishu/user-auth';
import { getConfig } from '@/lib/storage/kv-storage';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

export const dynamic = 'force-dynamic';

/**
 * 从 KV 配置中获取飞书应用配置
 */
async function getFeishuAppConfig(): Promise<FeishuAppConfig> {
  const ownerId = process.env.DEFAULT_OWNER_ID || 'default_owner';
  try {
    const config = await getConfig(ownerId);
    const feishuConfig = config?.feishu as { appId?: string; appSecret?: string } | undefined;
    if (feishuConfig?.appId && feishuConfig?.appSecret) {
      return {
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
      };
    }
  } catch (e) {
    console.warn('[auth-callback] 从 KV 读取飞书配置失败，回退到环境变量:', e);
  }
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失，请在配置中心设置 App ID 和 App Secret');
  }
  return { appId, appSecret };
}

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

    // 从 X-Forwarded-Host 获取真实域名
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const url = new URL(request.url);
    const baseUrl = forwardedHost
      ? `${forwardedProto || 'https'}://${forwardedHost}`
      : url.origin;

    console.log('\n' + '='.repeat(60));
    console.log('【OAuth Callback】用户授权回调处理');
    console.log(`  state: ${state}`);
    console.log(`  baseUrl: ${baseUrl}`);
    console.log('='.repeat(60) + '\n');

    const appConfig = await getFeishuAppConfig();

    // 用 code 换取 token
    const tokenResponse = await exchangeCodeForToken(code, appConfig);

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

    // 重定向到授权结果页面（浏览器新窗口场景下显示成功提示并自动关闭）
    const callbackPageUrl = new URL('/auth/callback', baseUrl);
    callbackPageUrl.searchParams.set('success', '1');
    callbackPageUrl.searchParams.set('user_name', userInfo.name);
    return NextResponse.redirect(callbackPageUrl);
  } catch (error) {
    console.error('[OAuth Callback] 错误:', error);
    // 从 X-Forwarded-Host 获取真实域名
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const url = new URL(request.url);
    const baseUrl = forwardedHost
      ? `${forwardedProto || 'https'}://${forwardedHost}`
      : url.origin;

    // 重定向到授权结果页面（显示错误信息）
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : '授权失败'
    );
    const callbackPageUrl = new URL('/auth/callback', baseUrl);
    callbackPageUrl.searchParams.set('success', '0');
    callbackPageUrl.searchParams.set('error', errorMessage);
    return NextResponse.redirect(callbackPageUrl);
  }
}
