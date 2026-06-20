/**
 * 测试飞书通知功能
 */

require('dotenv').config();

async function testNotification() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  
  const tokenResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenData = await tokenResponse.json();
  
  if (tokenData.code !== 0) {
    console.log('Token获取失败:', tokenData);
    return;
  }
  
  const token = tokenData.tenant_access_token;
  
  const chatId = process.env.NOTIFICATION_CHAT_ID || '';
  
  if (!chatId || chatId.includes('xxxxxxxx')) {
    console.log('❌ 请先配置 NOTIFICATION_CHAT_ID');
    return;
  }
  
  const message = `【NPS Insight 配置变更通知】\n\n时间: ${new Date().toLocaleString()}\n\n### 多维表格配置\n- appToken: ${process.env.BITABLE_TOKEN}\n\n### 数据导入\n- 已成功导入 50 条 Mock 数据\n- 平均评分: 2.06\n\n### 系统状态\n- 多维表格: 正常\n- AI 打标: 待配置 API Key`;
  
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: message }),
      receive_id_type: 'chat_id',
    }),
  });
  
  const data = await response.json();
  console.log('通知发送结果:', data);
  
  if (data.code === 0) {
    console.log('✅ 通知发送成功！');
  } else {
    console.log('❌ 通知发送失败:', data.msg);
  }
}

testNotification().catch(console.error);
