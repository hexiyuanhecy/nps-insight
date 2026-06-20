/**
 * 检查反馈列表表的字段结构
 */

require('dotenv').config();

async function checkFields() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.BITABLE_TOKEN;
  const tableId = 'tbl0h89B8ibRwkjE';
  
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
  
  console.log('字段列表:');
  for (const field of data.data?.items || []) {
    const typeNames: Record<number, string> = {
      1: 'Text',
      2: 'Number',
      3: 'SingleSelect',
      4: 'MultiSelect',
      5: 'DateTime',
      6: 'Checkbox',
      7: 'LongText',
      15: 'Attachment',
      17: 'Link',
    };
    console.log(`  ${field.field_name} (${field.field_id}): ${typeNames[field.type] || field.type}`);
    if (field.property?.options) {
      console.log(`    Options: ${JSON.stringify(field.property.options)}`);
    }
  }
}

checkFields().catch(console.error);
