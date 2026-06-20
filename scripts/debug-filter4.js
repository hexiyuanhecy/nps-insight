// 测试 POST records/search 接口
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

  // 测试 POST /records/search - 正确的 filter语法
  const tests = [
    {
      label: '单条件 Text is',
      body: {
        filter: {
          conjunction: 'and',
          conditions: [{ field_name: 'Tag1名称', operator: 'is', value: '产品功能' }],
        },
      },
    },
    {
      label: '无filter',
      body: {},
    },
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
