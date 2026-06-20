// 创建标签表、租户表、分析表，并验证所有表都可用
require('dotenv').config();

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken() {
  const response = await fetch(
    `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.FEISHU_APP_ID,
        app_secret: process.env.FEISHU_APP_SECRET,
      }),
    }
  );
  const data = await response.json();
  if (data.code === 0) return data.tenant_access_token;
  throw new Error(JSON.stringify(data));
}

async function createTable(token, appToken, name, fields) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        table: {
          name,
          default_view_name: '默认视图',
          fields,
        },
      }),
    }
  );
  return response.json();
}

async function writeRecord(token, appToken, tableId, fields) {
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
  return response.json();
}

async function listTables(token, appToken) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function deleteTable(token, appToken, tableId) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
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
  return response.json();
}

async function main() {
  const token = await getTenantAccessToken();
  const appToken = process.env.BITABLE_TOKEN;

  // 1. 创建标签表
  console.log('1. 创建标签表...');
  const allTables = (await listTables(token, appToken)).data?.items || [];
  for (const t of allTables) {
    if (['标签表', '租户表', '分析表'].includes(t.name)) {
      const delRes = await deleteTable(token, appToken, t.table_id);
      console.log('   删除旧表 ' + t.name + ':', delRes.code === 0 ? '✅' : '❌ ' + delRes.msg);
    }
  }
  const tags = await createTable(token, appToken, '标签表', [
    { field_name: 'tagId', type: 1 },
    { field_name: 'Tag1名称', type: 1 },
    { field_name: 'Tag2名称', type: 1 },
    { field_name: 'Tag3名称', type: 1 },
    { field_name: '使用次数', type: 2 },
    { field_name: '定义', type: 1 },
    { field_name: '状态', type: 1 },
    { field_name: '创建人', type: 1 },
    { field_name: '创建时间', type: 5 },
  ]);
  if (tags.code !== 0) console.log('   详情:', JSON.stringify(tags));
  console.log('   ', tags.code === 0 ? '✅ ' + tags.data?.table_id : '❌ ' + tags.msg);
  const tagsTableId = tags.data?.table_id;

  // 2. 创建租户表
  console.log('2. 创建租户表...');
  const tenants = await createTable(token, appToken, '租户表', [
    { field_name: '租户ID', type: 1 },
    { field_name: '租户名称', type: 1 },
    { field_name: '规模', type: 1 },
    { field_name: '联系人', type: 1 },
    { field_name: '联系邮箱', type: 1 },
    { field_name: '日志平台', type: 1 },
    { field_name: '日志端点', type: 1 },
    { field_name: '日志凭证', type: 1 },
    { field_name: '创建时间', type: 5 },
  ]);
  console.log('   ', tenants.code === 0 ? '✅ ' + tenants.data?.table_id : '❌ ' + tenants.msg);
  const tenantsTableId = tenants.data?.table_id;

  // 3. 创建分析表
  console.log('3. 创建分析表...');
  const analysis = await createTable(token, appToken, '分析表', [
    { field_name: '周期ID', type: 1 },
    { field_name: '周期名称', type: 1 },
    { field_name: '开始日期', type: 5 },
    { field_name: '结束日期', type: 5 },
    { field_name: '总反馈数', type: 2 },
    { field_name: 'NPS得分', type: 2 },
    { field_name: 'Top问题', type: 1 },
    { field_name: '问题标识', type: 1 },
    { field_name: 'Tag1', type: 1 },
    { field_name: 'Tag2', type: 1 },
    { field_name: 'Tag3', type: 1 },
    { field_name: '累计数量', type: 2 },
    { field_name: '大租户数', type: 2 },
    { field_name: '大租户占比', type: 2 },
    { field_name: '平均分', type: 2 },
    { field_name: '综合评分', type: 2 },
    { field_name: '本月新增', type: 2 },
    { field_name: '状态', type: 1 },
    { field_name: '创建时间', type: 5 },
  ]);
  console.log('   ', analysis.code === 0 ? '✅ ' + analysis.data?.table_id : '❌ ' + analysis.msg);
  const analysisTableId = analysis.data?.table_id;

  // 4. 验证写入 - 用户反馈表
  console.log('4. 测试用户反馈表写入...');
  const feedbackTableId = process.env.BITABLE_TABLE_ID;
  const now = Date.now();
  const feedbackRes = await writeRecord(token, appToken, feedbackTableId, {
    反馈ID: 'fb_' + now,
    租户ID: 'T001',
    租户名称: '测试租户',
    租户规模: 'A3',
    用户ID: 'U001',
    用户名称: '测试用户',
    创建时间: now,
    模块: '核心模块',
    反馈内容: '这是一条测试反馈内容',
    评分: 9,
    来源: 'e2e_test',
    Tag1: '产品功能',
    Tag2: '界面交互',
    Tag3: '按钮位置',
    置信度: 0.9,
    审核状态: '待审核',
    打标时间: now,
  });
  console.log('   ', feedbackRes.code === 0 ? '✅ ' + feedbackRes.data?.record?.record_id : '❌ ' + feedbackRes.msg);

  // 5. 测试标签表写入
  console.log('5. 测试标签表写入...');
  const tagRes = await writeRecord(token, appToken, tagsTableId, {
    tagId: 'tag_' + now,
    'Tag1名称': '产品功能',
    'Tag2名称': '界面交互',
    'Tag3名称': '按钮位置',
    使用次数: 1,
    定义: '产品功能与界面交互相关',
    状态: 'active',
    创建人: 'test',
    创建时间: now,
  });
  console.log('   ', tagRes.code === 0 ? '✅ ' + tagRes.data?.record?.record_id : '❌ ' + tagRes.msg);

  // 6. 测试租户表写入
  console.log('6. 测试租户表写入...');
  const tenantRes = await writeRecord(token, appToken, tenantsTableId, {
    租户ID: 'T_' + now,
    租户名称: '测试租户',
    规模: 'A3',
    联系人: '张三',
    联系邮箱: 'test@example.com',
    日志平台: 'LogRocket',
    日志端点: 'https://example.com',
    日志凭证: 'secret',
    创建时间: now,
  });
  console.log('   ', tenantRes.code === 0 ? '✅ ' + tenantRes.data?.record?.record_id : '❌ ' + tenantRes.msg);

  // 7. 测试分析表写入
  console.log('7. 测试分析表写入...');
  const analysisRes = await writeRecord(token, appToken, analysisTableId, {
    周期ID: 'P_' + now,
    周期名称: '2026年6月',
    开始日期: now,
    结束日期: now,
    总反馈数: 100,
    NPS得分: 72,
    Top问题: JSON.stringify([{ tag1: '产品功能', count: 25 }]),
    问题标识: 'issue_' + now,
    Tag1: '产品功能',
    Tag2: '界面交互',
    Tag3: '按钮位置',
    累计数量: 25,
    大租户数: 10,
    大租户占比: 40,
    平均分: 8,
    综合评分: 85,
    本月新增: 12,
    状态: '待讨论',
    创建时间: now,
  });
  console.log('   ', analysisRes.code === 0 ? '✅ ' + analysisRes.data?.record?.record_id : '❌ ' + analysisRes.msg);

  // 8. 发送消息
  console.log('8. 发送飞书消息...');
  const msgRes = await sendMessage(token, process.env.NOTIFICATION_CHAT_ID, '✅ 表创建&写入测试成功\n\n表ID:\n- 用户反馈: ' + feedbackTableId + '\n- 标签: ' + tagsTableId + '\n- 租户: ' + tenantsTableId + '\n- 分析: ' + analysisTableId);
  console.log('   ', msgRes.code === 0 ? '✅ ' + msgRes.data?.message_id : '❌ ' + msgRes.msg);

  // 9. 列出所有表
  console.log('\n9. 列出所有表:');
  const list = await listTables(token, appToken);
  for (const t of list.data?.items || []) {
    console.log('   -', t.name, '(' + t.table_id + ')');
  }

  // 10. 输出最终配置
  console.log('\n✅ 测试完成');
  console.log('\n环境变量建议:');
  console.log(`FEISHU_APP_ID=${process.env.FEISHU_APP_ID}`);
  console.log(`FEISHU_APP_SECRET=${process.env.FEISHU_APP_SECRET}`);
  console.log(`BITABLE_TOKEN=${appToken}`);
  console.log(`BITABLE_TABLE_ID=${feedbackTableId}`);
  console.log(`BITABLE_TABLE_ID_TAGS=${tagsTableId}`);
  console.log(`BITABLE_TABLE_ID_TENANTS=${tenantsTableId}`);
  console.log(`BITABLE_TABLE_ID_ANALYSIS=${analysisTableId}`);
  console.log(`NOTIFICATION_CHAT_ID=${process.env.NOTIFICATION_CHAT_ID}`);
}

main().catch(err => {
  console.error('❌ 错误:', err.message, err);
  process.exit(1);
});
