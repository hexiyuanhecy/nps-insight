/**
 * 检查特定 table_id 是否为数据表
 * 用于确认仪表盘是否为数据表
 */

require('dotenv').config();

const TARGET_APP_TOKEN = 'MIPVbgPfUaq2rwsPX2icCoXwnag';
const CHECK_TABLE_ID = 'blkX4r1PcRv6GKma';

async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取租户Token失败: ${data.msg}`);
  }

  return data.tenant_access_token;
}

async function checkTable(token: string, tableId: string) {
  try {
    const response = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${TARGET_APP_TOKEN}/tables/${tableId}/fields`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const data = await response.json();
    console.log(`\n检查 table_id: ${tableId}`);
    console.log('code:', data.code);
    console.log('msg:', data.msg);
    
    if (data.code === 0 && data.data?.items) {
      console.log('✅ 这是一张数据表，字段如下：');
      for (const field of data.data.items) {
        console.log(`  - ${field.field_name} (type=${field.type})`);
      }
    } else {
      console.log('❌ 不是数据表或访问失败');
    }
  } catch (error: any) {
    console.log('检查失败:', error.message);
  }
}

async function main() {
  const token = await getTenantAccessToken();
  await checkTable(token, CHECK_TABLE_ID);
}

main().catch(console.error);
