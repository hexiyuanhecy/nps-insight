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
  const token = await getTenantAccessToken()

  // 1. 创建多维表格应用
  const appResponse = await fetch(
    'https://open.feishu.cn/open-apis/bitable/v1/apps',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    }
  )

  const appData = await appResponse.json()
  console.log('[创建表格] 应用创建响应:', JSON.stringify(appData))
  if (appData.code !== 0) {
    throw new Error(`创建多维表格失败: ${appData.msg}`)
  }

  const appToken = appData.data?.app?.app_token
  console.log('[创建表格] 应用创建成功，appToken:', appToken)

  // 等待应用完全初始化（飞书API创建应用后有同步延迟）
  console.log('[创建表格] 等待应用初始化...')
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // 2. 创建所有基础表（不带关联字段）
  const [
    tag1TableId,
    tag2TableId,
    tag3TableId,
    feedbackTableId,
    tenantTableId,
    periodTableId
  ] = await Promise.all([
    createTag1TableWithRetry(token, appToken),
    createTag2TableWithRetry(token, appToken),
    createTag3TableWithRetry(token, appToken),
    createFeedbackListTableWithRetry(token, appToken),
    createTenantInfoTableWithRetry(token, appToken),
    createPeriodAnalysisTableWithRetry(token, appToken)
  ])

  // 3. 添加关联字段（在所有表创建完成后）
  console.log('[创建表格] 添加关联字段...')
  await addRelationFields(
    token,
    appToken,
    tag1TableId,
    tag2TableId,
    tag3TableId,
    feedbackTableId,
    periodTableId
  )

  // 4. 为标签表添加公式字段（需在所有表创建完成后执行）
  await addTagTableFormulas(token, appToken, feedbackTableId)

  return {
    appToken,
    tables: {
      feedbackTableId,
      tag1TableId,
      tag2TableId,
      tag3TableId,
      tenantTableId,
      periodTableId
    }
  }
}

/**
 * 添加关联字段（在所有表创建完成后执行）
 * 飞书API要求关联字段必须在目标表存在后才能创建
 */
