/**
 * 脚本：测试不同表格的写入权限
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

async function main() {
  const token = await getTenantAccessToken();

  // 测试新表
  console.log('--- 测试新表 (Iofpb6FzEaBz9SsYsWtcgm0vnic / tblsiUDHKL6Mqj6P) ---');
  const result1 = await createRecord(
    token,
    'Iofpb6FzEaBz9SsYsWtcgm0vnic',
    'tblsiUDHKL6Mqj6P',
    { 文本: '测试内容' }
  );
  console.log('新表结果:', result1.code, result1.msg);

  // 测试之前的表
  console.log('\n--- 测试之前创建的表 (BlwabilILaRRXisV4NOcYiSznlI / tbl3k2P8GCMhJzDR) ---');
  const result2 = await createRecord(
    token,
    'BlwabilILaRRXisV4NOcYiSznlI',
    'tbl3k2P8GCMhJzDR',
    { 反馈ID: 'test-001', 反馈内容: '测试内容' }
  );
  console.log('之前的表结果:', result2.code, result2.msg);

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
