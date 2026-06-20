/**
 * 飞书多维表格SDK封装
 * 使用直接HTTP请求方式，手动控制token传递
 */

import { BitableRecord, BitableQueryParams } from '@/lib/types';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

/** 获取多维表格Token */
function getBitableToken(): string {
  const token = process.env.BITABLE_TOKEN;
  if (!token) {
    throw new Error('多维表格Token未配置，请设置环境变量 BITABLE_TOKEN');
  }
  return token;
}

/** 获取表名到table_id的映射 */
function getTableIdMapping(): Record<string, string> {
  const mapping = process.env.BITABLE_TABLE_MAPPING;
  if (mapping) {
    try {
      return JSON.parse(mapping);
    } catch (e) {
      console.error('[Bitable] BITABLE_TABLE_MAPPING JSON 解析失败:', e);
    }
  }
  
  return {
    feedback: process.env.BITABLE_TABLE_ID || '',
    tags: process.env.BITABLE_TABLE_ID_TAGS || '',
    tenants: process.env.BITABLE_TABLE_ID_TENANTS || '',
    analysis: process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    config: process.env.BITABLE_TABLE_ID_CONFIG || '',
  };
}

/** 根据表名获取table_id */
export function resolveTableId(tableName: string): string {
  const mapping = getTableIdMapping();
  const tableId = mapping[tableName];
  
  if (!tableId) {
    console.warn(`[Bitable] 表名 ${tableName} 未配置对应的table_id，使用表名作为table_id`);
    return tableName;
  }
  
  return tableId;
}

/** 获取租户访问令牌 */
async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  
  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失');
  }
  
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取租户Token失败: ${data.msg}`);
  }
  
  return data.tenant_access_token;
}

/** 创建请求头 */
async function createHeaders(): Promise<Record<string, string>> {
  const token = await getTenantAccessToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ============================================
// 记录操作
// ============================================

export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>
): Promise<BitableRecord> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fields }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`创建记录失败: ${data.msg}`);
    }

    return {
      record_id: data.data?.record?.record_id || '',
      fields: (data.data?.record?.fields as Record<string, unknown>) || {},
    };
  } catch (error) {
    console.error(`[Bitable] 创建记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

export async function batchCreateRecords(
  tableId: string,
  records: Array<{ fields: Record<string, unknown> }>
): Promise<BitableRecord[]> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();
  try {
    const batchSize = 500;
    const results: BitableRecord[] = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ records: batch }),
      });

      const data = await response.json();
      if (data.code !== 0) {
        throw new Error(`批量创建记录失败: ${data.msg}`);
      }

      const createdRecords = data.data?.records || [];
      results.push(
        ...createdRecords.map((r: any) => ({
          record_id: (r.record_id || '') as string,
          fields: r.fields as Record<string, unknown>,
        }))
      );
    }

    return results;
  } catch (error) {
    console.error(`[Bitable] 批量创建记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<BitableRecord> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();
  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ fields }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`更新记录失败: ${data.msg}`);
    }

    return {
      record_id: data.data?.record?.record_id || recordId,
      fields: (data.data?.record?.fields as Record<string, unknown>) || {},
    };
  } catch (error) {
    console.error(`[Bitable] 更新记录失败 [表: ${tableId}, 记录: ${recordId}]`, error);
    throw error;
  }
}

export async function batchUpdateRecords(
  tableId: string,
  records: Array<{ record_id: string; fields: Record<string, unknown> }>
): Promise<BitableRecord[]> {
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const batchSize = 500;
    const results: BitableRecord[] = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_update`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ records: batch }),
      });

      const data = await response.json();
      if (data.code !== 0) {
        throw new Error(`批量更新记录失败: ${data.msg}`);
      }

      const updatedRecords = data.data?.records || [];
      results.push(
        ...updatedRecords.map((r: any) => ({
          record_id: (r.record_id || '') as string,
          fields: r.fields as Record<string, unknown>,
        }))
      );
    }

    return results;
  } catch (error) {
    console.error(`[Bitable] 批量更新记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

export async function deleteRecord(tableId: string, recordId: string): Promise<void> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
      method: 'DELETE',
      headers,
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`删除记录失败: ${data.msg}`);
    }
  } catch (error) {
    console.error(`[Bitable] 删除记录失败 [表: ${tableId}, 记录: ${recordId}]`, error);
    throw error;
  }
}

// ============================================
// 字段值解析工具 - 飞书Text/多行文本字段返回 {text, type}[] 格式
// ============================================

/**
 * 从飞书字段值中提取原始值
 * Text 字段: [{text: "...", type: "text"}] -> "..."
 * Number/DateTime 字段: 基本类型直接返回
 */
export function extractFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // [ { text: "...", type: "text" } ] 形式
    if (value.length === 0) return '';
    const first = value[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'text' in first) return String((first as { text: string }).text);
    return JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ============================================
// 查询操作
// ============================================

export async function getRecord(tableId: string, recordId: string): Promise<BitableRecord | null> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
      headers,
    });

    const data = await response.json();
    if (data.code !== 0) {
      if (data.code === 1254043) {
        return null;
      }
      throw new Error(`获取记录失败: ${data.msg}`);
    }

    return {
      record_id: data.data?.record?.record_id || '',
      fields: (data.data?.record?.fields as Record<string, unknown>) || {},
    };
  } catch (error) {
    console.error(`[Bitable] 获取记录失败 [表: ${tableId}, 记录: ${recordId}]`, error);
    throw error;
  }
}

export async function listRecords(
  tableId: string,
  params: BitableQueryParams = {}
): Promise<BitableRecord[]> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  const allRecords: BitableRecord[] = [];
  let pageToken: string | undefined = params.pageToken;

  try {
    do {
      const url = new URL(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records`);
      if (pageToken) url.searchParams.set('page_token', pageToken);
      if (params.pageSize) url.searchParams.set('page_size', String(params.pageSize));
      if (params.viewId) url.searchParams.set('view_id', params.viewId);
      if (params.filter) url.searchParams.set('filter', params.filter);
      if (params.sort) url.searchParams.set('sort', params.sort);
      if (params.fieldNames) url.searchParams.set('field_names', params.fieldNames.join(','));

      const response = await fetch(url.toString(), { headers });
      const data = await response.json();

      if (data.code !== 0) {
        throw new Error(`列出记录失败: ${data.msg}`);
      }

      const records = data.data?.items || [];
      allRecords.push(
        ...records.map((r: any) => ({
          record_id: (r.record_id || '') as string,
          fields: r.fields as Record<string, unknown>,
        }))
      );

      pageToken = data.data?.page_token;
      const hasMore = data.data?.has_more;

      if (!hasMore) break;
    } while (pageToken);

    return allRecords;
  } catch (error) {
    console.error(`[Bitable] 列出记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

export async function searchRecords(
  tableId: string,
  fieldName: string,
  fieldValue: string | number
): Promise<BitableRecord[]> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(
      `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: [{ field_name: fieldName, operator: 'is', value: [fieldValue] }],
          },
          page_size: 500,
        }),
      }
    );
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`搜索记录失败: ${data.msg}`);
    }
    const items = data.data?.items || [];
    return items.map((r: any) => ({
      record_id: r.record_id || '',
      fields: r.fields as Record<string, unknown>,
    }));
  } catch (error) {
    console.error(`[Bitable] 搜索记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

export async function searchRecordsFuzzy(
  tableId: string,
  fieldName: string,
  fieldValue: string
): Promise<BitableRecord[]> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(
      `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: [{ field_name: fieldName, operator: 'contains', value: [fieldValue] }],
          },
          page_size: 500,
        }),
      }
    );
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`模糊搜索记录失败: ${data.msg}`);
    }
    const items = data.data?.items || [];
    return items.map((r: any) => ({
      record_id: r.record_id || '',
      fields: r.fields as Record<string, unknown>,
    }));
  } catch (error) {
    console.error(`[Bitable] 模糊搜索记录失败 [表: ${tableId}]`, error);
    throw error;
  }
}

