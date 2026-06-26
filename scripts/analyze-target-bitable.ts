/**
 * 分析目标多维表格的完整结构
 * 输出所有表、字段、字段类型、配置引用关系
 */

require('dotenv').config();

const TARGET_APP_TOKEN = 'MIPVbgPfUaq2rwsPX2icCoXwnag';

interface BitableField {
  field_id: string;
  field_name: string;
  type: number;
  type_name: string;
  property?: Record<string, unknown>;
  description?: string;
}

interface BitableTable {
  table_id: string;
  name: string;
  fields: BitableField[];
}

const TYPE_MAP: Record<number, string> = {
  1: 'Text',
  2: 'Number',
  3: 'SingleSelect',
  4: 'MultiSelect',
  5: 'DateTime',
  6: 'Checkbox',
  7: 'Textarea',
  8: 'User',
  9: 'Phone',
  10: 'Email',
  11: 'URL',
  12: 'Attachment',
  13: 'SingleLink',
  14: 'Lookup',
  15: 'Formula',
  16: 'DuplexLink',
  17: 'Location',
  18: 'GroupChat',
  19: 'AutoNumber',
  20: 'CreatedTime',
  21: 'LastModifiedTime',
  22: 'CreatedUser',
  23: 'LastModifiedUser',
  1001: 'Progress',
  1002: 'Rating',
};

async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('飞书应用配置缺失，请检查 .env 文件');
  }

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取租户Token失败: ${data.msg}`);
  }

  return data.tenant_access_token;
}

async function listTables(token: string): Promise<Array<{ table_id: string; name: string }>> {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${TARGET_APP_TOKEN}/tables`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取表列表失败: ${data.msg}`);
  }

  return data.data?.items || [];
}

async function listFields(token: string, tableId: string): Promise<BitableField[]> {
  const allFields: BitableField[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${TARGET_APP_TOKEN}/tables/${tableId}/fields`
    );
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取字段列表失败 [表: ${tableId}]: ${data.msg}`);
    }

    const fields = (data.data?.items || []).map((f: any) => ({
      field_id: f.field_id,
      field_name: f.field_name,
      type: f.type,
      type_name: TYPE_MAP[f.type] || `Unknown(${f.type})`,
      property: f.property,
      description: f.description,
    }));

    allFields.push(...fields);
    pageToken = data.data?.page_token;

    if (!data.data?.has_more) break;
  } while (pageToken);

  return allFields;
}

function formatProperty(property: Record<string, unknown> | undefined, indent: string = '  '): string {
  if (!property) return '无';

  const lines: string[] = [];

  for (const [key, value] of Object.entries(property)) {
    if (key === 'options' && Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      for (const opt of value) {
        if (typeof opt === 'object' && opt !== null) {
          const optObj = opt as Record<string, unknown>;
          lines.push(`${indent}  - ${optObj.name || '未命名'} (color: ${optObj.color ?? 'N/A'})`);
          if (optObj.id) lines.push(`${indent}    id: ${optObj.id}`);
        }
      }
    } else if (key === 'foreign_table_id' || key === 'table_id') {
      lines.push(`${indent}${key}: ${value}`);
    } else if (key === 'date_formatter') {
      lines.push(`${indent}${key}: ${value}`);
    } else if (key === 'formula_expr') {
      lines.push(`${indent}${key}: ${value}`);
    } else if (key === 'auto_serial') {
      lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${indent}${key}: ${value}`);
    }
  }

  return lines.length > 0 ? '\n' + lines.join('\n') : '无';
}

function analyzeLinkRelations(tables: BitableTable[]): string[] {
  const relations: string[] = [];
  const tableIdToName = new Map<string, string>();

  for (const table of tables) {
    tableIdToName.set(table.table_id, table.name);
  }

  for (const table of tables) {
    for (const field of table.fields) {
      if (field.type === 13 || field.type === 16) {
        const linkType = field.type === 13 ? '单向关联' : '双向关联';
        const foreignTableId = (field.property as any)?.table_id || (field.property as any)?.foreign_table_id;
        const foreignTableName = tableIdToName.get(foreignTableId) || '未知表';
        relations.push(
          `[${table.name}] 的字段 [${field.field_name}] (${linkType}) -> [${foreignTableName}] (${foreignTableId})`
        );
      }
      if (field.type === 14) {
        const lookupProp = field.property as any;
        const relatedField = lookupProp?.related_local_field_id || '未知字段';
        relations.push(
          `[${table.name}] 的字段 [${field.field_name}] (查找引用) 依赖字段ID: ${relatedField}`
        );
      }
      if (field.type === 15) {
        const formula = (field.property as any)?.formula_expr || '未知公式';
        relations.push(
          `[${table.name}] 的字段 [${field.field_name}] (公式): ${formula}`
        );
      }
    }
  }

  return relations;
}

async function main() {
  console.log('='.repeat(80));
  console.log('目标多维表格结构分析');
  console.log(`App Token: ${TARGET_APP_TOKEN}`);
  console.log('='.repeat(80));

  const token = await getTenantAccessToken();
  console.log('\n✓ 成功获取 Tenant Access Token');

  const tableList = await listTables(token);
  console.log(`✓ 找到 ${tableList.length} 张表:`);
  tableList.forEach((t, i) => console.log(`  ${i + 1}. ${t.name} (${t.table_id})`));

  const tables: BitableTable[] = [];

  for (const tableInfo of tableList) {
    console.log('\n' + '-'.repeat(80));
    console.log(`📋 表: ${tableInfo.name} (${tableInfo.table_id})`);
    console.log('-'.repeat(80));

    const fields = await listFields(token, tableInfo.table_id);
    tables.push({
      table_id: tableInfo.table_id,
      name: tableInfo.name,
      fields,
    });

    console.log(`字段数量: ${fields.length}`);
    console.log('');

    fields.forEach((field, idx) => {
      console.log(`${idx + 1}. ${field.field_name}`);
      console.log(`   字段ID: ${field.field_id}`);
      console.log(`   类型: ${field.type_name} (type=${field.type})`);
      if (field.property && Object.keys(field.property).length > 0) {
        console.log(`   配置: ${formatProperty(field.property, '     ')}`);
      }
      if (field.description) {
        console.log(`   描述: ${field.description}`);
      }
      console.log('');
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('🔗 表间引用关系分析');
  console.log('='.repeat(80));

  const relations = analyzeLinkRelations(tables);
  if (relations.length === 0) {
    console.log('未找到表间引用关系');
  } else {
    relations.forEach((r, i) => console.log(`${i + 1}. ${r}`));
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 汇总统计');
  console.log('='.repeat(80));
  console.log(`总表数: ${tables.length}`);
  let totalFields = 0;
  for (const t of tables) {
    console.log(`  ${t.name}: ${t.fields.length} 个字段`);
    totalFields += t.fields.length;
  }
  console.log(`总字段数: ${totalFields}`);
  console.log(`引用关系数: ${relations.length}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ 分析完成');
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('❌ 分析失败:', error.message);
  process.exit(1);
});
