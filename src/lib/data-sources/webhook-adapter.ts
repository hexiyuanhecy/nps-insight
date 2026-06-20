/**
 * Webhook 接收数据源适配器
 */

import {
  DataSourceAdapter,
  FeedbackRecord,
  FieldMapping,
  DEFAULT_FIELD_MAPPING,
  extractFieldValue,
} from './base-adapter';

// Webhook 数据缓冲区（生产环境应使用 Redis）
const webhookBuffer: FeedbackRecord[] = [];

export interface WebhookAdapterConfig {
  type: 'webhook';
  webhookId: string;
}

export class WebhookAdapter implements DataSourceAdapter {
  private config: WebhookAdapterConfig;

  constructor(config: WebhookAdapterConfig) {
    this.config = config;
  }

  getType(): string {
    return 'webhook';
  }

  getDefaultFieldMapping(): FieldMapping {
    return DEFAULT_FIELD_MAPPING;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'Webhook 接收地址已配置，请确保在数据源系统中配置此地址',
    };
  }

  async fetchData(startDate?: string, endDate?: string): Promise<FeedbackRecord[]> {
    let feedbacks = [...webhookBuffer];

    // 清空缓冲区
    webhookBuffer.length = 0;

    // 按时间范围过滤
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      feedbacks = feedbacks.filter((f) => {
        const createTime = new Date(f.createTime);
        return createTime >= start && createTime <= end;
      });
    }

    return feedbacks;
  }

  /**
   * 处理接收到的 Webhook 数据
   * 此方法由 API 路由调用
   */
  static handleWebhookPayload(payload: any): FeedbackRecord | null {
    try {
      const data = payload.data || payload;
      const mapping = DEFAULT_FIELD_MAPPING;

      const feedback: FeedbackRecord = {
        feedbackId:
          extractFieldValue(data, mapping.feedbackId) ||
          extractFieldValue(data, ['id', 'feedback_id']) ||
          `WH-${Date.now()}`,
        content:
          extractFieldValue(data, mapping.content) ||
          extractFieldValue(data, ['content', 'comment']) ||
          '',
        score: Number(
          extractFieldValue(data, mapping.score) ||
            extractFieldValue(data, ['score', 'rating']) ||
            0
        ),
        createTime:
          extractFieldValue(data, mapping.createTime) ||
          extractFieldValue(data, ['timestamp', 'create_time']) ||
          new Date().toISOString(),
        module: extractFieldValue(data, mapping.module),
        source: extractFieldValue(data, mapping.source),
        dissatisfactionReason: extractFieldValue(data, mapping.dissatisfactionReason),
        tenantId: extractFieldValue(data, mapping.tenantId),
        larkUserId: extractFieldValue(data, mapping.larkUserId),
      };

      // 添加到缓冲区
      webhookBuffer.push(feedback);
      return feedback;
    } catch (error) {
      console.error('处理 Webhook 数据失败:', error);
      return null;
    }
  }

  /**
   * 获取 Webhook 接收地址
   */
  static getWebhookUrl(baseUrl: string): string {
    return `${baseUrl}/api/webhook/feelgood`;
  }

  /**
   * 获取缓冲区中的数据量
   */
  static getBufferSize(): number {
    return webhookBuffer.length;
  }
}
