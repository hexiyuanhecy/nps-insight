/**
 * 测试飞书通知功能 - 修复版
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
  
  const message = `【NPS Insight 配置变更通知】

时间: ${new Date().toLocaleString()}

多维表格配置:
- appToken: ${process.env.BITABLE_TOKEN}

数据导入:
- 已成功导入 50 条 Mock 数据
- 平均评分: 2.38

系统状态:
- 多维表格: 正常
- AI 打标: 待配置 API Key`;
  
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: message }),
    }),
  });
  
  const data = await response.json();
  console.log('通知发送结果:', JSON.stringify(data, null, 2));
  
  if (data.code === 0) {
    console.log('✅ 通知发送成功！');
  } else {
    console.log('❌ 通知发送失败:', data.msg);
  }
}

testNotification().catch(console.error);
