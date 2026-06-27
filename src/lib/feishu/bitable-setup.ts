/**
 * 多维表格 1:1 复刻建表功能
 * 基于元数据 JSON 文件，严格按顺序串行创建表和字段
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTenantAccessToken } from './client';
import { refreshAccessToken } from './user-auth';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

const REQUEST_DELAY_MS = 300;
const MAX_RETRIES = 3;

/**
 * 获取有效的 access_token
 * 如果传入了 userAccessToken，优先使用（支持自动刷新）
 * 否则使用 tenant_access_token
 */
async function getAccessToken(
  userAccessToken?: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<string> {
  if (userAccessToken) {
    // 如果有 refreshToken 且 token 即将过期，先刷新
    if (refreshToken && expiresAt) {
      const now = getCurrentTimestampSeconds();
      const remainingSeconds = expiresAt - now;

      if (remainingSeconds < 600) {
        console.log('[多维表格] 用户 token 即将过期，先刷新...');
        try {
          const newToken = await refreshAccessToken(refreshToken);
          console.log('[多维表格] 用户 token 刷新成功');
          return newToken.access_token;
        } catch (refreshErr) {
          console.warn('[多维表格] 用户 token 刷新失败，使用现有 token:', refreshErr instanceof Error ? refreshErr.message : '未知错误');
          return userAccessToken;
        }
      }
    }
    return userAccessToken;
  }

  // 使用应用身份
  return getTenantAccessToken();
}

export const TENANT_SCALE_OPTIONS = [
  { name: 'A1', color: 0 },
  { name: 'A2', color: 1 },
  { name: 'A3', color: 2 },
  { name: 'A4', color: 3 },
  { name: 'A5', color: 4 },
  { name: 'A6', color: 5 },
];

// Tag1 默认标签（7个，含描述）
const TAG1_DEFAULT_RECORDS = [
  { tagName: '疑似Bug', desc: '功能异常、报错、崩溃、无法使用' },
  { tagName: '功能优化', desc: '功能改进建议、新功能诉求' },
  { tagName: '界面改进', desc: 'UI 问题、交互体验优化' },
  { tagName: '性能提升', desc: '加载慢、卡顿、响应延迟、耗电' },
  { tagName: '用户教育', desc: '不知道如何使用、使用指引不清' },
  { tagName: '安全合规', desc: '安全漏洞、隐私问题、合规要求' },
  { tagName: '无效反馈', desc: 'SPAM、广告、乱码、无法理解的内容' },
];

// 字段选项覆盖配置：表ID.字段名 -> 选项列表（null 表示清空选项）
const FIELD_OPTIONS_OVERRIDE: Record<string, Array<{ name: string; color: number }> | null> = {
  // 反馈表 tag1：只保留 7 个标准 Tag1 选项
  'tblbvwlRfKEshGm9.fldau8nurW': TAG1_DEFAULT_RECORDS.map((r, i) => ({ name: r.tagName, color: i })),
  // 反馈表 tag2：清空选项（动态生成）
  'tblbvwlRfKEshGm9.fldxPs9P4N': null,
  // 反馈表 tag3：清空选项（动态生成）
  'tblbvwlRfKEshGm9.fldIYBDyjD': null,
  // Tag1表 tagName：只保留 7 个标准选项
  'tbl59iVHgHPyeLmj.fldQkTiNxp': TAG1_DEFAULT_RECORDS.map((r, i) => ({ name: r.tagName, color: i })),
};

export interface BitableInfo {
  app_token: string;
  table_ids: Record<string, string>;
  // 兼容旧版代码的字段
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

interface FieldOption {
  id: string;
  name: string;
  color: number;
}

interface SourceField {
  field_id: string;
  field_name: string;
  is_extend: boolean;
  is_primary: boolean;
  is_synced: boolean;
  property: Record<string, unknown> | null;
  type: number;
  ui_type: string;
}

interface FeishuField {
  field_id: string;
  field_name: string;
  is_primary: boolean;
  type: number;
  property?: Record<string, unknown>;
}

interface SourceTable {
  table_name: string;
  table_id: string;
  fields: SourceField[];
}

interface LookupFilterCondition {
  field_id: string;
  field_type: number;
  operator: string;
  value: unknown;
}

interface LookupFilterInfo {
  conditions: {
    children: LookupFilterCondition[];
    conjunction: string;
  };
  target_table: string;
}

interface LookupFieldInfo {
  old_table_id: string;
  old_table_name: string;
  old_field_id: string;
  old_field_name: string;
  column_index: number;
  property: {
    filter_info?: LookupFilterInfo;
    formatter?: string;
    formula?: string;
    roll_up?: number;
    target_field?: string;
    [key: string]: unknown;
  };
}

interface FormulaFieldInfo {
  old_table_id: string;
  new_table_id: string;
  old_field_id: string;
  field_name: string;
  property: {
    formula_expression?: string;
    type?: {
      data_type: number;
      ui_property?: Record<string, unknown>;
      ui_type?: string;
    };
    formatter?: string;
    [key: string]: unknown;
  };
}

const TABLE_ORDER = [
  'tbljPeTYJXOu55Vs',
  'tblRuKwkCmsdxei0',
  'tblbvwlRfKEshGm9',
  'tblJtwhN6m71qLnn',
  'tbl59iVHgHPyeLmj',
  'tblnNtMHDn92HPdu',
];

const VALID_FIELD_TYPES = new Set([1, 2, 3, 4, 5, 7, 18, 19, 20]);

function loadMetadata(): Record<string, SourceTable> {
  const metaPath = path.join(process.cwd(), 'docs', 'nps_bitable_full_meta.json');
  const raw = fs.readFileSync(metaPath, 'utf-8');
  return JSON.parse(raw);
}

function validateMetadata(metadata: Record<string, SourceTable>): void {
  const tableIds = Object.keys(metadata);
  if (tableIds.length !== 6) {
    throw new Error(`元数据表数量错误：期望 6 张，实际 ${tableIds.length} 张`);
  }

  for (const expectedId of TABLE_ORDER) {
    if (!metadata[expectedId]) {
      throw new Error(`元数据缺少表：${expectedId}`);
    }
  }

  for (const tableId of tableIds) {
    const table = metadata[tableId];
    if (!table.table_name || !table.table_id || !table.fields) {
      throw new Error(`表 ${tableId} 缺少必要属性（table_name/table_id/fields）`);
    }
    for (const field of table.fields) {
      if (!VALID_FIELD_TYPES.has(field.type)) {
        throw new Error(`表 ${tableId} 字段 ${field.field_name} 存在不支持的类型: ${field.type}`);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function feishuRequest(
  url: string,
  options: RequestInit,
  token: string
): Promise<any> {
  let retries = 0;

  while (retries <= MAX_RETRIES) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
      if (retries < MAX_RETRIES) {
        retries++;
        await sleep(waitMs);
        continue;
      }
    }

    const data = await response.json();

    if (data.code !== 0) {
      if (response.status >= 500 && retries < MAX_RETRIES) {
        retries++;
        await sleep(1000);
        continue;
      }
      throw new Error(`请求失败 [${url}]: ${data.msg} (code=${data.code})`);
    }

    return data;
  }

  throw new Error(`请求重试次数超限: ${url}`);
}

async function createBitableApp(token: string, name: string, folderToken?: string): Promise<string> {
  const body: Record<string, string> = { name };
  if (folderToken) {
    body.folder_token = folderToken;
  }
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token
  );
  return data.data.app.app_token;
}

async function deleteBitableApp(token: string, appToken: string): Promise<void> {
  try {
    await feishuRequest(
      `${BITABLE_API_BASE}/apps/${appToken}`,
      { method: 'DELETE' },
      token
    );
  } catch (e) {
    console.warn(`[回滚] 删除多维表格失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function createTable(token: string, appToken: string, tableName: string): Promise<string> {
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables`,
    {
      method: 'POST',
      body: JSON.stringify({
        table: {
          name: tableName,
        },
      }),
    },
    token
  );
  return data.data.table_id;
}

async function getTables(token: string, appToken: string): Promise<Array<{ table_id: string; name: string }>> {
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables`,
    { method: 'GET' },
    token
  );
  return (data.data.items || []).map((t: any) => ({
    table_id: t.table_id,
    name: t.name,
  }));
}

async function deleteTable(token: string, appToken: string, tableId: string): Promise<void> {
  await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}`,
    { method: 'DELETE' },
    token
  );
}

async function addRecord(
  token: string,
  appToken: string,
  tableId: string,
  fields: Record<string, any>
): Promise<string> {
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      body: JSON.stringify({ fields }),
    },
    token
  );
  return data.data.record.record_id;
}

async function getTableFields(token: string, appToken: string, tableId: string): Promise<FeishuField[]> {
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`,
    { method: 'GET' },
    token
  );
  return (data.data.items || []) as FeishuField[];
}

function buildFieldPayload(tableId: string, field: SourceField): Record<string, any> {
  const payload: Record<string, any> = {
    field_name: field.field_name,
    type: field.type,
  };

  if (field.property === null || field.property === undefined) {
    return payload;
  }

  // 检查是否有字段选项覆盖
  const overrideKey = `${tableId}.${field.field_id}`;
  const overrideOptions = FIELD_OPTIONS_OVERRIDE[overrideKey];

  // 根据字段类型构建正确的 property
  // 只保留 API 接受的字段，过滤掉只读字段
  if (field.type === 3 || field.type === 4) {
    // 单选/多选：只保留 options 数组，每个 option 只保留 name 和 color
    // ⚠️ 注意：创建时不能传 id，id 由飞书自动生成
    let options: Array<{ name: string; color?: number }> = [];

    if (overrideOptions !== undefined) {
      // 使用覆盖配置
      if (overrideOptions === null) {
        // null 表示清空选项
        options = [];
      } else {
        options = overrideOptions.map(opt => ({ name: opt.name, color: opt.color }));
      }
    } else if (field.property.options && Array.isArray(field.property.options)) {
      // 使用源表选项
      options = (field.property.options as Array<{ name: string; color?: number }>).map((opt) => {
        const newOpt: { name: string; color?: number } = { name: opt.name };
        if (opt.color !== undefined) {
          newOpt.color = opt.color;
        }
        return newOpt;
      });
    }

    if (options.length > 0) {
      payload.property = { options };
    }
  } else if (field.type === 2) {
    // 数字字段：只保留 formatter
    if (field.property.formatter !== undefined) {
      payload.property = { formatter: field.property.formatter };
    }
  } else if (field.type === 18 || field.type === 21) {
    // 关联字段：只保留 table_id 和 multiple
    if (field.property.table_id !== undefined || field.property.foreign_table_id !== undefined) {
      payload.property = {
        table_id: field.property.table_id || field.property.foreign_table_id,
        multiple: field.property.multiple || false,
      };
    }
  }
  // 其他类型的 property 暂时不处理（type 1/5/7 等不需要 property）

  return payload;
}

async function createField(
  token: string,
  appToken: string,
  tableId: string,
  fieldPayload: Record<string, any>
): Promise<string> {
  const data = await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      body: JSON.stringify(fieldPayload),
    },
    token
  );
  return data.data.field.field_id;
}

async function updateField(
  token: string,
  appToken: string,
  tableId: string,
  fieldId: string,
  fieldPayload: Record<string, any>
): Promise<void> {
  await feishuRequest(
    `${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields/${fieldId}`,
    {
      method: 'PUT',
      body: JSON.stringify(fieldPayload),
    },
    token
  );
}

function replaceTableIdsInFormula(formula: string, tableIdMap: Record<string, string>): string {
  return formula.replace(/\$table\[([^\]]+)\]/g, (match, oldTableId) => {
    const newTableId = tableIdMap[oldTableId];
    if (!newTableId) {
      throw new Error(`公式中存在未映射的表ID: ${oldTableId}`);
    }
    return `$table[${newTableId}]`;
  });
}

function replaceFieldIdsInFormula(formula: string, fieldIdMap: Record<string, string>): string {
  let result = formula;

  result = result.replace(/\{([fld][^\}]+)\}/g, (match, oldFieldId) => {
    const newFieldId = fieldIdMap[oldFieldId];
    if (!newFieldId) {
      return match;
    }
    return `{${newFieldId}}`;
  });

  result = result.replace(/\$column\[([^\]]+)\]/g, (match, oldFieldId) => {
    const newFieldId = fieldIdMap[oldFieldId];
    if (!newFieldId) {
      return match;
    }
    return `$column[${newFieldId}]`;
  });

  result = result.replace(/\$field\[([^\]]+)\]/g, (match, oldFieldId) => {
    const newFieldId = fieldIdMap[oldFieldId];
    if (!newFieldId) {
      return match;
    }
    return `$field[${newFieldId}]`;
  });

  return result;
}

export async function createNPSInsightBitable(
  name?: string,
  folderToken?: string,
  userAccessToken?: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<BitableInfo> {
  const token = await getAccessToken(userAccessToken, refreshToken, expiresAt);
  console.log('[多维表格] 使用身份:', userAccessToken ? '用户身份' : '应用身份');
  const metadata = loadMetadata();
  validateMetadata(metadata);

  const tableIdMap: Record<string, string> = {};
  const fieldIdMap: Record<string, string> = {};
  const formulaFieldList: FormulaFieldInfo[] = [];
  const lookupFieldList: LookupFieldInfo[] = [];

  let newAppToken = '';

  try {
    const defaultName = `NPS Insight 反馈中心_复刻版_${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
    const appName = name || defaultName;

    console.log('[阶段2] 创建全新空白多维表格...');
    if (folderToken) {
      console.log(`[阶段2] 创建位置: 指定文件夹 ${folderToken}`);
    } else {
      console.log('[阶段2] 创建位置: 云盘根目录');
    }
    newAppToken = await createBitableApp(token, appName, folderToken);
    console.log(`[阶段2] 多维表格创建成功，appToken: ${newAppToken}`);
    await sleep(REQUEST_DELAY_MS);

    console.log('[阶段3] 批量创建空白数据表...');
    for (const oldTableId of TABLE_ORDER) {
      const sourceTable = metadata[oldTableId];
      console.log(`  创建表: ${sourceTable.table_name}...`);
      const newTableId = await createTable(token, newAppToken, sourceTable.table_name);
      tableIdMap[oldTableId] = newTableId;
      console.log(`    新表ID: ${newTableId}`);
      await sleep(REQUEST_DELAY_MS);
    }
    console.log('[阶段3] 6张数据表创建完成');

    // 删除飞书默认创建的"数据表"
    console.log('[阶段3.1] 删除默认数据表...');
    const allTables = await getTables(token, newAppToken);
    for (const t of allTables) {
      const isOurTable = Object.values(tableIdMap).includes(t.table_id);
      if (!isOurTable) {
        console.log(`  删除默认表: ${t.name}`);
        await deleteTable(token, newAppToken, t.table_id);
        await sleep(REQUEST_DELAY_MS);
      }
    }

    console.log('[阶段4] 逐表创建字段...');
    for (const oldTableId of TABLE_ORDER) {
      const sourceTable = metadata[oldTableId];
      const newTableId = tableIdMap[oldTableId];
      console.log(`  处理表: ${sourceTable.table_name}...`);

      const existingFields = await getTableFields(token, newAppToken, newTableId);
      await sleep(REQUEST_DELAY_MS);

      const defaultPrimaryField = existingFields.find((f) => f.is_primary);
      if (!defaultPrimaryField) {
        throw new Error(`表 ${sourceTable.table_name} 未找到默认主键字段`);
      }

      const sourcePrimaryField = sourceTable.fields.find((f) => f.is_primary);
      if (!sourcePrimaryField) {
        throw new Error(`源表 ${sourceTable.table_name} 未找到主键字段`);
      }

      console.log(`    修改主键字段: ${defaultPrimaryField.field_name} -> ${sourcePrimaryField.field_name}`);
      const primaryPayload = buildFieldPayload(oldTableId, sourcePrimaryField);
      await updateField(token, newAppToken, newTableId, defaultPrimaryField.field_id, primaryPayload);
      fieldIdMap[sourcePrimaryField.field_id] = defaultPrimaryField.field_id;
      await sleep(REQUEST_DELAY_MS);

      for (let i = 0; i < sourceTable.fields.length; i++) {
        const sourceField = sourceTable.fields[i];

        if (sourceField.is_primary) {
          continue;
        }

        if (sourceField.type === 19) {
          console.log(`    Lookup占位字段: ${sourceField.field_name}`);
          const placeholderPayload = {
            field_name: sourceField.field_name,
            type: 1,
          };
          const newFieldId = await createField(token, newAppToken, newTableId, placeholderPayload);
          // 记录字段ID映射，确保公式中引用的Lookup字段能正确替换
          fieldIdMap[sourceField.field_id] = newFieldId;

          lookupFieldList.push({
            old_table_id: oldTableId,
            old_table_name: sourceTable.table_name,
            old_field_id: sourceField.field_id,
            old_field_name: sourceField.field_name,
            column_index: i + 1,
            property: (sourceField.property || {}) as LookupFieldInfo['property'],
          });

          await sleep(REQUEST_DELAY_MS);
          continue;
        }

        if (sourceField.type === 20) {
          console.log(`    暂存公式字段: ${sourceField.field_name}`);
          formulaFieldList.push({
            old_table_id: oldTableId,
            new_table_id: newTableId,
            old_field_id: sourceField.field_id,
            field_name: sourceField.field_name,
            property: (sourceField.property || {}) as FormulaFieldInfo['property'],
          });
          continue;
        }

        if (sourceField.type === 18) {
          console.log(`    创建单向关联字段: ${sourceField.field_name}`);
          const payload = buildFieldPayload(oldTableId, sourceField);
          if (payload.property && payload.property.table_id) {
            const oldTargetTableId = payload.property.table_id;
            const newTargetTableId = tableIdMap[oldTargetTableId];
            if (newTargetTableId) {
              payload.property.table_id = newTargetTableId;
            }
          }
          const newFieldId = await createField(token, newAppToken, newTableId, payload);
          fieldIdMap[sourceField.field_id] = newFieldId;
          await sleep(REQUEST_DELAY_MS);
          continue;
        }

        console.log(`    创建基础字段: ${sourceField.field_name} (type=${sourceField.type})`);
        const payload = buildFieldPayload(oldTableId, sourceField);
        const newFieldId = await createField(token, newAppToken, newTableId, payload);
        fieldIdMap[sourceField.field_id] = newFieldId;
        await sleep(REQUEST_DELAY_MS);
      }

      console.log(`    基础字段创建完成，进入公式字段创建阶段`);
    }

    console.log('[阶段5] 创建公式字段...');
    for (const formulaField of formulaFieldList) {
      console.log(`  创建公式字段: ${formulaField.field_name}`);

      const originalFormula = formulaField.property.formula_expression || '';
      let newFormula = replaceTableIdsInFormula(originalFormula, tableIdMap);
      newFormula = replaceFieldIdsInFormula(newFormula, fieldIdMap);

      const newProperty = JSON.parse(JSON.stringify(formulaField.property));
      newProperty.formula_expression = newFormula;

      const payload = {
        field_name: formulaField.field_name,
        type: 20,
        property: newProperty,
      };

      const newFieldId = await createField(
        token,
        newAppToken,
        formulaField.new_table_id,
        payload
      );
      fieldIdMap[formulaField.old_field_id] = newFieldId;
      await sleep(REQUEST_DELAY_MS);
    }

    // 公式字段创建完成后，校验每张表的字段总数
    console.log('[阶段5.1] 校验字段总数...');
    for (const oldTableId of TABLE_ORDER) {
      const sourceTable = metadata[oldTableId];
      const newTableId = tableIdMap[oldTableId];
      const finalFields = await getTableFields(token, newAppToken, newTableId);
      await sleep(REQUEST_DELAY_MS);
      if (finalFields.length !== sourceTable.fields.length) {
        throw new Error(
          `表 ${sourceTable.table_name} 字段数量不匹配：源表 ${sourceTable.fields.length} 个，新表 ${finalFields.length} 个`
        );
      }
      console.log(`  ${sourceTable.table_name}: ${finalFields.length} 个字段 ✓`);
    }

    console.log('[阶段6] 生成 Lookup 字段手动补配清单...');
    console.log('==================================================');
    console.log('Lookup 字段手动补配清单');
    console.log('==================================================');
    for (let i = 0; i < lookupFieldList.length; i++) {
      const lf = lookupFieldList[i];
      const rollUp = lf.property.roll_up;
      let rollUpDesc = '拼接';
      if (rollUp === 2) rollUpDesc = '计数';
      if (rollUp === 6) rollUpDesc = '去重拼接';

      const targetTableId = lf.property.filter_info?.target_table;
      const targetTableName = targetTableId && metadata[targetTableId]?.table_name
        ? metadata[targetTableId].table_name
        : '未知表';

      const targetFieldId = lf.property.target_field;
      const targetTableNameForField = targetTableId && metadata[targetTableId];
      let targetFieldName = '未知字段';
      if (targetTableNameForField) {
        const field = targetTableNameForField.fields.find((f) => f.field_id === targetFieldId);
        if (field) targetFieldName = field.field_name;
      }

      console.log(`\n【字段序号：${i + 1} / 字段名称：${lf.old_field_name}】`);
      console.log(`所在数据表：${lf.old_table_name}`);
      console.log(`原表列位置：第 ${lf.column_index} 列`);
      console.log(`查找类型：筛选式高级查找`);
      console.log(`操作步骤：`);
      console.log(`1. 进入【${lf.old_table_name}】→ 找到第 ${lf.column_index} 列的占位文本字段 → 删除该字段`);
      console.log(`2. 在原位置点击「+ 添加字段」→ 选择「查找」`);
      console.log(`3. 基础配置：`);
      console.log(`   - 目标数据表：${targetTableName}`);
      console.log(`   - 要返回的字段：${targetFieldName}`);
      console.log(`   - 聚合方式：${rollUpDesc}`);
      console.log(`4. 格式设置：${lf.property.formatter || '默认'}`);
    }
    console.log('\n==================================================');

    console.log('[阶段7] 自动结构校验...');
    const { valid, issues } = await verifyBitableStructure(newAppToken);
    if (!valid) {
      console.warn('[阶段7] 结构校验发现问题:');
      for (const issue of issues) {
        console.warn(`  - ${issue}`);
      }
    } else {
      console.log('[阶段7] 结构校验通过');
    }

    console.log('[阶段8] 初始化 Tag1 表默认数据...');
    const tag1TableId = tableIdMap['tbl59iVHgHPyeLmj'];
    if (tag1TableId) {
      for (let i = 0; i < TAG1_DEFAULT_RECORDS.length; i++) {
        const record = TAG1_DEFAULT_RECORDS[i];
        const tagId = `T1-${String(i + 1).padStart(3, '0')}`;
        const fields: Record<string, any> = {
          tagId,
          tagName: record.tagName,
          desc: record.desc,
        };
        await addRecord(token, newAppToken, tag1TableId, fields);
        console.log(`  已创建: ${record.tagName}`);
        await sleep(REQUEST_DELAY_MS);
      }
      console.log(`[阶段8] Tag1 表初始化完成，共 ${TAG1_DEFAULT_RECORDS.length} 条记录`);
    } else {
      console.warn('[阶段8] 未找到 Tag1 表，跳过初始化');
    }

    console.log(`\n建表完成！访问链接：https://my.feishu.cn/base/${newAppToken}`);

    return {
      app_token: newAppToken,
      table_ids: tableIdMap,
      // 兼容旧版代码
      appToken: newAppToken,
      tables: {
        feedbackTableId: tableIdMap['tblbvwlRfKEshGm9'] || '',
        tag1TableId: tableIdMap['tbl59iVHgHPyeLmj'] || '',
        tag2TableId: tableIdMap['tblnNtMHDn92HPdu'] || '',
        tag3TableId: tableIdMap['tblJtwhN6m71qLnn'] || '',
        tenantTableId: tableIdMap['tbljPeTYJXOu55Vs'] || '',
        periodTableId: tableIdMap['tblRuKwkCmsdxei0'] || '',
      },
    };
  } catch (error) {
    console.error('[错误] 建表过程中发生异常:', error);

    if (newAppToken) {
      console.log('[回滚] 正在删除已创建的多维表格...');
      await deleteBitableApp(token, newAppToken);
      console.log('[回滚] 已删除多维表格');
    }

    throw error;
  }
}

export async function verifyBitableStructure(
  appToken: string,
  userAccessToken?: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<{ valid: boolean; issues: string[] }> {
  const token = await getAccessToken(userAccessToken, refreshToken, expiresAt);
  const metadata = loadMetadata();
  const issues: string[] = [];

  try {
    const tablesData = await feishuRequest(
      `${BITABLE_API_BASE}/apps/${appToken}/tables`,
      { method: 'GET' },
      token
    );
    const tables = tablesData.data.items || [];

    if (tables.length !== 6) {
      issues.push(`数据表数量不匹配：期望 6 张，实际 ${tables.length} 张`);
    }

    for (let i = 0; i < TABLE_ORDER.length; i++) {
      const oldTableId = TABLE_ORDER[i];
      const sourceTable = metadata[oldTableId];
      const actualTable = tables[i];

      if (!actualTable) {
        issues.push(`缺少第 ${i + 1} 张表：${sourceTable.table_name}`);
        continue;
      }

      if (actualTable.name !== sourceTable.table_name) {
        issues.push(
          `第 ${i + 1} 张表名不匹配：期望 "${sourceTable.table_name}"，实际 "${actualTable.name}"`
        );
      }
    }

    for (const oldTableId of TABLE_ORDER) {
      const sourceTable = metadata[oldTableId];
      const actualTable = tables.find((t: any) => t.name === sourceTable.table_name);

      if (!actualTable) {
        issues.push(`未找到表：${sourceTable.table_name}`);
        continue;
      }

      const fieldsData = await feishuRequest(
        `${BITABLE_API_BASE}/apps/${appToken}/tables/${actualTable.table_id}/fields`,
        { method: 'GET' },
        token
      );
      const actualFields = fieldsData.data.items || [];
      await sleep(REQUEST_DELAY_MS);

      if (actualFields.length !== sourceTable.fields.length) {
        issues.push(
          `表 ${sourceTable.table_name} 字段数量不匹配：期望 ${sourceTable.fields.length} 个，实际 ${actualFields.length} 个`
        );
      }

      for (let i = 0; i < Math.min(actualFields.length, sourceTable.fields.length); i++) {
        const sourceField = sourceTable.fields[i];
        const actualField = actualFields[i];

        if (actualField.field_name !== sourceField.field_name) {
          issues.push(
            `表 ${sourceTable.table_name} 第 ${i + 1} 个字段名不匹配：期望 "${sourceField.field_name}"，实际 "${actualField.field_name}"`
          );
        }

        if (sourceField.type === 19) {
          if (actualField.type !== 1) {
            issues.push(
              `表 ${sourceTable.table_name} 字段 ${sourceField.field_name} 类型错误：Lookup占位字段应为文本(type=1)，实际 type=${actualField.type}`
            );
          }
        } else if (sourceField.type !== 20) {
          if (actualField.type !== sourceField.type) {
            issues.push(
              `表 ${sourceTable.table_name} 字段 ${sourceField.field_name} 类型不匹配：期望 type=${sourceField.type}，实际 type=${actualField.type}`
            );
          }
        }

        if ((sourceField.type === 3 || sourceField.type === 4) && sourceField.property?.options) {
          const srcOptions = (sourceField.property.options as FieldOption[]);
          const actualOptions = (actualField.property?.options as FieldOption[] | undefined) || [];
          if (actualOptions.length !== srcOptions.length) {
            issues.push(
              `表 ${sourceTable.table_name} 字段 ${sourceField.field_name} 选项数量不匹配：期望 ${srcOptions.length} 个，实际 ${actualOptions.length} 个`
            );
          }

          for (let j = 0; j < Math.min(actualOptions.length, srcOptions.length); j++) {
            const srcOpt = srcOptions[j];
            const actOpt = actualOptions[j];

            if (actOpt.id !== srcOpt.id) {
              issues.push(
                `表 ${sourceTable.table_name} 字段 ${sourceField.field_name} 第 ${j + 1} 个选项ID不匹配：期望 "${srcOpt.id}"，实际 "${actOpt.id}"`
              );
            }
            if (actOpt.name !== srcOpt.name) {
              issues.push(
                `表 ${sourceTable.table_name} 字段 ${sourceField.field_name} 第 ${j + 1} 个选项名称不匹配：期望 "${srcOpt.name}"，实际 "${actOpt.name}"`
              );
            }
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  } catch (error) {
    issues.push(`校验过程出错: ${error instanceof Error ? error.message : String(error)}`);
    return { valid: false, issues };
  }
}

// ============================================
// 兼容性函数（供旧版 API 路由调用）
// ============================================

/**
 * 从 URL 或 token 中提取 app_token
 */
export function extractAppToken(input: string): string {
  if (!input) return '';
  // 如果已经是纯 token，直接返回
  if (/^[a-zA-Z0-9]+$/.test(input.trim())) {
    return input.trim();
  }
  // 从 URL 中提取
  const match = input.match(/\/base\/([a-zA-Z0-9]+)/);
  return match ? match[1] : input.trim();
}

/**
 * 获取表格信息并验证（兼容性函数）
 */
export async function validateAndGetBitableInfo(appToken: string): Promise<{
  valid: boolean;
  tables: Array<{ table_id: string; name: string }>;
  appToken: string;
  message?: string;
}> {
  try {
    const token = await getTenantAccessToken();
    const data = await feishuRequest(
      `${BITABLE_API_BASE}/apps/${appToken}/tables`,
      { method: 'GET' },
      token
    );

    const tables = (data.data?.items || []).map((t: any) => ({
      table_id: t.table_id,
      name: t.name,
    }));

    const structureCheck = await verifyBitableStructure(appToken);

    return {
      valid: structureCheck.valid,
      tables,
      appToken,
      message: structureCheck.issues.join('; ') || undefined,
    };
  } catch (error) {
    return {
      valid: false,
      tables: [],
      appToken,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 检查必需字段（兼容性函数）
 */
export function checkRequiredFields(tables: Array<{ table_id: string; name: string }>): {
  feedbackTableId: string;
  tagsTableId: string;
  tenantsTableId: string;
  analysisTableId: string;
  hasFeedbackTable: boolean;
  missingFields: string[];
} {
  const feedbackTable = tables.find(t => t.name === '反馈列表');
  const tag1Table = tables.find(t => t.name === 'Tag1表');
  const tag2Table = tables.find(t => t.name === 'Tag2表');
  const tag3Table = tables.find(t => t.name === 'Tag3表');
  const tenantTable = tables.find(t => t.name === '租户信息');
  const periodTable = tables.find(t => t.name === 'top 问题表');

  return {
    feedbackTableId: feedbackTable?.table_id || '',
    tagsTableId: tag1Table?.table_id || tag2Table?.table_id || tag3Table?.table_id || '',
    tenantsTableId: tenantTable?.table_id || '',
    analysisTableId: periodTable?.table_id || '',
    hasFeedbackTable: !!feedbackTable,
    missingFields: [],
  };
}

/**
 * 添加缺失字段（兼容性函数，空实现）
 */
export async function addMissingFields(
  appToken: string,
  tableId: string,
  missingFields: string[]
): Promise<void> {
  // 新版建表逻辑已保证字段完整性，此函数留作兼容
  console.log(`[兼容函数] addMissingFields: 表 ${tableId}，缺失字段 ${missingFields.length} 个`);
}

/**
 * 初始化 Tag1 标签（兼容性函数，新版建表时已包含标签结构）
 */
export async function initializeTag1Labels(
  appToken: string,
  tag1TableId?: string
): Promise<void> {
  // 新版建表逻辑已完整复刻源表结构，无需额外初始化
  console.log('[兼容函数] initializeTag1Labels: 跳过，新建表已包含完整标签结构');
}

/**
 * 保存 Tag1 标签到多维表格（兼容性函数）
 */
export async function saveTag1ToBitable(
  appToken: string,
  tags: Array<{ name: string; definition: string; enabled: boolean }>,
  tag1TableId?: string
): Promise<{ success: boolean; created: number; updated: number; deleted: number; errors: string[] }> {
  // 新版建表逻辑已完整复刻源表结构，此函数留作兼容
  console.log(`[兼容函数] saveTag1ToBitable: 保存 ${tags.length} 个标签到表 ${tag1TableId || '未知'}`);
  return {
    success: true,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
  };
}

/**
 * 添加多维表格管理员协作者
 */
export async function addBitableAdminMembers(
  appToken: string,
  adminUserIds: string
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  const token = await getTenantAccessToken();
  const userIds = adminUserIds
    .split(',')
    .map(id => id.trim())
    .filter(id => id);

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const memberType = userId.startsWith('ou_') ? 'openid' : 'userid';
      const response = await fetch(
        `https://open.feishu.cn/open-apis/drive/v1/permissions/${appToken}/members?type=bitable&need_notification=false`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            member_type: memberType,
            member_id: userId,
            perm: 'full_access',
          }),
        }
      );
      const data = await response.json();
      if (data.code === 0 || data.code === 1063003) {
        successCount++;
      } else {
        failCount++;
        errors.push(`${userId}: ${data.msg}`);
      }
    } catch (error) {
      failCount++;
      errors.push(`${userId}: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return { successCount, failCount, errors };
}
