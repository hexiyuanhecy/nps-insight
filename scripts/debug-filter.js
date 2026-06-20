// 调试 searchRecords filter
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

async function main() {
  const token = await getToken();
  const tableId = process.env.BITABLE_TABLE_ID_TAGS;
  console.log('测试标签表:', tableId);

  // 测试 1: 用字段名 Tag1名称 is '产品功能' 过滤
  const f1 = JSON.stringify({
    conjunction: 'and',
    conditions: [{ field_name: 'Tag1名称', operator: 'is', value: ['产品功能'] }],
  });
  const r1 = await fetch(`${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records?filter=${encodeURIComponent(f1)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d1 = await r1.json();
  console.log('测试1 (Tag1名称=产品功能): code=', d1.code, 'msg=', d1.msg, 'items=', d1.data?.items?.length || 0);

  // 测试 2: 不加 filter 列出所有记录
  const r2 = await fetch(`${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d2 = await r2.json();
  console.log('测试2 (无filter) 总记录数:', d2.data?.items?.length || 0);
  if (d2.data?.items?.length > 0) {
    console.log('  第一条记录字段:', Object.keys(d2.data.items[0].fields));
  }
}
main().catch(console.error);