// ============================================
// 表操作
// ============================================

function getFieldTypeNumber(type: string): number {
  const typeMap: Record<string, number> = {
    Text: 1,
    Number: 2,
    SingleSelect: 3,
    MultiSelect: 4,
    DateTime: 5,
    Checkbox: 6,
    Textarea: 7,
    User: 8,
    Phone: 9,
    Email: 10,
    URL: 11,
    Attachment: 12,
    SingleLink: 13,
    Lookup: 14,
    Formula: 15,
    DuplexLink: 16,
    Location: 17,
    GroupChat: 18,
    AutoNumber: 19,
  };
  return typeMap[type] || 1;
}

export async function listTables(): Promise<Array<{ table_id: string; name: string }>> {
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, { headers });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`列出表失败: ${data.msg}`);
    }

    return (data.data?.items || []).map((item: any) => ({
      table_id: item.table_id || '',
      name: item.name || '',
    }));
  } catch (error) {
    console.error('[Bitable] 列出表失败', error);
    throw error;
  }
}

export async function createTable(
  name: string,
  fields: Array<{ field_name: string; field_type: string; property?: Record<string, unknown> }>
): Promise<string> {
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const mappedFields = fields.map((f) => ({
      field_name: f.field_name,
      type: getFieldTypeNumber(f.field_type),
      property: f.property,
    }));

    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ table: { name, fields: mappedFields } }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`创建表失败: ${data.msg}`);
    }

    return data.data?.table_id || '';
  } catch (error) {
    console.error(`[Bitable] 创建表失败 [名称: ${name}]`, error);
    throw error;
  }
}

export async function addField(
  tableId: string,
  fieldName: string,
  fieldType: number,
  property?: Record<string, unknown>
): Promise<void> {
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ field_name: fieldName, type: fieldType, property }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`添加字段失败: ${data.msg}`);
    }
  } catch (error) {
    console.error(`[Bitable] 添加字段失败 [表: ${tableId}, 字段: ${fieldName}]`, error);
    throw error;
  }
}

// ============================================
// 导出便捷对象
// ============================================

export const bitableClient = {
  createRecord,
  batchCreateRecords,
  updateRecord,
  batchUpdateRecords,
  deleteRecord,
  getRecord,
  listRecords,
  searchRecords,
  searchRecordsFuzzy,
  listTables,
  createTable,
  addField,
};
