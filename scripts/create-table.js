/**
 * 脚本：通过 API 创建新表
 */

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken() {
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: 'process.env.FEISHU_APP_ID',
      app_secret: 'process.env.FEISHU_APP_SECRET',
    }),
  });

  const data = await response.json();
  return data.tenant_access_token;
}

async function createTable(token, appToken, tableName, fields) {
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
          fields: fields,
        },
      }),
    }
  );

  return response.json();
}

async function createRecord(token, appToken, tableId, fields) {
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
  const appToken = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';

  console.log('--- 创建新表 ---');
  const fields = [
    { field_name: '反馈ID', type: 1 },
    { field_name: '租户名称', type: 1 },
    { field_name: '反馈内容', type: 1 },
    { field_name: '评分', type: 2 },
    { field_name: '创建时间', type: 5 },
    { field_name: '来源', type: 1 },
    { field_name: 'Tag1', type: 1 },
    { field_name: 'Tag2', type: 1 },
    { field_name: 'Tag3', type: 1 },
    { field_name: '置信度', type: 2 },
  ];

  const tableResult = await createTable(token, appToken, '用户反馈测试', fields);
  console.log('创建表结果:', JSON.stringify(tableResult, null, 2));

  if (tableResult.data && tableResult.data.table_id) {
    const newTableId = tableResult.data.table_id;
    console.log(`\n新表 ID: ${newTableId}`);

    console.log('\n--- 测试写入新表 ---');
    const recordResult = await createRecord(token, appToken, newTableId, {
      反馈ID: 'test-001',
      租户名称: '测试租户',
      反馈内容: '这是一条测试反馈',
      评分: 5,
      来源: '测试',
      Tag1: '功能问题',
      Tag2: 'UI',
      Tag3: '按钮',
      置信度: 0.95,
    });
    console.log('写入结果:', JSON.stringify(recordResult, null, 2));
  }

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
