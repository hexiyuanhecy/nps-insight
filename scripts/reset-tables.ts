/**
 * 删除并重新创建表结构
 */

require('dotenv').config();

async function resetTables() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.BITABLE_TOKEN;
  
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
  
  const tablesToDelete = [
    'tblJM6KjF5vcAof1',
    'tbla0dlJDNh5Fmli',
    'tblk67Jvqi4T2Gte',
    'tbl6w6rQ1zSo1OKh',
    'tblPoNbiF3uEIrZw',
  ];
  
  for (const tableId of tablesToDelete) {
    console.log(`删除表: ${tableId}`);
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': 'Bearer ' + token
      },
    });
    const data = await response.json();
    console.log(`结果: code=${data.code}, msg=${data.msg}`);
  }
  
  console.log('\n所有表已删除，现在运行完整测试流程重新创建');
}

resetTables().catch(console.error);
