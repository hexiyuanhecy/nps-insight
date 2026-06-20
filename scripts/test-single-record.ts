/**
 * 测试单条记录创建，调试字段格式
 */

require('dotenv').config();

async function testSingleRecord() {
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
  
  const testRecord = {
    fields: {
      feedbackId: 'test-' + Date.now(),
      content: '测试反馈内容',
      npsScore: 5,
      createTime: new Date().getTime(),
      module: '模块A',
      source: '测试',
      tenantId: 'tenant-001',
      tenantName: '测试租户',
      tenantScale: '100-500人',
      userId: 'user-001',
      status: 'new',
    },
  };
  
  console.log('发送的数据:', JSON.stringify(testRecord, null, 2));
  
  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ records: [testRecord] }),
  });
  const data = await response.json();
  console.log('响应:', JSON.stringify(data, null, 2));
}

testSingleRecord().catch(console.error);
