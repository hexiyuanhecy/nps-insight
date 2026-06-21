/**
 * 多维表格创建和关联管理
 */

import { getTenantAccessToken } from './client';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

export interface BitableInfo {
  appToken: string;
  tables: {
    feedbackTableId: string;
    tag1TableId: string;
    tag2TableId: string;
    tag3TableId: string;
    tenantTableId: string;
    periodTableId: string;
  };
}

export interface TableField {
  fieldId: string;
  fieldName: string;
  type: number;
}

export interface TableInfo {
  tableId: string;
  name: string;
  fields: TableField[];
}

export const TAG1_OPTIONS = [
  { name: 'urgent', color: 0 },
  { name: 'high', color: 1 },
  { name: 'medium', color: 2 },
  { name: 'low', color: 3 },
  { name: 'info', color: 4 },
  { name: 'security', color: 5 },
  { name: 'invalid', color: 6 },
];

export const STATUS_OPTIONS = [
  { name: 'new', color: 0 },
  { name: 'pending', color: 1 },
  { name: 'processing', color: 2 },
  { name: 'resolved', color: 3 },
  { name: 'closed', color: 4 },
];

export const MODULE_OPTIONS = [
  { name: '系统卡顿', color: 0 },
  { name: '界面不美观', color: 1 },
  { name: '功能缺失', color: 2 },
  { name: '打开速度慢', color: 3 },
  { name: '其他', color: 4 },
  { name: '缺少功能', color: 5 },
];

export const TENANT_SCALE_OPTIONS = [
  { name: 'A1', color: 0 },
  { name: 'A2', color: 1 },
  { name: 'A3', color: 2 },
  { name: 'A4', color: 3 },
  { name: 'A5', color: 4 },
  { name: 'A6', color: 5 },
];

/**
 * 创建 NPS Insight 多维表格
 * 建表顺序：先创建标签表（供反馈表关联使用），再创建其他表
 */
export async function createNPSInsightBitable(
  name: string = 'NPS Insight - 反馈分析'
): Promise<BitableInfo> {
  const token = await getTenantAccessToken();

  // 1. 创建多维表格应用
  const appResponse = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  const appData = await appResponse.json();
  if (appData.code !== 0) {
    throw new Error(`创建多维表格失败: ${appData.msg}`);
  }

  const appToken = appData.data?.app?.app_token;

  // 2. 先创建三张标签表（供反馈表关联使用）
  const [tag1TableId, tag2TableId, tag3TableId] = await Promise.all([
    createTag1Table(token, appToken),
    createTag2Table(token, appToken),
    createTag3Table(token, appToken),
  ]);

  // 3. 创建其他表（反馈表需要引用标签表ID）
  const [feedbackTableId, tenantTableId, periodTableId] = await Promise.all([
    createFeedbackListTable(token, appToken, tag1TableId, tag2TableId, tag3TableId),
    createTenantInfoTable(token, appToken),
    createPeriodAnalysisTable(token, appToken),
  ]);

  return {
    appToken,
    tables: {
      feedbackTableId,
      tag1TableId,
      tag2TableId,
      tag3TableId,
      tenantTableId,
      periodTableId,
    },
  };
}

/**
 * 创建「反馈列表」表
 * tag1/tag2/tag3 字段为双向关联字段，关联到对应的标签表
 */
