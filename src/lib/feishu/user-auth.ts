/**
 * 飞书用户身份授权服务
 * 
 * 提供 OAuth 授权流程和 token 管理功能：
 * - 生成授权 URL
 * - 用 code 换取 user_access_token
 * - 刷新 access_token
 * - 获取用户信息
 */

import { getTenantAccessToken } from './client';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

const AUTH_API_BASE = 'https://open.feishu.cn/open-apis/authen/v1';

/**
 * 获取飞书应用配置
 */
function getAppConfig(): { appId: string; appSecret: string } {
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失，请配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
  }
  return { appId, appSecret };
}

/**
 * Token 响应结构
 */
export interface UserTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

/**
 * 用户信息响应
 */
export interface UserInfo {
  open_id: string;
  union_id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  user_id?: string;
}

/**
 * 授权状态
 */
export interface AuthStatus {
  isAuthorized: boolean;
  hasValidToken: boolean;
  tokenExpiresAt?: number;
  refreshToken?: string;
  userInfo?: UserInfo;
}

/**
 * 生成飞书 OAuth 授权 URL
 * @param redirectUri 授权回调地址
 * @param state 状态参数，用于防止 CSRF
 */
export function getAuthorizationUrl(redirectUri: string, state?: string): string {
  const config = getAppConfig();
  const appId = config.appId;
  
  // 生成随机 state
  const stateParam = state || generateState();
  
  // URL 编码回调地址
  const encodedRedirectUri = encodeURIComponent(redirectUri);
  
  // 授权范围：获取用户基本信息 + 云空间读写 + 多维表格读写
  const scope = 'contact:user.base:readonly drive:drive bitable:app';
  
  return `${AUTH_API_BASE}/authorize?app_id=${appId}&redirect_uri=${encodedRedirectUri}&state=${stateParam}&scope=${scope}`;
}

/**
 * 用授权码换取 user_access_token
 * @param code 授权回调中的 code
 */
export async function exchangeCodeForToken(code: string): Promise<UserTokenResponse> {
  const tenantToken = await getTenantAccessToken();
  
  const response = await fetch(`${AUTH_API_BASE}/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tenantToken}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    const errorMsg = data.msg || `HTTP ${response.status}`;
    console.error(`【用户授权】换取 token 失败: ${errorMsg}`);
    console.error(`【用户授权】错误详情:`, JSON.stringify(data, null, 2));
    throw new Error(`换取 user_access_token 失败: ${errorMsg}`);
  }

  console.log('【用户授权】成功获取 user_access_token');
  
  return {
    access_token: data.data.access_token,
    token_type: data.data.token_type,
    refresh_token: data.data.refresh_token,
    expires_in: data.data.expires_in,
    scope: data.data.scope,
  };
}

/**
 * 用 refresh_token 刷新 access_token
 * @param refreshToken refresh_token
 */
export async function refreshAccessToken(refreshToken: string): Promise<UserTokenResponse> {
  const tenantToken = await getTenantAccessToken();
  
  console.log('【用户授权】正在刷新 access_token...');
  
  const response = await fetch(`${AUTH_API_BASE}/refresh_access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tenantToken}`,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    const errorMsg = data.msg || `HTTP ${response.status}`;
    console.error(`【用户授权】刷新 token 失败: ${errorMsg}`);
    console.error(`【用户授权】错误详情:`, JSON.stringify(data, null, 2));
    
    // 检查是否是 refresh_token 过期
    if (data.code === 10016 || data.msg?.includes('refresh_token')) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }
    
    throw new Error(`刷新 access_token 失败: ${errorMsg}`);
  }

  console.log('【用户授权】Token 刷新成功');
  
  return {
    access_token: data.data.access_token,
    token_type: data.data.token_type,
    refresh_token: data.data.refresh_token,
    expires_in: data.data.expires_in,
    scope: data.data.scope,
  };
}

/**
 * 获取用户信息
 * @param accessToken user_access_token
 */
export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(`${AUTH_API_BASE}/user_info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    const errorMsg = data.msg || `HTTP ${response.status}`;
    console.error(`【用户授权】获取用户信息失败: ${errorMsg}`);
    throw new Error(`获取用户信息失败: ${errorMsg}`);
  }

  return {
    open_id: data.data.open_id,
    union_id: data.data.union_id,
    name: data.data.name,
    avatar_url: data.data.avatar_url,
    email: data.data.email,
    user_id: data.data.user_id,
  };
}

/**
 * 检查 access_token 是否即将过期
 * @param expiresIn 剩余有效期（秒）
 * @param threshold 阈值（秒），默认 600（10分钟）
 */
export function isTokenExpiringSoon(expiresIn: number, threshold: number = 600): boolean {
  return expiresIn < threshold;
}

/**
 * 生成随机 state 参数
 */
function generateState(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let state = '';
  for (let i = 0; i < 32; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}

/**
 * 获取当前可用的 user_access_token
 * 自动处理 token 刷新逻辑
 */
export async function getValidUserAccessToken(
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<{ token: string; newRefreshToken?: string }> {
  const now = getCurrentTimestampSeconds();
  const remainingSeconds = expiresAt - now;
  
  // 如果 token 即将过期，先刷新
  if (isTokenExpiringSoon(remainingSeconds)) {
    console.log('【用户授权】Token 即将过期，先刷新...');
    const newToken = await refreshAccessToken(refreshToken);
    
    return {
      token: newToken.access_token,
      newRefreshToken: newToken.refresh_token,
    };
  }
  
  return { token: accessToken };
}
