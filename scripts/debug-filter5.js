// 测试不同 filter value格式
require('dotenv').config();
const API_BASE = 'https://open.feishu.cn/open-apis';

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
  const APP_TOKEN = process.env.BITABLE_TOKEN;
  const tableId = process.env.BITABLE_TABLE_ID_TAGS;

  // 先列出数据，看看实际字段和值
  const r0 = await fetch(
    `${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/search`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }
  );
  const d0 = await r0.json();
  console.log('当前记录:', d0.data?.items?.length);
  if (d0.data?.items?.length > 0) {
    console.log('字段值:', JSON.stringify(d0.data.items[0].fields, null, 2));
  }

  const tests = [
    { label: 'value: string', body: { filter: { conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'is', value: '产品功能' }] } } },
    { label: 'value: [string]', body: { filter: { conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'is', value: ['产品功能'] }] } } },
    { label: 'value: string, tagId', body: { filter: { conjunction: 'and', conditions: [{ field_name: 'tagId', operator: 'is', value: 'tag_1781' }] } } },
    { label: 'contains', body: { filter: { conjunction: 'and', conditions: [{ field_name: 'Tag1名称', operator: 'contains', value: '产品' }] } } },
  ];

  for (const t of tests) {
    const r = await fetch(
      `${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(t.body),
      }
    );
    const d = await r.json();
    console.log(`${t.label}: code=${d.code} msg=${d.msg || 'ok'} items=${d.data?.items?.length || 0}`);
  }
}
main().catch(console.error);
