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
import { createHash } from 'crypto';

const AUTH_API_BASE = 'https://accounts.feishu.cn/open-apis/authen/v1';
const TENANT_TOKEN_API = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const JSAPI_TICKET_API = 'https://open.feishu.cn/open-apis/jssdk/ticket/get';

/**
 * 飞书应用配置
 */
export interface FeishuAppConfig {
  appId: string;
  appSecret: string;
}

/**
 * 用 fetch 直接获取 tenant_access_token（不依赖全局 client）
 * 用于动态配置场景（配置存储在 KV 中，而非环境变量）
 */
async function fetchTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const response = await fetch(TENANT_TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    const errorMsg = data.msg || `HTTP ${response.status}`;
    console.error(`【用户授权】获取 tenant_access_token 失败: ${errorMsg}`);
    throw new Error(`获取 tenant_access_token 失败: ${errorMsg}`);
  }

  return data.tenant_access_token;
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
 * 从环境变量 + KV 存储获取飞书应用配置
 * 优先级：KV 存储 > 环境变量
 */
async function getAppConfigFromKV(ownerId?: string): Promise<FeishuAppConfig | null> {
  try {
    const { getFeishuAppConfig } = await import('./feishu-config');
    const config = await getFeishuAppConfig(ownerId);
    if (config.appId && config.appSecret) {
      return config;
    }
    return null;
  } catch (e) {
    console.warn('[UserAuth] 从 KV 读取飞书配置失败:', e);
    return null;
  }
}

/**
 * 从环境变量获取飞书应用配置（兼容旧代码）
 */
function getAppConfigFromEnv(): FeishuAppConfig {
  const appId = process.env.FEISHU_APP_ID || '';
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失，请配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
  }
  return { appId, appSecret };
}

/**
 * 解析飞书应用配置
 * 优先级：传入配置 > KV 存储 > 环境变量
 */
async function resolveAppConfig(appConfig?: FeishuAppConfig, ownerId?: string): Promise<FeishuAppConfig> {
  // 1. 优先使用传入的配置
  if (appConfig?.appId && appConfig?.appSecret) {
    return appConfig;
  }
  // 2. 其次从 KV 存储读取
  const kvConfig = await getAppConfigFromKV(ownerId);
  if (kvConfig && kvConfig.appId && kvConfig.appSecret) {
    return kvConfig;
  }
  // 3. 最后从环境变量读取
  return getAppConfigFromEnv();
}

/**
 * 获取 tenant_access_token：优先使用传入的配置，否则用全局 client
 */
async function resolveTenantToken(appConfig?: FeishuAppConfig): Promise<string> {
  if (appConfig?.appId && appConfig?.appSecret) {
    return fetchTenantAccessToken(appConfig.appId, appConfig.appSecret);
  }
  return getTenantAccessToken();
}

/**
 * 生成飞书 OAuth 授权 URL
 * @param redirectUri 授权回调地址
 * @param state 状态参数，用于防止 CSRF
 * @param appConfig 飞书应用配置（可选，不传则从 KV/环境变量读取）
 * @param ownerId 用户ID（可选，用于从 KV 读取配置）
 */
export async function getAuthorizationUrl(
  redirectUri: string,
  state?: string,
  appConfig?: FeishuAppConfig,
  ownerId?: string
): Promise<string> {
  const config = await resolveAppConfig(appConfig, ownerId);
  const clientId = config.appId;
  
  // 生成随机 state
  const stateParam = state || generateState();
  
  // URL 编码回调地址
  const encodedRedirectUri = encodeURIComponent(redirectUri);
  
  // 授权范围：获取用户基本信息 + 云空间读写 + 多维表格读写 + offline_access（获取 refresh_token）
  const scope = 'contact:user.base:readonly drive:drive bitable:app offline_access';
  
  // 按照飞书 OAuth 规范构建授权 URL
  // 参考：https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: stateParam,
    scope: scope,
  });
  
  return `${AUTH_API_BASE}/authorize?${params.toString()}`;
}

/**
 * 用授权码换取 user_access_token
 * @param code 授权回调中的 code
 * @param appConfig 飞书应用配置（可选，不传则从环境变量读取）
 */
export async function exchangeCodeForToken(code: string, appConfig?: FeishuAppConfig): Promise<UserTokenResponse> {
  const tenantToken = await resolveTenantToken(appConfig);
  
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
 * @param appConfig 飞书应用配置（可选，不传则从环境变量读取）
 */
export async function refreshAccessToken(refreshToken: string, appConfig?: FeishuAppConfig): Promise<UserTokenResponse> {
  const tenantToken = await resolveTenantToken(appConfig);
  
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

/**
 * JSAPI 配置结构
 */
export interface JsapiConfig {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
  url: string;
}

/**
 * 获取 JSAPI ticket
 * @param appConfig 飞书应用配置
 */
async function getJsapiTicket(appConfig: FeishuAppConfig): Promise<string> {
  const tenantToken = await resolveTenantToken(appConfig);

  const response = await fetch(JSAPI_TICKET_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tenantToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok || data.code !== 0) {
    const errorMsg = data.msg || `HTTP ${response.status}`;
    console.error(`【用户授权】获取 JSAPI ticket 失败: ${errorMsg}`);
    throw new Error(`获取 JSAPI ticket 失败: ${errorMsg}`);
  }

  return data.data.ticket;
}

/**
 * 生成随机字符串
 */
function generateNonceStr(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * 简单的 SHA1 哈希实现（用于 JSAPI 签名）
 * 使用 Node.js crypto 模块
 */
function sha1(message: string): string {
  return createHash('sha1').update(message).digest('hex');
}

/**
 * 生成 JSAPI 配置（含签名）
 * 用于前端调用 lark.config 初始化 JSAPI
 * @param url 当前页面 URL（不含 # 及后面的部分）
 * @param appConfig 飞书应用配置
 */
export async function generateJsapiConfig(url: string, appConfig?: FeishuAppConfig): Promise<JsapiConfig> {
  const config = await resolveAppConfig(appConfig);
  const ticket = await getJsapiTicket(config);

  const timestamp = getCurrentTimestampSeconds();
  const nonceStr = generateNonceStr();

  // 签名字符串：jsapi_ticket=xxx&noncestr=xxx&timestamp=xxx&url=xxx
  const string1 = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = sha1(string1);

  return {
    appId: config.appId,
    timestamp,
    nonceStr,
    signature,
    url,
  };
}
