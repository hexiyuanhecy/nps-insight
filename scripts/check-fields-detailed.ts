/**
 * 详细检查反馈列表表的字段结构
 */

require('dotenv').config();

async function checkFields() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.BITABLE_TOKEN;
  const tableId = 'tbl871lLT0I7Sh5L';
  
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
  
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const data = await response.json();
  
  console.log('完整字段数据:', JSON.stringify(data, null, 2));
  
  const contentFields = (data.data?.items || []).filter((f: any) => f.field_name === 'content');
  console.log('\n名为 content 的字段:', JSON.stringify(contentFields, null, 2));
}

checkFields().catch(console.error);
