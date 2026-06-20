// 查看标签表字段定义
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

  const r = await fetch(`${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/fields`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  for (const f of d.data?.items || []) {
    console.log(`  ${f.field_name} (type: ${f.type})`);
  }

  // 同样列出反馈表字段
  const feedbackTableId = process.env.BITABLE_TABLE_ID;
  const r2 = await fetch(`${API_BASE}/bitable/v1/apps/${APP_TOKEN}/tables/${feedbackTableId}/fields`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d2 = await r2.json();
  console.log('\n反馈表字段:');
  for (const f of d2.data?.items || []) {
    console.log(`  ${f.field_name} (type: ${f.type})`);
  }
}
main().catch(console.error);
