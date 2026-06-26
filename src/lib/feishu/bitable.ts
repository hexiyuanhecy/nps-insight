/**
 * 飞书多维表格SDK封装
 * 使用直接HTTP请求方式，手动控制token传递
 */

import { BitableRecord, BitableQueryParams } from '@/lib/types';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

// 配置缓存（从 KV 读取后缓存）
let configCache: Record<string, string> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60000; // 缓存 60 秒

/** 从环境变量构建表映射 */
function buildEnvMapping(): Record<string, string> {
  return {
    feedback: process.env.BITABLE_FEEDBACK_TABLE_ID || process.env.BITABLE_TABLE_ID || '',
    tag1: process.env.BITABLE_TAG1_TABLE_ID || process.env.BITABLE_TAGS_TABLE_ID || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag2: process.env.BITABLE_TAG2_TABLE_ID || process.env.BITABLE_TAGS_TABLE_ID || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag3: process.env.BITABLE_TAG3_TABLE_ID || process.env.BITABLE_TAGS_TABLE_ID || process.env.BITABLE_TABLE_ID_TAGS || '',
    tenants: process.env.BITABLE_TENANTS_TABLE_ID || process.env.BITABLE_TABLE_ID_TENANTS || '',
    analysis: process.env.BITABLE_ANALYSIS_TABLE_ID || process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    top_issues: process.env.BITABLE_ANALYSIS_TABLE_ID || process.env.BITABLE_TABLE_ID_ANALYSIS || '',
  };
}

/** 从 KV 获取配置并缓存（优先使用环境变量，KV 作为补充） */
async function getConfigFromKV(): Promise<Record<string, string>> {
  const now = Date.now();
  if (configCache && now - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache;
  }

  // 优先从环境变量加载（本地开发环境）
  const envMapping = buildEnvMapping();

  // 尝试从 KV 加载（生产环境），带超时保护，避免 KV 不可用时挂起
  try {
    const kvPromise = (async () => {
      const { getConfig } = await import('@/lib/storage/kv-storage');
      const config = await getConfig('default_owner');
      return config;
    })();

    // 3秒超时，超过则跳过 KV
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });

    const config = await Promise.race([kvPromise, timeoutPromise]);
    if (config) {
      const bitable = config.bitable as Record<string, string> || {};
      const kvMapping: Record<string, string> = {
        feedback: bitable.feedbackTableId || '',
        tag1: bitable.tagsTableId || bitable.tag2TableId || bitable.tag3TableId || '',
        tag2: bitable.tag2TableId || '',
        tag3: bitable.tag3TableId || '',
        tenants: bitable.tenantsTableId || '',
        analysis: bitable.analysisTableId || '',
      };
      // 合并：环境变量优先，KV 补充空值
      const merged: Record<string, string> = { ...kvMapping };
      for (const [key, value] of Object.entries(envMapping)) {
        if (value && !merged[key]) {
          merged[key] = value;
        }
      }
      configCache = merged;
      configCacheTime = now;
      console.log('[Bitable] 配置已加载（环境变量+KV）:', configCache);
      return configCache;
    }
  } catch (e) {
    console.warn('[Bitable] 从 KV 读取配置失败，使用环境变量:', e);
  }

  // KV 不可用，使用环境变量
  configCache = envMapping;
  configCacheTime = now;
  console.log('[Bitable] 配置已加载（仅环境变量）:', configCache);
  return configCache;
}

// 动态表名映射缓存
let dynamicTableMapping: Record<string, string> | null = null;
let dynamicMappingTime = 0;
const DYNAMIC_MAPPING_TTL = 300000; // 缓存 5 分钟