async function addRelationFields(
  token: string,
  appToken: string,
  tag1TableId: string,
  tag2TableId: string,
  tag3TableId: string,
  feedbackTableId: string,
  periodTableId: string
): Promise<void> {
  const addField = async (
    tableId: string,
    fieldName: string,
    foreignTableId: string,
    multiple: boolean = false
  ) => {
    console.log(`[关联字段] 添加 ${fieldName} -> ${foreignTableId}`)
    const response = await fetch(
      `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          field_name: fieldName,
          type: 16,
          property: {
            foreign_table_id: foreignTableId,
            multiple
          }
        })
      }
    )

    const data = await response.json()
    if (data.code !== 0) {
      console.warn(`[关联字段] 添加失败 [${fieldName}]: ${data.msg}`)
    } else {
      console.log(`[关联字段] 添加成功: ${fieldName}`)
    }
  }

  await Promise.all([
    addField(tag2TableId, '所属一级标签', tag1TableId),
    addField(tag3TableId, '所属二级标签', tag2TableId),
    addField(feedbackTableId, 'Tag1', tag1TableId, true),
    addField(feedbackTableId, 'Tag2', tag2TableId, true),
    addField(feedbackTableId, 'Tag3', tag3TableId, true),
    addField(periodTableId, '所属模块', tag2TableId),
    addField(periodTableId, '具体问题', tag3TableId, true)
  ])
}

/**
 * 为标签表添加公式字段
 * 公式字段依赖反馈表的关联字段，因此必须在所有表创建完成后添加
 */
async function addTagTableFormulas(
  token: string,
  appToken: string,
  feedbackTableId: string
): Promise<void> {
  const feedbackFieldsResponse = await fetch(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${feedbackTableId}/fields`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }
  )
  const feedbackFieldsData = await feedbackFieldsResponse.json()
  if (feedbackFieldsData.code !== 0) {
    console.warn(
      `[公式] 获取反馈表字段失败，跳过公式配置: ${feedbackFieldsData.msg}`
    )
    return
  }

  const fieldMap: Record<string, string> = {}
  for (const item of feedbackFieldsData.data?.items || []) {
    const name = item.field_name || ''
    if (name === 'Tag1') fieldMap.tag1 = item.field_id || ''
    else if (name === 'Tag2') fieldMap.tag2 = item.field_id || ''
    else if (name === 'Tag3') fieldMap.tag3 = item.field_id || ''
  }

  const FORMULA_TYPE = 15

  // Tag1表公式字段
  await addFormulaField(token, appToken, 'Tag1表', '总使用次数', FORMULA_TYPE, {
    formula: `COUNTA(关联(反馈列表.${fieldMap.tag1 || 'Tag1'}))`
  })
  await addFormulaField(
    token,
    appToken,
    'Tag1表',
    '大租户使用次数',
    FORMULA_TYPE,
    {
      formula: `COUNTA(FILTER(关联(反馈列表.${fieldMap.tag1 || 'Tag1'}), 反馈列表.租户规模 IN ["A4", "A5", "A6"]))`
    }
  )
  await addFormulaField(token, appToken, 'Tag1表', '大租户占比', FORMULA_TYPE, {
    formula: `IF(总使用次数 > 0, 大租户使用次数 / 总使用次数, 0)`
  })
  await addFormulaField(token, appToken, 'Tag1表', '平均评分', FORMULA_TYPE, {
    formula: `AVERAGE(关联(反馈列表.${fieldMap.tag1 || 'Tag1'}).评分)`
  })

  // Tag2表公式字段
  await addFormulaField(token, appToken, 'Tag2表', '总使用次数', FORMULA_TYPE, {
    formula: `COUNTA(关联(反馈列表.${fieldMap.tag2 || 'Tag2'}))`
  })
  await addFormulaField(
    token,
    appToken,
    'Tag2表',
    '大租户使用次数',
    FORMULA_TYPE,
    {
      formula: `COUNTA(FILTER(关联(反馈列表.${fieldMap.tag2 || 'Tag2'}), 反馈列表.租户规模 IN ["A4", "A5", "A6"]))`
    }
  )
  await addFormulaField(token, appToken, 'Tag2表', '大租户占比', FORMULA_TYPE, {
    formula: `IF(总使用次数 > 0, 大租户使用次数 / 总使用次数, 0)`
  })
  await addFormulaField(token, appToken, 'Tag2表', '平均评分', FORMULA_TYPE, {
    formula: `AVERAGE(关联(反馈列表.${fieldMap.tag2 || 'Tag2'}).评分)`
  })
  await addFormulaField(
    token,
    appToken,
    'Tag2表',
    '下级 Tag3 数量',
    FORMULA_TYPE,
    {
      formula: `COUNTA(关联(Tag3表.所属二级标签))`
    }
  )

  // Tag3表公式字段
  await addFormulaField(token, appToken, 'Tag3表', '总使用次数', FORMULA_TYPE, {
    formula: `COUNTA(关联(反馈列表.${fieldMap.tag3 || 'Tag3'}))`
  })
  await addFormulaField(
    token,
    appToken,
    'Tag3表',
    '大租户使用次数',
    FORMULA_TYPE,
    {
      formula: `COUNTA(FILTER(关联(反馈列表.${fieldMap.tag3 || 'Tag3'}), 反馈列表.租户规模 IN ["A4", "A5", "A6"]))`
    }
  )
  await addFormulaField(token, appToken, 'Tag3表', '大租户占比', FORMULA_TYPE, {
    formula: `IF(总使用次数 > 0, 大租户使用次数 / 总使用次数, 0)`
  })
  await addFormulaField(token, appToken, 'Tag3表', '平均评分', FORMULA_TYPE, {
    formula: `AVERAGE(关联(反馈列表.${fieldMap.tag3 || 'Tag3'}).评分)`
  })

  console.log('[公式] 标签表公式字段配置完成')
}

