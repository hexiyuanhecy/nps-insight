// 测试用户反馈表读写
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';
const BITABLE_TOKEN = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
const FEEDBACK_TABLE_ID = 'tbly88waV0SRTDPd';

async function getTenantAccessToken() {
  const response = await fetch(
    `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    }
  );
  const data = await response.json();
  if (data.code === 0) return data.tenant_access_token;
  throw new Error(JSON.stringify(data));
}

async function listFields(token, tableId) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables/${tableId}/fields`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function readRecords(token, tableId) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables/${tableId}/records?page_size=3`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function writeRecord(token, tableId, fields) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fields }),
    }
  );
  return response.json();
}

async function main() {
  const token = await getTenantAccessToken();
  console.log('Token OK');

  console.log('\n=== 用户反馈表字段 ===');
  const fields = await listFields(token, FEEDBACK_TABLE_ID);
  console.log(JSON.stringify(fields, null, 2));

  console.log('\n=== 用户反馈表数据 ===');
  const records = await readRecords(token, FEEDBACK_TABLE_ID);
  console.log(JSON.stringify(records, null, 2).substring(0, 800));

  console.log('\n=== 写入测试（仅使用已存在字段）===');
  const fieldNames = fields.data?.items?.map(f => f.field_name) || [];
  console.log('可用字段:', fieldNames);

  const testFields = {};
  if (fieldNames.includes('反馈内容')) testFields['反馈内容'] = '测试反馈内容';
  if (fieldNames.includes('租户名称')) testFields['租户名称'] = '测试租户A';
  if (fieldNames.includes('反馈ID')) testFields['反馈ID'] = `TEST-${Date.now()}`;
  if (fieldNames.includes('评分')) testFields['评分'] = 9;

  console.log('写入字段:', testFields);
  const write = await writeRecord(token, FEEDBACK_TABLE_ID, testFields);
  console.log(JSON.stringify(write, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
