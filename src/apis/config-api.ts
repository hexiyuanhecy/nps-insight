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
export async function runWeeklyTagging(): Promise<ConfigApiResponse> {
  const response = await fetch('/api/cron/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[API Error] runWeeklyTagging', response.status, data);
  }
  return data as ConfigApiResponse;
}

/**
 * 手动触发月分析流程
 */
export async function runMonthlyAnalysis(): Promise<ConfigApiResponse> {
  const response = await fetch('/api/cron/monthly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[API Error] runMonthlyAnalysis', response.status, data);
  }
  return data as ConfigApiResponse;
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