/** 从飞书 API 动态获取表名到 table_id 的映射 */
async function fetchDynamicTableMapping(): Promise<Record<string, string>> {
  const now = Date.now();
  if (dynamicTableMapping && now - dynamicMappingTime < DYNAMIC_MAPPING_TTL) {
    return dynamicTableMapping;
  }

  try {
    const token = await getTenantAccessToken();
    const appToken = getBitableToken();
    const res = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.code !== 0) {
      console.error('[Bitable] 获取表列表失败:', data.msg);
      return {};
    }

    const mapping: Record<string, string> = {};
    for (const table of data.data.items || []) {
      // 匹配表名（忽略大小写和空格）
      const name = table.name.trim();
      const nameLower = name.toLowerCase();

      if (nameLower === '反馈列表' || nameLower === '反馈表') {
        mapping.feedback = table.table_id;
      } else if (nameLower === 'tag1表' || nameLower === 'tag1') {
        mapping.tag1 = table.table_id;
      } else if (nameLower === 'tag2表' || nameLower === 'tag2') {
        mapping.tag2 = table.table_id;
      } else if (nameLower === 'tag3表' || nameLower === 'tag3') {
        mapping.tag3 = table.table_id;
      } else if (nameLower === '租户信息' || nameLower === '租户表') {
        mapping.tenants = table.table_id;
      } else if (nameLower === '周期分析' || nameLower === '分析表') {
        mapping.analysis = table.table_id;
      }
    }

    dynamicTableMapping = mapping;
    dynamicMappingTime = now;
    console.log('[Bitable] 动态获取表映射:', mapping);
    return mapping;
  } catch (e) {
    console.error('[Bitable] 动态获取表映射失败:', e);
    return {};
  }
}

/** 同步获取表映射（优先 KV，fallback 环境变量） */
async function getTableIdMappingAsync(): Promise<Record<string, string>> {
  const kvConfig = await getConfigFromKV();

  // 合并环境变量和 KV 配置，KV 配置优先
  const envMapping = {
    feedback: process.env.BITABLE_TABLE_ID || '',
    tags: process.env.BITABLE_TABLE_ID_TAGS || '',
    tag1: process.env.BITABLE_TABLE_ID_TAG1 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag2: process.env.BITABLE_TABLE_ID_TAG2 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag3: process.env.BITABLE_TABLE_ID_TAG3 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tenants: process.env.BITABLE_TABLE_ID_TENANTS || '',
    analysis: process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    top_issues: process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    config: process.env.BITABLE_TABLE_ID_CONFIG || '',
  };

  // KV 配置覆盖环境变量
  return {
    ...envMapping,
    ...kvConfig,
  };
}

/** 获取多维表格Token */
function getBitableToken(): string {
  const token = process.env.BITABLE_TOKEN;
  if (!token) {
    throw new Error('多维表格Token未配置，请设置环境变量 BITABLE_TOKEN');
  }
  return token;
}

/** 获取表名到table_id的映射（同步版本，仅使用环境变量） */
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
    tag1: process.env.BITABLE_TABLE_ID_TAG1 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag2: process.env.BITABLE_TABLE_ID_TAG2 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tag3: process.env.BITABLE_TABLE_ID_TAG3 || process.env.BITABLE_TABLE_ID_TAGS || '',
    tenants: process.env.BITABLE_TABLE_ID_TENANTS || '',
    analysis: process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    top_issues: process.env.BITABLE_TABLE_ID_ANALYSIS || '',
    config: process.env.BITABLE_TABLE_ID_CONFIG || '',
  };
}

/** 根据表名获取table_id（优先异步 KV 配置） */
export async function resolveTableIdAsync(tableName: string): Promise<string> {
  // 1. 优先使用 KV 配置
  const kvMapping = await getTableIdMappingAsync();
  const kvTableId = kvMapping[tableName];
  if (kvTableId) {
    return kvTableId;
  }

  // 2. 回退到同步版本（环境变量）
  const syncMapping = getTableIdMapping();
  const syncTableId = syncMapping[tableName];
  if (syncTableId) {
    return syncTableId;
  }

  // 3. 最后尝试动态获取表名映射
  try {
    const dynamicMapping = await fetchDynamicTableMapping();
    const dynamicTableId = dynamicMapping[tableName];
    if (dynamicTableId) {
      console.log(`[Bitable] 通过动态映射找到 ${tableName} -> ${dynamicTableId}`);
      return dynamicTableId;
    }
  } catch (e) {
    console.warn(`[Bitable] 动态获取表映射失败:`, e);
  }

  console.warn(`[Bitable] 表名 ${tableName} 未配置对应的table_id，使用表名作为table_id`);
  return tableName;
}

/** 根据表名获取table_id（同步版本，自动从 KV 初始化配置） */
export function resolveTableId(tableName: string): string {
  // 如果 KV 配置已缓存，直接使用缓存
  if (configCache) {
    const tableId = configCache[tableName];
    if (tableId) {
      return tableId;
    }
  }

  // 回退到环境变量
  const mapping = getTableIdMapping();
  const tableId = mapping[tableName];

  if (tableId) {
    return tableId;
  }

  console.warn(`[Bitable] 表名 ${tableName} 未配置对应的table_id，使用表名作为table_id`);
  return tableName;
}

