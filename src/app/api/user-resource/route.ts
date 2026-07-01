/**
 * 用户资源初始化 API
 * POST /api/user-resource/init - 触发用户资源初始化
 * GET  /api/user-resource      - 获取用户资源状态
 * GET  /api/user-resource/auth/status  - 获取用户授权状态
 * GET  /api/user-resource/auth/url     - 获取授权URL
 * POST /api/user-resource/auth/callback - 授权回调处理
 * POST /api/user-resource/auth/logout  - 退出授权
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserResourceInitializer } from '@/lib/init/user-resource-initializer';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import {
  getAuthorizationUrl,
  exchangeCodeForToken,
  getUserInfo,
  refreshAccessToken,
  generateJsapiConfig,
  type FeishuAppConfig,
} from '@/lib/feishu/user-auth';
import { getConfig } from '@/lib/storage/kv-storage';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

/**
 * 从 KV 配置中获取飞书应用配置
 * 优先从 KV 存储读取（用户在配置中心设置的），兜底用环境变量
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
    console.warn('[user-resource] 从 KV 读取飞书配置失败，回退到环境变量:', e);
  }
  // 兜底：从环境变量读取
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失，请在配置中心设置 App ID 和 App Secret');
  }
  return { appId, appSecret };
}

/**
 * 获取授权回调地址
 * 优先从 X-Forwarded-Host 获取真实域名（用于反向代理/云函数场景）
 */
function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  
  if (forwardedHost) {
    const protocol = forwardedProto || url.protocol || 'https';
    return `${protocol}://${forwardedHost}/api/user-resource/auth/callback`;
  }
  
  const origin = url.origin;
  return `${origin}/api/user-resource/auth/callback`;
}

/**
 * GET - 获取用户资源状态 / 授权状态 / 授权URL
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 获取授权状态
    if (action === 'auth-status') {
      const store = createUserResourceStore();
      const resource = await store.get();
      const isAuthorized = store.isUserAuthorized ? await store.isUserAuthorized() : !!(resource?.userAccessToken && resource?.refreshToken);

      let userInfo = null;
      let tokenExpiresAt: number | undefined;
      let remainingSeconds = 0;

      if (resource?.userAccessToken && resource?.tokenExpiresAt) {
        tokenExpiresAt = resource.tokenExpiresAt;
        const now = getCurrentTimestampSeconds();
        remainingSeconds = Math.max(0, tokenExpiresAt - now);

        // 如果 token 有效，获取用户信息
        if (remainingSeconds > 60) {
          try {
            userInfo = await getUserInfo(resource.userAccessToken);
          } catch (e) {
            console.warn('[API] 获取用户信息失败，token 可能已过期');
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          isAuthorized,
          userInfo,
          tokenExpiresAt,
          remainingSeconds,
          userOpenId: resource?.userOpenId,
          userName: resource?.userName,
        },
      });
    }

    // 获取授权URL
    if (action === 'auth-url') {
      const appConfig = await getFeishuAppConfig();
      const redirectUri = getRedirectUri(request);
      const authUrl = await getAuthorizationUrl(redirectUri, undefined, appConfig);

      return NextResponse.json({
        success: true,
        data: {
          authUrl,
          redirectUri,
        },
      });
    }

    // 获取 JSAPI 配置（用于飞书 Webview 环境初始化 JSAPI）
    if (action === 'jsapi-config') {
      const url = searchParams.get('url');
      if (!url) {
        return NextResponse.json(
          { success: false, error: '缺少 url 参数' },
          { status: 400 }
        );
      }

      try {
        const appConfig = await getFeishuAppConfig();
        // 去掉 URL 中的 hash 部分（飞书签名要求）
        const cleanUrl = url.split('#')[0];
        const jsapiConfig = await generateJsapiConfig(cleanUrl, appConfig);

        return NextResponse.json({
          success: true,
          data: jsapiConfig,
        });
      } catch (error) {
        console.error('[API] 获取 JSAPI 配置失败:', error);
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
          },
          { status: 500 }
        );
      }
    }

    // 默认：获取用户资源状态
    const store = createUserResourceStore();
    const resource = await store.get();
    const exists = await store.exists();

    return NextResponse.json({
      success: true,
      data: {
        exists,
        resource,
      },
    });
  } catch (error) {
    console.error('[API /user-resource GET] 错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * POST - 触发用户资源初始化 / 授权回调 / 退出授权
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json().catch(() => ({}));

    // 授权回调处理
    if (action === 'auth-callback') {
      const code = body.code;
      if (!code) {
        return NextResponse.json(
          { success: false, error: '缺少授权码 code' },
          { status: 400 }
        );
      }

      console.log('\n' + '='.repeat(60));
      console.log('【API】用户授权回调处理');
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

      console.log(`【API】用户授权成功: ${userInfo.name} (${userInfo.open_id})`);

      return NextResponse.json({
        success: true,
        data: {
          userInfo,
          expiresAt,
        },
      });
    }

    // 退出授权
    if (action === 'auth-logout') {
      const store = createUserResourceStore();
      if (store.clearUserToken) {
        await store.clearUserToken();
      } else {
        // 如果没有 clearUserToken 方法，手动清除 token
        const resource = await store.get();
        if (resource) {
          const updatedResource = {
            ...resource,
            userAccessToken: undefined,
            refreshToken: undefined,
            tokenExpiresAt: undefined,
          };
          await store.save(updatedResource);
        }
      }

      console.log('【API】用户已退出授权');

      return NextResponse.json({
        success: true,
        data: {
          message: '已退出授权',
        },
      });
    }

    // 强制重新初始化用户资源
    if (action === 'reinit') {
      const store = createUserResourceStore();
      const existingResource = await store.get();
      const userName = existingResource?.userName || body.userName || '本地用户';
      const userOpenId = existingResource?.userOpenId || body.userOpenId || '';

      console.log('\n' + '='.repeat(60));
      console.log('【API】用户资源重新初始化请求');
      console.log(`  用户名: ${userName}`);
      console.log(`  用户ID: ${userOpenId || '未提供'}`);
      console.log('='.repeat(60) + '\n');

      const initializer = getUserResourceInitializer();
      const result = await initializer.reinitialize(userName, userOpenId);

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error || '重新初始化失败',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          resource: result.resource,
          isNew: result.isNew,
        },
      });
    }

    // 默认：触发用户资源初始化
    const userName = body.userName || '本地用户';
    // 优先使用 open_id（ADMIN_USER_OPEN_ID），其次使用旧配置
    const userOpenId = body.userOpenId || process.env.ADMIN_USER_OPEN_ID || process.env.NOTIFICATION_ADMIN_USER_IDS || '';

    console.log('\n' + '='.repeat(60));
    console.log('【API】用户资源初始化请求');
    console.log(`  用户名: ${userName}`);
    console.log(`  用户ID: ${userOpenId || '未提供'}`);
    console.log('='.repeat(60) + '\n');

    const initializer = getUserResourceInitializer();
    const result = await initializer.ensureInitialized(userName, userOpenId);

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
        resource: result.resource,
        isNew: result.isNew,
      },
    });
  } catch (error) {
    console.error('[API /user-resource POST] 错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
