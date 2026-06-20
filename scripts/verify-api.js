// 验证飞书 API 配置
// 使用方式: node scripts/verify-api.js

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';
const BITABLE_TOKEN = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
const BITABLE_TABLE_ID = 'tblsiUDHKL6Mqj6P';
const NOTIFICATION_CHAT_ID = 'oc_29d0d49f829145b53f32dbebba1b3c40';

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
  if (data.code !== 0) {
    throw new Error(`获取 tenant token 失败: ${data.msg} (code=${data.code})`);
  }
  return data.tenant_access_token;
}

async function testBitableRead(token) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables/${BITABLE_TABLE_ID}/records?page_size=1`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.json();
}

async function testBitableWrite(token) {
  const record = {
    fields: {
      '反馈ID': `TEST-${Date.now()}`,
      '租户名称': '测试租户',
      '反馈内容': '这是一条 API 测试反馈',
      '评分': 8,
      'Tag1': ['产品功能'],
    },
  };
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables/${BITABLE_TABLE_ID}/records`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(record),
    }
  );
  return response.json();
}

async function testBitableListTables(token) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}/tables`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.json();
}

async function sendNotification(token) {
  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: NOTIFICATION_CHAT_ID,
        msg_type: 'text',
        content: JSON.stringify({ text: `✅ API 配置验证成功！\n时间：${new Date().toLocaleString('zh-CN')}` }),
      }),
    }
  );
  return response.json();
}

async function main() {
  console.log('='.repeat(60));
  console.log('📋 飞书 API 配置验证');
  console.log('='.repeat(60));
  console.log(`APP_ID: ${APP_ID}`);
  console.log(`APP_SECRET: ${APP_SECRET.substring(0, 6)}...`);
  console.log(`BITABLE_TOKEN: ${BITABLE_TOKEN}`);
  console.log(`BITABLE_TABLE_ID: ${BITABLE_TABLE_ID}`);
  console.log(`NOTIFICATION_CHAT_ID: ${NOTIFICATION_CHAT_ID}`);
  console.log('='.repeat(60));

  try {
    console.log('\n1️⃣ 获取 tenant_access_token ...');
    const token = await getTenantAccessToken();
    console.log('   ✅ Token 获取成功');

    console.log('\n2️⃣ 列出多维表格的表 ...');
    const tables = await testBitableListTables(token);
    console.log('   响应:', JSON.stringify(tables, null, 2).substring(0, 500));

    console.log('\n3️⃣ 测试读取记录 ...');
    const readResult = await testBitableRead(token);
    console.log('   响应:', JSON.stringify(readResult, null, 2).substring(0, 500));

    console.log('\n4️⃣ 测试写入记录 ...');
    const writeResult = await testBitableWrite(token);
    console.log('   响应:', JSON.stringify(writeResult, null, 2));

    console.log('\n5️⃣ 测试发送消息通知 ...');
    const notifyResult = await sendNotification(token);
    console.log('   响应:', JSON.stringify(notifyResult, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('✅ 验证完成');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n❌ 错误:', err.message);
    process.exit(1);
  }
}

main();
