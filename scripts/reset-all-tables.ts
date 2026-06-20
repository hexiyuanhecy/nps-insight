/**
 * 删除所有旧表并重新创建正确的表结构
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
  
  console.log('获取现有表列表...');
  const tablesResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const tablesData = await tablesResponse.json();
  const tablesToDelete = (tablesData.data?.items || []).map((t: any) => t.table_id);
  
  console.log(`删除 ${tablesToDelete.length} 张旧表...`);
  for (const tableId of tablesToDelete) {
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const data = await response.json();
    console.log(`  删除 ${tableId}: ${data.code === 0 ? '成功' : data.msg}`);
  }
  
  console.log('\n创建新表结构...');
  
  const feedbackTableResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      table: {
        name: '反馈列表',
        default_view_name: '默认视图',
        fields: [
          { field_name: 'feedbackId', type: 1 },
          { field_name: 'tenantId', type: 1 },
          {
            field_name: 'tenantScale',
            type: 3,
            property: { options: [{ name: 'A1', color: 0 }, { name: 'A2', color: 1 }, { name: 'A3', color: 2 }, { name: 'A4', color: 3 }, { name: 'A5', color: 4 }, { name: 'A6', color: 5 }] },
          },
          { field_name: 'userId', type: 1 },
          { field_name: 'userName', type: 1 },
          { field_name: 'createTime', type: 5 },
          {
            field_name: 'module',
            type: 4,
            property: { options: [{ name: '系统卡顿', color: 0 }, { name: '界面不美观', color: 1 }, { name: '功能缺失', color: 2 }, { name: '打开速度慢', color: 3 }, { name: '其他', color: 4 }] },
          },
          { field_name: 'content', type: 1 },
          { field_name: 'npsScore', type: 2 },
          { field_name: 'source', type: 1 },
          { field_name: 'tag1Id', type: 1 },
          { field_name: 'tag2Id', type: 1 },
          { field_name: 'tag3Id', type: 1 },
          {
            field_name: 'tag1',
            type: 3,
            property: { options: [{ name: 'urgent', color: 0 }, { name: 'high', color: 1 }, { name: 'medium', color: 2 }, { name: 'low', color: 3 }, { name: 'info', color: 4 }, { name: 'security', color: 5 }, { name: 'invalid', color: 6 }] },
          },
          { field_name: 'tag2', type: 1 },
          { field_name: 'tag3', type: 1 },
          { field_name: 'summary', type: 1 },
          { field_name: 'suggestions', type: 1 },
          {
            field_name: 'priority',
            type: 3,
            property: { options: [{ name: 'urgent', color: 0 }, { name: 'high', color: 1 }, { name: 'medium', color: 2 }, { name: 'low', color: 3 }] },
          },
          {
            field_name: 'status',
            type: 3,
            property: { options: [{ name: 'new', color: 0 }, { name: 'pending', color: 1 }, { name: 'processing', color: 2 }, { name: 'resolved', color: 3 }, { name: 'closed', color: 4 }] },
          },
          { field_name: 'assigneeId', type: 1 },
        ],
      },
    }),
  });
  const feedbackData = await feedbackTableResponse.json();
  console.log(`  创建反馈列表: ${feedbackData.code === 0 ? `成功 (${feedbackData.data.table_id})` : feedbackData.msg}`);
  
  const tagTableResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      table: {
        name: '标签体系',
        fields: [
          { field_name: 'tagId', type: 1 },
          {
            field_name: 'tag1',
            type: 3,
            property: { options: [{ name: 'urgent', color: 0 }, { name: 'high', color: 1 }, { name: 'medium', color: 2 }, { name: 'low', color: 3 }, { name: 'info', color: 4 }, { name: 'security', color: 5 }, { name: 'invalid', color: 6 }] },
          },
          { field_name: 'tag2', type: 1 },
          { field_name: 'tag3', type: 1 },
          { field_name: 'usageCount', type: 2 },
        ],
      },
    }),
  });
  const tagData = await tagTableResponse.json();
  console.log(`  创建标签体系: ${tagData.code === 0 ? `成功 (${tagData.data.table_id})` : tagData.msg}`);
  
  const tenantTableResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      table: {
        name: '租户信息',
        fields: [
          { field_name: 'tenantId', type: 1 },
          { field_name: 'tenantName', type: 1 },
          {
            field_name: 'scale',
            type: 3,
            property: { options: [{ name: 'A1', color: 0 }, { name: 'A2', color: 1 }, { name: 'A3', color: 2 }, { name: 'A4', color: 3 }, { name: 'A5', color: 4 }, { name: 'A6', color: 5 }] },
          },
          { field_name: 'contact', type: 1 },
          { field_name: 'contactEmail', type: 1 },
          { field_name: 'industry', type: 1 },
          { field_name: 'address', type: 1 },
        ],
      },
    }),
  });
  const tenantData = await tenantTableResponse.json();
  console.log(`  创建租户信息: ${tenantData.code === 0 ? `成功 (${tenantData.data.table_id})` : tenantData.msg}`);
  
  const periodTableResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      table: {
        name: '周期分析',
        fields: [
          { field_name: 'periodId', type: 1 },
          { field_name: 'periodName', type: 1 },
          { field_name: 'startDate', type: 5 },
          { field_name: 'endDate', type: 5 },
          { field_name: 'totalFeedbacks', type: 2 },
          { field_name: 'avgScore', type: 2 },
          { field_name: 'topIssues', type: 1 },
        ],
      },
    }),
  });
  const periodData = await periodTableResponse.json();
  console.log(`  创建周期分析: ${periodData.code === 0 ? `成功 (${periodData.data.table_id})` : periodData.msg}`);
  
  const configTableResponse = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      table: {
        name: '系统配置',
        fields: [
          { field_name: 'configKey', type: 1 },
          { field_name: 'configValue', type: 1 },
          { field_name: 'description', type: 1 },
        ],
      },
    }),
  });
  const configData = await configTableResponse.json();
  console.log(`  创建系统配置: ${configData.code === 0 ? `成功 (${configData.data.table_id})` : configData.msg}`);
  
  console.log('\n表结构创建完成！');
  
  if (feedbackData.code === 0) {
    console.log(`反馈列表表ID: ${feedbackData.data.table_id}`);
    console.log(`请更新 .env 文件中的 BITABLE_TABLE_ID 为: ${feedbackData.data.table_id}`);
  }
}

resetTables().catch(console.error);