/**
 * 为指定表添加公式字段
 */
async function addFormulaField(
  token: string,
  appToken: string,
  tableName: string,
  fieldName: string,
  fieldType: number,
  property: Record<string, unknown>
): Promise<void> {
  // 先获取表 ID
  const tablesResponse = await fetch(
    `${BITABLE_API_BASE}/apps/${appToken}/tables`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const tablesData = await tablesResponse.json();
  let tableId = '';
  for (const item of tablesData.data?.items || []) {
    if (item.name === tableName) {
      tableId = item.table_id;
      break;
    }
  }
  if (!tableId) {
    console.warn(`[公式] 未找到表: ${tableName}`);
    return;
  }

  // 检查字段是否已存在
  const fieldsResponse = await fetch(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const fieldsData = await fieldsResponse.json();
  for (const item of fieldsData.data?.items || []) {
    if (item.field_name === fieldName) {
      console.log(`[公式] 字段已存在，跳过: ${tableName}.${fieldName}`);
      return;
    }
  }

  // 添加公式字段
  const response = await fetch(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ field_name: fieldName, type: fieldType, property }),
    }
  );
  const data = await response.json();
  if (data.code !== 0) {
    console.warn(`[公式] 添加字段失败 [${tableName}.${fieldName}]: ${data.msg}`);
  } else {
    console.log(`[公式] 添加公式字段成功: ${tableName}.${fieldName}`);
  }
}

const DISSATISFACTION_REASON_OPTIONS = [
  { name: '系统卡顿', color: 0 },
  { name: '界面不美观', color: 1 },
  { name: '功能缺失', color: 2 },
  { name: '打开速度慢', color: 3 },
  { name: '其他', color: 4 },
  { name: '缺少功能', color: 5 }
]

/**
 * 创建「反馈列表」表
 * PRD v2 字段名对齐：使用中文字段名，关联字段后续添加
 */
async function createFeedbackListTable(
  token: string,
  appToken: string
): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: '反馈列表',
        default_view_name: '默认视图',
        fields: [
          { field_name: '反馈ID', type: 1 },
          { field_name: '租户ID', type: 1 },
          { field_name: '租户名称', type: 1 },
          {
            field_name: '租户规模',
            type: 3,
            property: { options: TENANT_SCALE_OPTIONS }
          },
          { field_name: '用户ID', type: 1 },
          { field_name: '用户名称', type: 1 },
          { field_name: '创建时间', type: 5 },
          {
            field_name: '不满意原因',
            type: 4,
            property: { options: DISSATISFACTION_REASON_OPTIONS }
          },
          { field_name: '反馈原文', type: 1 },
          { field_name: '翻译后文本', type: 1 },
          { field_name: '评分', type: 2 },
          { field_name: '反馈平台', type: 1 },
          { field_name: 'AI 置信度', type: 2 },
          { field_name: '需查日志', type: 7 },
          { field_name: '待审核', type: 7 },
          {
            field_name: '打标状态',
            type: 3,
            property: {
              options: [
                { name: '未打标', color: 0 },
                { name: '已打标', color: 1 }
              ]
            }
          }
        ]
      }
    })
  })

  const data = await response.json()
  if (data.code !== 0) {
    throw new Error(`创建反馈列表表失败: ${data.msg}`)
  }

  return data.data?.table_id
}

/**
 * 创建「Tag1表」（一级标签表）
 * PRD v2 字段名对齐：使用中文字段名，公式字段后续单独添加
 */
async function createTag1Table(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: 'Tag1表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: '标签名称', type: 1 },
          { field_name: '定义说明', type: 1 }
        ]
      }
    })
  })

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建Tag1表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「Tag2表」（二级标签表）
 * PRD v2 字段名对齐：使用中文字段名，关联字段和公式字段后续单独添加
 */
async function createTag2Table(
  token: string,
  appToken: string
): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: 'Tag2表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: '标签名称', type: 1 }
        ]
      }
    })
  })

  const data = await response.json()
  if (data.code !== 0) {
    throw new Error(`创建Tag2表失败: ${data.msg}`)
  }

  return data.data?.table_id
}

