/**
 * 数据源适配器基类和接口定义
 */

// 反馈记录数据结构
export interface FeedbackRecord {
  feedbackId: string;
  content: string;
  score: number;
  createTime: string;
  module?: string;
  source?: string;
  dissatisfactionReason?: string;
  tenantId?: string;
  tenantName?: string;
  tenantScale?: string;
  larkUserId?: string;
}

// 字段映射配置
export interface FieldMapping {
  [systemField: string]: string | string[];
}

// 数据源配置基础接口
export interface DataSourceConfig {
  type: 'api' | 'excel' | 'database' | 'webhook';
  fieldMapping?: FieldMapping;
}

// 数据源适配器接口
export interface DataSourceAdapter {
  /** 获取适配器类型 */
  getType(): string;

  /** 测试连接 */
  testConnection(): Promise<{ success: boolean; message: string }>;

  /** 拉取数据 */
  fetchData(startDate: string, endDate: string): Promise<FeedbackRecord[]>;

  /** 获取默认字段映射 */
  getDefaultFieldMapping(): FieldMapping;
}

// 提取字段值（支持多种字段名）
export function extractFieldValue(
  item: Record<string, any>,
  possibleFields: string | string[]
): any {
  const fields = Array.isArray(possibleFields) ? possibleFields : [possibleFields];

  for (const field of fields) {
    if (item[field] !== undefined && item[field] !== null) {
      return item[field];
    }
  }
  return undefined;
}

// 创建默认字段映射
export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  feedbackId: ['id', 'feedback_id', 'feedbackId', 'submit_record_id'],
  content: ['content', 'feedback_content', 'comment', 'text', '评价内容', '反馈内容'],
  score: ['score', 'rating'],
  createTime: ['create_time', 'created_at', 'submit_time', 'createTime', '评价时间', '提交时间'],
  module: ['module', 'product', 'category', '功能模块'],
  source: ['source', 'channel', '来源', '平台'],
  dissatisfactionReason: ['reason', 'reason_text', 'dissatisfactionReason', '不满意原因'],
  tenantId: ['tenant_id', 'org_id', 'tenantId', '租户ID'],
  tenantName: ['tenant_name', 'org_name', 'tenantName', '租户名称'],
  tenantScale: ['tenant_scale', 'scale', 'tenantScale', '租户规模'],
  larkUserId: ['user_id', 'lark_user_id', 'larkUserId'],
};
