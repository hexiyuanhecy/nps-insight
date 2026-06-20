/**
 * 脚本：测试表格读写功能
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
  if (data.code !== 0) {
    throw new Error(`获取 token 失败: ${data.msg}`);
  }

  return data.tenant_access_token;
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

  const data = await response.json();
  console.log('\n=== 读取记录 ===');
  console.log(JSON.stringify(data, null, 2));
  return data;
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

  const data = await response.json();
  console.log('\n=== 创建记录 ===');
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function sendMessage(token, chatId, content) {
  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }),
    }
  );

  const data = await response.json();
  console.log('\n=== 发送消息 ===');
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  const appToken = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
  const tableId = 'tblsiUDHKL6Mqj6P';
  const chatId = 'oc_29d0d49f829145b53f32dbebba1b3c40';

  console.log('开始测试...');
  const token = await getTenantAccessToken();
  console.log('Token 获取成功');

  // 1. 测试读取
  await listRecords(token, appToken, tableId);

  // 2. 测试写入（用现有字段"文本"）
  await createRecord(token, appToken, tableId, {
    文本: '测试反馈内容',
  });

  // 3. 再次读取验证
  await listRecords(token, appToken, tableId);

  // 4. 测试发送消息
  await sendMessage(token, chatId, '【NPS Insight】测试消息 - 来自直接 API 调用');

  console.log('\n✅ 测试完成！');
}

main().catch(console.error);