async function createFeedbackListTable(
  token: string,
  appToken: string,
  tag1TableId: string,
  tag2TableId: string,
  tag3TableId: string
): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: '反馈列表',
        default_view_name: '默认视图',
        fields: [
          { field_name: 'feedbackId', type: 1 },
          { field_name: 'tenantId', type: 1 },
          { field_name: 'tenantName', type: 1 },
          {
            field_name: 'tenantScale',
            type: 3,
            property: { options: TENANT_SCALE_OPTIONS },
          },
          { field_name: 'userId', type: 1 },
          { field_name: 'userName', type: 1 },
          { field_name: 'createTime', type: 5 },
          {
            field_name: 'module',
            type: 4,
            property: { options: MODULE_OPTIONS },
          },
          { field_name: 'content', type: 1 },
          { field_name: 'npsScore', type: 2 },
          { field_name: 'source', type: 1 },
          {
            field_name: 'tag1',
            type: 16,
            property: { foreign_table_id: tag1TableId },
          },
          {
            field_name: 'tag2',
            type: 16,
            property: { foreign_table_id: tag2TableId },
          },
          {
            field_name: 'tag3',
            type: 16,
            property: { foreign_table_id: tag3TableId },
          },
          { field_name: 'summary', type: 1 },
          { field_name: 'suggestions', type: 1 },
          {
            field_name: 'priority',
            type: 3,
            property: { options: [{ name: 'urgent', color: 0 }, { name: 'high', color: 1 }, { name: 'medium', color: 2 }, { name: 'low', color: 3 }] },
          },
          {
            field_name: 'status',
            type: 3,
            property: { options: [{ name: 'new', color: 0 }, { name: 'pending', color: 1 }, { name: 'processing', color: 2 }, { name: 'resolved', color: 3 }, { name: 'closed', color: 4 }] },
          },
          { field_name: 'assigneeId', type: 1 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建反馈列表表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「Tag1表」（一级标签表）
 * 字段：tagId、name、definition、usageCount、largeTenantCount、largeTenantRatio、status、createdBy、createdAt
 */
async function createTag1Table(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: 'Tag1表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: 'name', type: 1 },
          { field_name: 'definition', type: 1 },
          { field_name: 'usageCount', type: 2 },
          { field_name: 'largeTenantCount', type: 2 },
          { field_name: 'largeTenantRatio', type: 2 },
          {
            field_name: 'status',
            type: 3,
            property: {
              options: [
                { name: 'active', color: 0 },
                { name: 'inactive', color: 1 },
              ],
            },
          },
          { field_name: 'createdBy', type: 1 },
          { field_name: 'createdAt', type: 5 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建Tag1表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「Tag2表」（二级标签表）
 * 字段：tagId、name、definition、usageCount、largeTenantCount、largeTenantRatio、status、createdBy、createdAt
 */
async function createTag2Table(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: 'Tag2表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: 'name', type: 1 },
          { field_name: 'definition', type: 1 },
          { field_name: 'usageCount', type: 2 },
          { field_name: 'largeTenantCount', type: 2 },
          { field_name: 'largeTenantRatio', type: 2 },
          {
            field_name: 'status',
            type: 3,
            property: {
              options: [
                { name: 'active', color: 0 },
                { name: 'inactive', color: 1 },
              ],
            },
          },
          { field_name: 'createdBy', type: 1 },
          { field_name: 'createdAt', type: 5 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建Tag2表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「Tag3表」（三级标签表）
 * 字段：tagId、name、definition、usageCount、largeTenantCount、largeTenantRatio、status、createdBy、createdAt
 * status 选项包含"待确认"
 */
async function createTag3Table(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: 'Tag3表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: 'name', type: 1 },
          { field_name: 'definition', type: 1 },
          { field_name: 'usageCount', type: 2 },
          { field_name: 'largeTenantCount', type: 2 },
          { field_name: 'largeTenantRatio', type: 2 },
          {
            field_name: 'status',
            type: 3,
            property: {
              options: [
                { name: 'active', color: 0 },
                { name: 'inactive', color: 1 },
                { name: '待确认', color: 2 },
              ],
            },
          },
          { field_name: 'createdBy', type: 1 },
          { field_name: 'createdAt', type: 5 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建Tag3表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「租户信息」表
 */
async function createTenantInfoTable(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: '租户信息',
        fields: [
          { field_name: 'tenantId', type: 1 },
          { field_name: 'tenantName', type: 1 },
          {
            field_name: 'scale',
            type: 3,
            property: { options: TENANT_SCALE_OPTIONS },
          },
          { field_name: 'contact', type: 1 },
          { field_name: 'industry', type: 1 },
          { field_name: 'address', type: 1 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建租户信息表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「周期分析」表
 */
async function createPeriodAnalysisTable(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table: {
        name: '周期分析',
        fields: [
          { field_name: 'periodId', type: 1 },
          { field_name: 'periodName', type: 1 },
          { field_name: 'startDate', type: 5 },
          { field_name: 'endDate', type: 5 },
          { field_name: 'totalFeedbacks', type: 2 },
          { field_name: 'avgScore', type: 2 },
          { field_name: 'topIssues', type: 7 },
        ],
      },
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建周期分析表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 从 URL 或 Token 提取 appToken
 * 支持格式：
 * 1. https://my.feishu.cn/bitable/<appToken>
 * 2. https://my.feishu.cn/wiki/<wikiToken>?table=<tableId>
 * 3. 直接输入 appToken
 */
export function extractAppToken(input: string): string | null {
  // 1. Full URL: https://xxx.feishu.cn/base/<appToken> or /bitable/<appToken>
  const baseMatch = input.match(/\/base\/([a-zA-Z0-9]+)/);
  if (baseMatch) return baseMatch[1];
  const bitableMatch = input.match(/\/bitable\/([a-zA-Z0-9]+)/);
  if (bitableMatch) return bitableMatch[1];
  const wikiMatch = input.match(/\/wiki\/([a-zA-Z0-9]+)/);
  if (wikiMatch) return wikiMatch[1];

  // 2. Bare token (alphanumeric, > 10 chars)
  if (/^[a-zA-Z0-9]+$/.test(input) && input.length > 10) {
    return input;
  }

  return null;
}

/**
 * 从 URL 提取表格 ID
 */
export function extractTableId(input: string): string | null {
  const urlParams = new URLSearchParams(input.split('?')[1] || '');
  return urlParams.get('table') || null;
}

/**
 * 验证并获取表格信息
 */
export async function validateAndGetBitableInfo(
  appToken: string
): Promise<{
  valid: boolean;
  message: string;
  tables?: TableInfo[];
}> {
  const token = await getTenantAccessToken();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    if (data.code !== 0) {
      return { valid: false, message: `表格不存在或无权访问: ${data.msg}` };
    }

    const tables: TableInfo[] = [];
    for (const item of data.data?.items || []) {
      const fieldsResponse = await fetch(
        `${BITABLE_API_BASE}/apps/${appToken}/tables/${item.table_id}/fields`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const fieldsData = await fieldsResponse.json();
      tables.push({
        tableId: item.table_id,
        name: item.name,
        fields: fieldsData.data?.items || [],
      });
    }

    return { valid: true, message: '验证成功', tables };
  } catch (error) {
    return {
      valid: false,
      message: `验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 检查表格是否包含必要字段
 */
export function checkRequiredFields(
  tables: TableInfo[]
): {
  hasFeedbackTable: boolean;
  feedbackTableId?: string;
  missingFields: string[];
  fieldMapping: Record<string, string>;
} {
  const feedbackTable = tables.find(
    (t) => t.name === '反馈列表' || t.fields.some((f) => f.fieldName === 'feedbackId')
  );

  if (!feedbackTable) {
    return {
      hasFeedbackTable: false,
      missingFields: ['反馈列表表'],
      fieldMapping: {},
    };
  }

  const existingFields = feedbackTable.fields.map((f) => f.fieldName);

  const hasFeedbackId = existingFields.includes('feedbackId');
  const hasContent = existingFields.includes('content');
  const hasScore = existingFields.includes('score') || existingFields.includes('npsScore');
  const hasStatus = existingFields.includes('status');

  const missingFields: string[] = [];
  if (!hasFeedbackId) missingFields.push('feedbackId');
  if (!hasContent) missingFields.push('content');
  if (!hasScore) missingFields.push('npsScore');
  if (!hasStatus) missingFields.push('status');

  const fieldMapping: Record<string, string> = {};
  for (const field of feedbackTable.fields) {
    const name = field.fieldName.toLowerCase();
    if (name.includes('id') || name.includes('编号')) {
      fieldMapping['feedbackId'] = field.fieldName;
    } else if (name.includes('content') || name.includes('内容') || name.includes('评价')) {
      fieldMapping['content'] = field.fieldName;
    } else if (name.includes('score') || name.includes('评分')) {
      fieldMapping['score'] = field.fieldName;
    } else if (name.includes('status') || name.includes('状态')) {
      fieldMapping['status'] = field.fieldName;
    }
  }

  return {
    hasFeedbackTable: true,
    feedbackTableId: feedbackTable.tableId,
    missingFields,
    fieldMapping,
  };
}

/**
 * 为表格添加缺失字段
 */
export async function addMissingFields(
  appToken: string,
  tableId: string,
  missingFields: string[]
): Promise<void> {
  const token = await getTenantAccessToken();

  for (const fieldName of missingFields) {
    let fieldConfig: any;

    switch (fieldName) {
      case 'module':
        fieldConfig = { field_name: 'module', type: 1 };
        break;
      case 'tag1':
        fieldConfig = {
          field_name: 'tag1',
          type: 3,
          property: { options: TAG1_OPTIONS },
        };
        break;
      case 'tag2':
        fieldConfig = { field_name: 'tag2', type: 1 };
        break;
      case 'tag3':
        fieldConfig = { field_name: 'tag3', type: 1 };
        break;
      case 'status':
        fieldConfig = {
          field_name: 'status',
          type: 3,
          property: { options: STATUS_OPTIONS },
        };
        break;
      default:
        fieldConfig = { field_name: fieldName, type: 1 };
    }

    await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fieldConfig),
    });
  }
}
