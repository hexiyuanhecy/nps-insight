// 测试简单字段名 filter
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
  const feedbackTable = process.env.BITABLE_TABLE_ID;
  console.log('测试反馈表:', feedbackTable);

  // 测试反馈表中的简单字段
  const tests = [
    { label: '租户ID=T_xxx (Text)', field: '租户ID', op: 'is', value: 'T_xxx' },
    { label: '状态=待审核 (Text)', field: '审核状态', op: 'is', value: '待审核' },
    { label: 'Tag1=产品功能 (Text)', field: 'Tag1', op: 'is', value: '产品功能' },
    { label: '评分>=8 (Number)', field: '评分', op: '>=', value: 8 },
  ];

  for (const t of tests) {
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [{ field_name: t.field, operator: t.op, value: t.value }],
    });
    const r = await fetch(
      `${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${feedbackTable}/records?filter=${encodeURIComponent(filter)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = await r.json();
    console.log(`  ${t.label}: code=${d.code} msg=${d.msg || 'ok'} items=${d.data?.items?.length || 0}`);
  }

  // 测试 tagId（标签表的字段名）
  const tagsTable = process.env.BITABLE_TABLE_ID_TAGS;
  const tagFilter = JSON.stringify({
    conjunction: 'and',
    conditions: [{ field_name: 'tagId', operator: 'is', value: 'tag_17817' }],
  });
  const r2 = await fetch(
    `${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tagsTable}/records?filter=${encodeURIComponent(tagFilter)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d2 = await r2.json();
  console.log(`  标签表tagId=tag_xxx (Text): code=${d2.code} msg=${d2.msg} items=${d2.data?.items?.length || 0}`);
}
main().catch(console.error);
