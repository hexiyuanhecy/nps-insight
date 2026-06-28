import type { TabConfig } from '@/components/admin/config-center/types';

const CONFIG_ENDPOINT = '/api/config';

export interface ConfigApiResponse {
  success: boolean;
  error?: string;
  data?: TabConfig;
  appToken?: string;
}

async function postConfig(body: Record<string, unknown>): Promise<ConfigApiResponse> {
  console.log('==============================>hxybody == ', body)
  const response = await fetch(CONFIG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('==============================>hxyresponse == ', response)
  const data = await response.json();
  console.log('==============================>hxydata == ', data);
  if (!response.ok) {
    console.error('[API Error]', response.status, data);
  }
  return data as ConfigApiResponse;
}

export async function fetchConfig(): Promise<ConfigApiResponse> {
  const response = await fetch(CONFIG_ENDPOINT);
  return response.json() as Promise<ConfigApiResponse>;
}

export async function saveConfigV3(config: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'saveConfigV3', config });
}

/**
 * 增量保存配置（只传部分配置给后端，后端会与现有配置合并）
 */
export async function savePartialConfig(partialConfig: Partial<TabConfig>): Promise<ConfigApiResponse> {
  return postConfig({ action: 'saveConfigV3', config: partialConfig });
}

export async function testFeishuConnection(feishu: TabConfig['feishu']): Promise<ConfigApiResponse> {
  return postConfig({ action: 'testFeishu', config: feishu });
}

export async function testAiConnection(ai: TabConfig['ai']): Promise<ConfigApiResponse> {
  return postConfig({ action: 'testAI', config: ai });
}

export async function testNotifyConnection(notification: TabConfig['notification']): Promise<ConfigApiResponse> {
  return postConfig({ action: 'testNotify', config: notification });
}

export async function runManualSync(config: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'runManualSync', config });
}

export async function createBitable(config: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'createBitable', config });
}

export async function linkBitable(
  config: TabConfig,
  appToken: string,
): Promise<ConfigApiResponse> {
  return postConfig({ action: 'linkBitable', config, appToken });
}

export async function retagHistory(config: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'retagHistory', config });
}

/**
 * 手动触发周打标流程
 */
export async function runWeeklyTagging(config?: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'runManualSync', config });
}

/**
 * 手动触发月分析流程
 */
export async function runMonthlyAnalysis(config?: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'runMonthlyAnalysis', config });
}

export interface ExcelUploadResult {
  success: boolean;
  error?: string;
  data?: { total: number; written: number; skipped: number };
}

export async function uploadExcel(file: File): Promise<ExcelUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/config/import-excel', {
    method: 'POST',
    body: formData,
  });
  return response.json() as Promise<ExcelUploadResult>;
}

// ============================================
// 用户资源相关 API
// ============================================

export interface UserResource {
  rootFolderToken: string;
  reportFolderToken: string;
  monthFolderToken: string;
  bitableBaseToken: string;
  userOpenId?: string;
  userName?: string;
  userAccessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

export interface UserResourceResponse {
  success: boolean;
  error?: string;
  data?: {
    exists: boolean;
    resource?: UserResource;
    isNew?: boolean;
  };
}

/**
 * 获取用户资源状态
 */
export async function getUserResource(): Promise<UserResourceResponse> {
  const response = await fetch('/api/user-resource');
  return response.json() as Promise<UserResourceResponse>;
}

/**
 * 触发用户资源初始化
 */
export async function initUserResource(
  userName?: string,
  userOpenId?: string
): Promise<UserResourceResponse> {
  const response = await fetch('/api/user-resource', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName, userOpenId }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[API Error] initUserResource', response.status, data);
  }
  return data as UserResourceResponse;
}

// ============================================
// 用户授权相关 API
// ============================================

export interface AuthStatusResponse {
  success: boolean;
  error?: string;
  data?: {
    isAuthorized: boolean;
    userInfo?: {
      open_id: string;
      union_id: string;
      name: string;
      avatar_url?: string;
      email?: string;
      user_id?: string;
    };
    tokenExpiresAt?: number;
    remainingSeconds?: number;
    userOpenId?: string;
    userName?: string;
  };
}

export interface AuthUrlResponse {
  success: boolean;
  error?: string;
  data?: {
    authUrl: string;
    redirectUri: string;
  };
}

/**
 * 获取用户授权状态
 */
export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const response = await fetch('/api/user-resource?action=auth-status');
  return response.json() as Promise<AuthStatusResponse>;
}

/**
 * 获取授权URL
 */
export async function getAuthUrl(): Promise<AuthUrlResponse> {
  const response = await fetch('/api/user-resource?action=auth-url');
  return response.json() as Promise<AuthUrlResponse>;
}

/**
 * 授权回调处理
 */
export async function authCallback(code: string): Promise<AuthStatusResponse> {
  const response = await fetch('/api/user-resource?action=auth-callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[API Error] authCallback', response.status, data);
  }
  return data as AuthStatusResponse;
}

/**
 * 退出授权
 */
export async function authLogout(): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('/api/user-resource?action=auth-logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return response.json();
}