/** 初始化配置（从 KV 加载，可在应用启动时调用） */
export async function initializeBitableConfig(): Promise<void> {
  // 1. 加载 KV 配置
  await getConfigFromKV();

  // 2. 预加载动态表名映射
  try {
    const dynamicMapping = await fetchDynamicTableMapping();
    // 合并到 configCache
    if (configCache) {
      configCache = { ...configCache, ...dynamicMapping };
    } else {
      configCache = dynamicMapping;
    }
    console.log('[Bitable] 配置已从 KV 初始化，合并后:', configCache);
  } catch (e) {
    console.warn('[Bitable] 预加载动态表名映射失败:', e);
  }
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

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`批量创建记录 HTTP ${response.status}: ${text.substring(0, 500)}`);
      }

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
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const batchSize = 500;
    const results: BitableRecord[] = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ records: batch }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`批量更新记录 HTTP ${response.status}: ${text.substring(0, 500)}`);
      }

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

/**
 * 从飞书 MultiSelect 字段值中提取字符串数组
 * 支持两种格式：
 * 1. 字符串数组: ["tag1", "tag2"]
 * 2. 对象数组: [{text: "tag1"}, {text: "tag2"}]
 * @returns 字符串数组，空值返回 []
 */
export function extractMultiSelectFieldValue(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text: string }).text);
        }
        return '';
      })
      .filter(t => t);
  }
  if (typeof value === 'string') {
    return value ? [value] : [];
  }
  return [];
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

/**
 * 获取字段列表
 * @param tableId 表ID
 * @returns 字段列表
 */
export async function listFields(tableId: string): Promise<Array<{ field_id: string; field_name: string; type: number; property?: Record<string, unknown> }>> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields?page_size=100`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取字段列表失败: ${data.msg}`);
    }

    return data.data?.items || [];
  } catch (error) {
    console.error(`[Bitable] 获取字段列表失败 [表: ${tableId}]`, error);
    throw error;
  }
}

/**
 * 更新字段属性
 * @param tableId 表ID
 * @param fieldId 字段ID
 * @param fieldName 字段名称
 * @param fieldType 字段类型
 * @param property 字段属性
 */
export async function updateField(
  tableId: string,
  fieldId: string,
  fieldName: string,
  fieldType: number,
  property?: Record<string, unknown>
): Promise<void> {
  tableId = resolveTableId(tableId);
  const appToken = getBitableToken();
  const headers = await createHeaders();

  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields/${fieldId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ field_name: fieldName, type: fieldType, property }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`更新字段失败: ${data.msg}`);
    }
  } catch (error) {
    console.error(`[Bitable] 更新字段失败 [表: ${tableId}, 字段: ${fieldName}]`, error);
    throw error;
  }
}

/**
 * 为多选字段添加新选项
 * @param tableId 表ID
 * @param fieldName 字段名
 * @param newOptions 新选项名称数组
 */
export async function addMultiSelectOptions(
  tableId: string,
  fieldName: string,
  newOptions: string[]
): Promise<void> {
  if (newOptions.length === 0) return;

  const fields = await listFields(tableId);
  const field = fields.find(f => f.field_name === fieldName);

  if (!field) {
    throw new Error(`字段不存在: ${fieldName}`);
  }

  if (field.type !== 4) {
    throw new Error(`字段不是多选类型: ${fieldName}, 类型: ${field.type}`);
  }

  // 获取现有选项
  const existingOptions = (field.property?.options as Array<{ name: string; id?: string; color?: number }>) || [];
  const existingOptionNames = new Set(existingOptions.map(opt => opt.name));

  // 过滤出真正新增的选项
  const optionsToAdd = newOptions.filter(opt => !existingOptionNames.has(opt));

  if (optionsToAdd.length === 0) {
    console.log(`[Bitable] 多选字段 ${fieldName} 无需添加新选项`);
    return;
  }

  // 生成新选项（颜色从0-19循环分配）
  const newOptionObjects = optionsToAdd.map((name, index) => ({
    name,
    color: index % 20,
  }));

  // 合并现有选项和新选项
  const mergedOptions = [...existingOptions, ...newOptionObjects];

  console.log(`[Bitable] 为多选字段 ${fieldName} 添加 ${optionsToAdd.length} 个新选项: ${optionsToAdd.join(', ')}`);

  // 更新字段
  await updateField(tableId, field.field_id, fieldName, 4, { options: mergedOptions });
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
  listFields,
  updateField,
  addMultiSelectOptions,
  extractFieldValue,
  extractMultiSelectFieldValue,
};
