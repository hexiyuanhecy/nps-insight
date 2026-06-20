// 测试飞书多维表格不同 filter 操作符
require('dotenv').config();
const API_BASE = 'https://open.feishu.cn/open-apis';
const APP_TOKEN = process.env.BITABLE_TOKEN;

async function getToken() {
  const r = await fetch(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }),
  });
  const d = await r.json();
  return d.tenant_access_token;
}

async function testFilter(token, tableId, label, filter) {
  const r = await fetch(
    `${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records?filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d = await r.json();
  console.log(`  ${label}: code=${d.code} msg=${d.msg} items=${d.data?.items?.length || 0}`);
}

async function main() {
  const token = await getToken();
  const tagsTable = process.env.BITABLE_TABLE_ID_TAGS;
  console.log('测试标签表:', tagsTable);

  // 测试不同操作符
  testFilter(token, tagsTable, 'operator=is', JSON.stringify({
    conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'is', value: '产品功能' }]
  }));

  testFilter(token, tagsTable, 'operator=contains', JSON.stringify({
    conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'contains', value: ['产品功能'] }]
  }));

  testFilter(token, tagsTable, 'operator=is with string value', JSON.stringify({
    conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'is', value: '产品功能' }]
  }));

  testFilter(token, tagsTable, 'operator=contains with string', JSON.stringify({
    conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'contains', value: '产品功能' }]
  }));
}
main().catch(console.error);
