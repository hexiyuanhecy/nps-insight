import type { TabConfig } from '@/components/admin/config-center/types';

const CONFIG_ENDPOINT = '/api/config';

export interface ConfigApiResponse {
  success: boolean;
  error?: string;
  data?: TabConfig;
  appToken?: string;
}

async function postConfig(body: Record<string, unknown>): Promise<ConfigApiResponse> {
  const response = await fetch(CONFIG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<ConfigApiResponse>;
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

export async function createBitable(feishu: TabConfig['feishu']): Promise<ConfigApiResponse> {
  return postConfig({ action: 'createBitable', config: feishu });
}

export async function linkBitable(
  feishu: TabConfig['feishu'],
  appToken: string,
): Promise<ConfigApiResponse> {
  return postConfig({ action: 'linkBitable', config: { ...feishu, appToken } });
}

export async function retagHistory(config: TabConfig): Promise<ConfigApiResponse> {
  return postConfig({ action: 'retagHistory', config });
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