/**
 * 创建「Tag3表」（三级标签表）
 * PRD v2 字段名对齐：使用中文字段名，关联字段和公式字段后续单独添加
 */
async function createTag3Table(
  token: string,
  appToken: string
): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: 'Tag3表',
        fields: [
          { field_name: 'tagId', type: 1 },
          { field_name: '标签名称', type: 1 }
        ]
      }
    })
  })

  const data = await response.json()
  if (data.code !== 0) {
    throw new Error(`创建Tag3表失败: ${data.msg}`)
  }

  return data.data?.table_id
}

/**
 * 创建「租户信息」表
 * PRD v2 字段名对齐：使用中文字段名
 */
async function createTenantInfoTable(token: string, appToken: string): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: '租户信息',
        fields: [
          { field_name: '租户ID', type: 1 },
          { field_name: '租户名称', type: 1 },
          {
            field_name: '规模',
            type: 3,
            property: { options: TENANT_SCALE_OPTIONS }
          },
          { field_name: '是否企业版', type: 7 },
          { field_name: '联系人', type: 1 },
          { field_name: '联系邮箱', type: 1 },
          { field_name: '日志平台', type: 1 },
          { field_name: '日志端点', type: 1 },
          { field_name: '创建时间', type: 5 }
        ]
      }
    })
  })

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建租户信息表失败: ${data.msg}`);
  }

  return data.data?.table_id;
}

/**
 * 创建「周期分析」表（Top问题表）
 * PRD v2 要求：所属模块关联Tag2，具体问题关联Tag3（多选）
 */
async function createPeriodAnalysisTable(
  token: string,
  appToken: string
): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      table: {
        name: '周期分析',
        default_view_name: '默认视图',
        fields: [
          { field_name: 'periodId', type: 1 },
          { field_name: 'periodName', type: 1 },
          { field_name: 'startDate', type: 5 },
          { field_name: 'endDate', type: 5 },
          { field_name: 'totalFeedbacks', type: 2 },
          { field_name: 'avgScore', type: 2 },
          { field_name: '所属模块', type: 1 },
          { field_name: '具体问题', type: 1 },
          { field_name: '问题标识', type: 1 },
          { field_name: '总反馈数', type: 2 },
          { field_name: '本周期新增', type: 2 },
          { field_name: 'A4反馈数', type: 2 },
          { field_name: 'A5反馈数', type: 2 },
          { field_name: 'A6反馈数', type: 2 },
          { field_name: '大租户反馈数', type: 2 },
          { field_name: '大租户占比', type: 2 },
          { field_name: '平均分', type: 2 },
          { field_name: '人工排序', type: 2 },
          { field_name: '负责人', type: 1 },
          { field_name: '解决方案', type: 1 },
          {
            field_name: '状态',
            type: 3,
            property: {
              options: [
                { name: '待讨论', color: 0 },
                { name: '已排期', color: 1 },
                { name: '已上线', color: 2 },
                { name: '验证中', color: 3 }
              ]
            }
          },
          {
            field_name: '迭代周期',
            type: 3,
            property: {
              options: [
                { name: 'Sprint 1', color: 0 },
                { name: 'Sprint 2', color: 1 },
                { name: 'Sprint 3+', color: 2 },
                { name: '待定', color: 3 }
              ]
            }
          }
        ]
      }
    })
  })

  const data = await response.json()
  if (data.code !== 0) {
    throw new Error(`创建周期分析表失败: ${data.msg}`)
  }

  return data.data?.table_id
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
 * 返回所有表的 ID
 */
export function checkRequiredFields(
  tables: TableInfo[]
): {
  hasFeedbackTable: boolean;
  feedbackTableId?: string;
  tagsTableId?: string;
  tenantsTableId?: string;
  analysisTableId?: string;
  missingFields: string[];
  fieldMapping: Record<string, string>;
} {
  const feedbackTable = tables.find(
    (t) => t.name === '反馈列表' || t.fields.some((f) => f.fieldName === 'feedbackId')
  );

  // 查找其他表
  const tag1Table = tables.find(t => t.name === 'Tag1表' || t.name === 'Tag1');
  const tag2Table = tables.find(t => t.name === 'Tag2表' || t.name === 'Tag2');
  const tag3Table = tables.find(t => t.name === 'Tag3表' || t.name === 'Tag3');
  const tenantTable = tables.find(t => t.name === '租户信息' || t.name === '租户表');
  const analysisTable = tables.find(t => t.name === '周期分析' || t.name === 'Top问题表' || t.name === '分析表');

  if (!feedbackTable) {
    return {
      hasFeedbackTable: false,
      missingFields: ['反馈列表表'],
      fieldMapping: {},
    };
  }

  const existingFields = feedbackTable.fields.map((f) => f.fieldName);

  const hasFeedbackId = existingFields.includes('feedbackId');
  const hasContent = existingFields.includes('content') || existingFields.includes('反馈原文');
  const hasScore = existingFields.includes('score') || existingFields.includes('npsScore') || existingFields.includes('评分');
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
    } else if (name.includes('content') || name.includes('内容') || name.includes('评价') || name.includes('原文')) {
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
    tagsTableId: tag1Table?.tableId || tag2Table?.tableId || tag3Table?.tableId || '',
    tenantsTableId: tenantTable?.tableId || '',
    analysisTableId: analysisTable?.tableId || '',
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

/**
 * 根据表名查询已存在的表ID
 */
async function findTableByName(token: string, appToken: string, tableName: string): Promise<string | null> {
  try {
    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    if (data.code === 0 && data.data?.items) {
      const table = data.data.items.find((item: any) => item.name === tableName);
      if (table) {
        console.log(`[创建表格] 找到已存在的表 ${tableName}: ${table.table_id}`);
        return table.table_id;
      }
    }
  } catch (error) {
    console.warn(`[创建表格] 查询表失败: ${error}`);
  }
  return null;
}

/**
 * 创建表的通用重试包装函数
 */
async function createTableWithRetry<T extends any[]>(
  tableName: string,
  createFn: (...args: T) => Promise<string>,
  ...args: T
): Promise<string> {
  const maxRetries = 5;
  const delayMs = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[创建表格] 创建${tableName}...`);
      const tableId = await createFn(...args);
      console.log(`[创建表格] ${tableName}创建成功: ${tableId}`);
      return tableId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';

      if (errorMsg.includes('TableNameDuplicated')) {
        console.log(`[创建表格] 表 ${tableName} 已存在，尝试查询...`);
        const token = args[0] as string;
        const appToken = args[1] as string;
        const existingTableId = await findTableByName(token, appToken, tableName);
        if (existingTableId) {
          console.log(`[创建表格] 使用已存在的表 ${tableName}: ${existingTableId}`);
          return existingTableId;
        }
      }

      if (i < maxRetries - 1) {
        console.warn(`[创建表格] ${tableName}创建失败，重试 ${i + 1}/${maxRetries}: ${errorMsg}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw new Error(`创建${tableName}失败: ${errorMsg}`);
      }
    }
  }

  throw new Error(`创建${tableName}失败`);
}

/**
 * 带重试的表创建函数
 */
async function createTag1TableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('Tag1表', createTag1Table, token, appToken);
}

async function createTag2TableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('Tag2表', createTag2Table, token, appToken);
}

async function createTag3TableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('Tag3表', createTag3Table, token, appToken);
}

async function createFeedbackListTableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('反馈列表', createFeedbackListTable, token, appToken);
}

async function createTenantInfoTableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('租户信息', createTenantInfoTable, token, appToken);
}

async function createPeriodAnalysisTableWithRetry(token: string, appToken: string): Promise<string> {
  return createTableWithRetry('周期分析', createPeriodAnalysisTable, token, appToken);
}
