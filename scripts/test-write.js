/**
 * 脚本：测试新创建的表写入
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

async function listRecords(token, appToken, tableId) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.json();
}

async function main() {
  const token = await getTenantAccessToken();
  const appToken = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
  const tableId = 'tbly88waV0SRTDPd';

  console.log('--- 写入测试 ---');
  const result = await createRecord(token, appToken, tableId, {
    反馈ID: 'test-001',
    租户名称: '测试租户',
    反馈内容: '这是一条测试反馈',
    评分: 5,
    来源: 'API测试',
    Tag1: '功能问题',
    Tag2: 'UI',
    Tag3: '按钮',
    置信度: 0.95,
    审核状态: '待审核',
  });
  console.log('写入结果:', JSON.stringify(result, null, 2));

  console.log('\n--- 读取验证 ---');
  const readResult = await listRecords(token, appToken, tableId);
  console.log('读取结果:', JSON.stringify(readResult, null, 2));

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
