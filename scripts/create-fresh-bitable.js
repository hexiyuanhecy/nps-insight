// 让应用自己创建一个全新的多维表格和字段
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';

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

async function createBitable(token) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `NPS 用户反馈表-${new Date().toISOString().slice(0, 10)}`,
        time_zone: 'Asia/Shanghai',
      }),
    }
  );
  return response.json();
}

async function createTable(token, appToken, tableName) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        table: {
          name: tableName,
          default_view_name: '默认视图',
          fields: [
            { field_name: '反馈ID', type: 1 },
            { field_name: '租户ID', type: 1 },
            { field_name: '租户名称', type: 1 },
            {
              field_name: '租户规模',
              type: 3,
              property: {
                options: [
                  { name: 'A1', color: 0 },
                  { name: 'A2', color: 1 },
                  { name: 'A3', color: 2 },
                  { name: 'A4', color: 3 },
                  { name: 'A5', color: 4 },
                ],
              },
            },
            { field_name: '用户ID', type: 1 },
            { field_name: '用户名称', type: 1 },
            { field_name: '创建时间', type: 5 },
            { field_name: '模块', type: 1 },
            { field_name: '反馈内容', type: 1 },
            { field_name: '评分', type: 2 },
            { field_name: '来源', type: 1 },
            { field_name: 'Tag1', type: 1 },
            { field_name: 'Tag2', type: 1 },
            { field_name: 'Tag3', type: 1 },
            { field_name: '置信度', type: 2 },
            {
              field_name: '审核状态',
              type: 3,
              property: {
                options: [
                  { name: '待审核', color: 0 },
                  { name: '已审核', color: 1 },
                  { name: '无需审核', color: 2 },
                ],
              },
            },
            { field_name: '打标时间', type: 5 },
          ],
        },
      }),
    }
  );
  return response.json();
}

async function listTables(token, appToken) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function writeRecord(token, appToken, tableId, fields) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
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

  console.log('\n1️⃣ 创建新多维表格应用...');
  const app = await createBitable(token);
  console.log(JSON.stringify(app, null, 2));

  if (app.code !== 0) {
    console.error('❌ 创建应用失败');
    return;
  }
  const appToken = app.data.app.app_token;
  console.log('✅ 应用 token:', appToken);

  // 先列出默认表格，用它的 id 来新增字段
  console.log('\n2️⃣ 列出默认表格...');
  const tables1 = await listTables(token, appToken);
  console.log(JSON.stringify(tables1, null, 2));

  // 或者直接创建一个带完整字段的表
  console.log('\n3️⃣ 创建用户反馈表（带完整字段）...');
  const table = await createTable(token, appToken, '用户反馈表');
  console.log(JSON.stringify(table, null, 2));
  const tableId = table.data?.table_id;
  console.log('✅ table_id:', tableId);

  console.log('\n4️⃣ 测试写入记录...');
  const write = await writeRecord(token, appToken, tableId, {
    反馈ID: `TEST-${Date.now()}`,
    租户ID: 'T001',
    租户名称: '测试租户A',
    用户ID: 'U001',
    用户名称: '测试用户',
    模块: '核心模块',
    反馈内容: '这是一条测试反馈，很好用',
    评分: 9,
    来源: 'API测试',
    Tag1: '产品功能',
    Tag2: '界面交互',
    Tag3: '按钮位置',
    置信度: 0.95,
  });
  console.log(JSON.stringify(write, null, 2));

  console.log('\n=== 新配置 ===');
  console.log(`BITABLE_TOKEN=${appToken}`);
  console.log(`BITABLE_TABLE_ID=${tableId}`);
}

main().catch(err => { console.error(err); process.exit(1); });
