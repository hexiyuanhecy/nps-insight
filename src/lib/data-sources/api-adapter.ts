/**
 * API 接口数据源适配器
 */

import {
  DataSourceAdapter,
  FeedbackRecord,
  FieldMapping,
  DEFAULT_FIELD_MAPPING,
  extractFieldValue,
} from './base-adapter';

export interface ApiAdapterConfig {
  type: 'api';
  apiUrl: string;
  apiKey: string;
  fieldMapping?: FieldMapping;
}

export class ApiAdapter implements DataSourceAdapter {
  private config: ApiAdapterConfig;

  constructor(config: ApiAdapterConfig) {
    this.config = config;
  }

  getType(): string {
    return 'api';
  }

  getDefaultFieldMapping(): FieldMapping {
    return DEFAULT_FIELD_MAPPING;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.config.apiUrl}?page=1&pageSize=1`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return { success: false, message: `API 返回错误: ${response.status}` };
      }

      const data = await response.json();
      return { success: true, message: '连接成功' };
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  async fetchData(startDate: string, endDate: string): Promise<FeedbackRecord[]> {
    const allFeedbacks: FeedbackRecord[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(this.config.apiUrl);
      url.searchParams.append('startDate', startDate);
      url.searchParams.append('endDate', endDate);
      url.searchParams.append('page', page.toString());
      url.searchParams.append('pageSize', pageSize.toString());

      const response = await fetch(url.toString(), {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      const feedbacks = this.parseResponse(data);
      allFeedbacks.push(...feedbacks);

      hasMore = feedbacks.length === pageSize;
      page++;
    }

    return allFeedbacks;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private parseResponse(data: any): FeedbackRecord[] {
    // 支持多种响应格式
    const list = data.data?.list || data.data || data.feedbacks || data.items || [];

    if (!Array.isArray(list)) {
      console.warn('API 返回数据不是数组:', data);
      return [];
    }

    const mapping = this.config.fieldMapping || DEFAULT_FIELD_MAPPING;

    return list.map((item: any, index: number) => {
      const feedbackId = extractFieldValue(item, mapping.feedbackId) || `API-${index + 1}`;
      const content = extractFieldValue(item, mapping.content) || '';
      const score = Number(extractFieldValue(item, mapping.score) || 0);
      const createTime = extractFieldValue(item, mapping.createTime) || new Date().toISOString();

      return {
        feedbackId: String(feedbackId),
        content: String(content),
        score,
        createTime,
        module: extractFieldValue(item, mapping.module),
        source: extractFieldValue(item, mapping.source),
        dissatisfactionReason: extractFieldValue(item, mapping.dissatisfactionReason),
        tenantId: extractFieldValue(item, mapping.tenantId),
        tenantName: extractFieldValue(item, mapping.tenantName),
        tenantScale: extractFieldValue(item, mapping.tenantScale),
        larkUserId: extractFieldValue(item, mapping.larkUserId),
      };
    });
  }
}
