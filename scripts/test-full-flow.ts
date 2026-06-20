/**
 * NPS Insight 完整流程测试脚本
 * 
 * 流程：
 * 1. 验证多维表格连接
 * 2. 创建/验证表结构
 * 3. Mock反馈数据（从FeelGood拉取）
 * 4. 筛选租户ID → Mock租户信息 → 写入租户信息表
 * 5. 关联租户名称到反馈列表
 * 6. AI分析打标：先缓存AI结果 → 与标签体系对比 → 存在则填写，不存在则先添加再填写
 * 7. 统计分析（tag分布、TOP问题）
 * 8. 生成总结报告
 * 9. 发送Bot消息通知
 */

require('dotenv').config();

const MODULE_OPTIONS = [
  { name: '系统卡顿', color: 0 },
  { name: '界面不美观', color: 1 },
  { name: '功能缺失', color: 2 },
  { name: '打开速度慢', color: 3 },
  { name: '其他', color: 4 },
];

const TENANTS_DB = [
  { tenantId: 'T001', tenantName: '字节跳动', scale: 'A6', contact: '张三', contactEmail: 'zhangsan@bytedance.com', industry: '互联网', address: '北京市海淀区' },
  { tenantId: 'T002', tenantName: '美团', scale: 'A6', contact: '李四', contactEmail: 'lisi@meituan.com', industry: '本地生活', address: '北京市朝阳区' },
  { tenantId: 'T003', tenantName: '滴滴', scale: 'A5', contact: '王五', contactEmail: 'wangwu@didi.com', industry: '出行', address: '北京市海淀区' },
  { tenantId: 'T004', tenantName: '京东', scale: 'A6', contact: '赵六', contactEmail: 'zhaoliu@jd.com', industry: '电商', address: '北京市大兴区' },
  { tenantId: 'T005', tenantName: '网易', scale: 'A5', contact: '孙七', contactEmail: 'sunqi@netease.com', industry: '互联网', address: '杭州市滨江区' },
  { tenantId: 'T006', tenantName: '小米', scale: 'A5', contact: '周八', contactEmail: 'zhouba@xiaomi.com', industry: '硬件', address: '北京市海淀区' },
  { tenantId: 'T007', tenantName: '携程', scale: 'A4', contact: '吴九', contactEmail: 'wujiu@ctrip.com', industry: '旅游', address: '上海市静安区' },
  { tenantId: 'T008', tenantName: '哔哩哔哩', scale: 'A4', contact: '郑十', contactEmail: 'zhengshi@bilibili.com', industry: '互联网', address: '上海市杨浦区' },
  { tenantId: 'T009', tenantName: '知乎', scale: 'A3', contact: '钱十一', contactEmail: 'qianshiyi@zhihu.com', industry: '互联网', address: '北京市海淀区' },
  { tenantId: 'T010', tenantName: '小红书', scale: 'A4', contact: '刘十二', contactEmail: 'liushier@xiaohongshu.com', industry: '电商', address: '上海市黄浦区' },
];

const FEEDBACK_TEMPLATES = [
  { contents: ['打卡定位失败，一直显示定位中', '点击打卡按钮没反应', '考勤数据丢失，昨天打卡记录不见了', '补卡申请提交后页面报错', '审批流程卡住，无法继续', '工资条显示乱码', '假期余额计算错误'], modules: ['系统卡顿', '功能缺失'] },
  { contents: ['希望支持批量打卡', '建议增加导出考勤报表功能', '希望能自定义审批模板', '建议增加一键补卡功能', '希望支持多地点打卡', '建议增加打卡提醒功能', '希望能设置弹性工作时间'], modules: ['功能缺失'] },
  { contents: ['打卡页面按钮太小，容易误触', '审批页面排版太乱', '工资条页面颜色不统一', '休假申请流程太长，步骤太多', '统计页面图表不清晰', '移动端页面适配有问题', '深色模式下文字看不清'], modules: ['界面不美观'] },
  { contents: ['打卡页面加载太慢，要等5秒', '打开统计页面卡顿严重', 'APP耗电太快', '审批列表滑动卡顿', '工资条页面打开速度慢', '假期余额查询响应慢', '多人同时打卡时系统卡死'], modules: ['打开速度慢', '系统卡顿'] },
  { contents: ['不知道怎么申请补卡', '找不到休假申请入口', '不清楚如何设置审批人', '不知道怎么看工资条', '不了解打卡规则', '不会使用外勤打卡功能', '不清楚假期余额怎么算'], modules: ['其他'] },
  { contents: ['打卡位置可以伪造', '审批权限设置不合理', '工资条信息泄露风险', '考勤数据访问权限过大', '用户隐私保护不足', '打卡记录被篡改', '敏感信息未加密'], modules: ['其他'] },
];

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

async function getTenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取租户Token失败: ${data.msg}`);
  }
  
  return data.tenant_access_token;
}

async function listTables(token: string, appToken: string) {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`列出表失败: ${data.msg}`);
  }
  
  return (data.data?.items || []).map((item: any) => ({
    table_id: item.table_id || '',
    name: item.name || '',
  }));
}

async function listFields(token: string, appToken: string, tableId: string) {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`列出字段失败: ${data.msg}`);
  }
  
  return (data.data?.items || []).map((item: any) => item.field_name || '');
}

async function createField(token: string, appToken: string, tableId: string, fieldName: string, type: number) {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      field: {
        field_name: fieldName,
        type: type,
      },
    }),
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建字段失败 ${fieldName}: ${data.msg}`);
  }
  
  return data.data?.field_id;
}

async function ensureFieldsExist(token: string, appToken: string, tableId: string, requiredFields: Array<{ name: string; type: number }>) {
  const existingFields = await listFields(token, appToken, tableId);
  let createdCount = 0;
  
  for (const field of requiredFields) {
    if (!existingFields.includes(field.name)) {
      try {
        await createField(token, appToken, tableId, field.name, field.type);
        createdCount++;
        console.log(`  ✓ 添加缺失字段: ${field.name}`);
      } catch (error) {
        console.log(`  ⚠ 字段 ${field.name} 创建失败: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  
  return createdCount;
}

async function deleteField(token: string, appToken: string, tableId: string, fieldName: string) {
  const fields = await listFields(token, appToken, tableId);
  const fieldToDelete = fields.find((f: any) => f.field_name === fieldName);
  
  if (!fieldToDelete || !fieldToDelete.field_id) {
    console.log(`  ⚠ 字段 ${fieldName} 不存在或无法删除`);
    return false;
  }
  
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/fields/${fieldToDelete.field_id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const data = await response.json();
  if (data.code !== 0) {
    console.log(`  ⚠ 删除字段 ${fieldName} 失败: ${data.msg}`);
    return false;
  }
  
  console.log(`  ✓ 删除字段 ${fieldName}`);
  return true;
}

async function batchCreateRecords(token: string, appToken: string, tableId: string, records: Array<{ fields: Record<string, unknown> }>) {
  const batchSize = 500;
  const results: any[] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ records: batch }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`批量创建记录失败: ${data.msg}`);
    }

    const createdRecords = data.data?.records || [];
    results.push(...createdRecords);
  }

  return results;
}

async function listRecords(token: string, appToken: string, tableId: string, pageSize: number = 100) {
  const allRecords: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records`);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    url.searchParams.set('page_size', String(pageSize));

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`列出记录失败: ${data.msg}`);
    }

    const records = data.data?.items || [];
    allRecords.push(...records);

    pageToken = data.data?.page_token;
    const hasMore = data.data?.has_more;

    if (!hasMore) break;
  } while (pageToken);

  return allRecords;
}

async function updateRecord(token: string, appToken: string, tableId: string, recordId: string, fields: Record<string, unknown>) {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`更新记录失败: ${data.msg}`);
  }

  return data.data?.record;
}

async function batchUpdateRecords(token: string, appToken: string, tableId: string, records: Array<{ record_id: string; fields: Record<string, unknown> }>) {
  const batchSize = 100;
  const results: any[] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records/batch_update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ records: batch }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      console.log(`  ⚠ 批量更新失败，尝试逐条更新`);
      for (const record of batch) {
        try {
          await updateRecord(token, appToken, tableId, record.record_id, record.fields);
          console.log(`    ✓ 更新成功: ${record.record_id}`);
        } catch (e) {
          console.log(`    ✗ 更新失败: ${record.record_id} - ${e}`);
          console.log(`      字段值:`, JSON.stringify(record.fields));
        }
      }
      return results;
    }

    const updatedRecords = data.data?.records || [];
    results.push(...updatedRecords);
  }

  return results;
}

function generateMockFeedbacks(count: number = 50) {
  const data = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const templateGroup = FEEDBACK_TEMPLATES[Math.floor(Math.random() * FEEDBACK_TEMPLATES.length)];
    const content = templateGroup.contents[Math.floor(Math.random() * templateGroup.contents.length)];
    
    const numModules = Math.floor(Math.random() * templateGroup.modules.length) + 1;
    const selectedModules = [...templateGroup.modules].sort(() => Math.random() - 0.5).slice(0, numModules);
    
    const source = ['小程序-打卡', '小程序-统计', 'PC端', 'APP'][Math.floor(Math.random() * 4)];
    const tenant = TENANTS_DB[Math.floor(Math.random() * TENANTS_DB.length)];
    
    const daysAgo = Math.floor(Math.random() * 7);
    const hoursAgo = Math.floor(Math.random() * 24);
    const createTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);
    
    const scoreRandom = Math.random();
    let score: number;
    if (scoreRandom < 0.4) score = 1;
    else if (scoreRandom < 0.6) score = 2;
    else if (scoreRandom < 0.8) score = 3;
    else if (scoreRandom < 0.9) score = 4;
    else score = 5;

    data.push({
      feedbackId: `FB${String(i + 1).padStart(4, '0')}`,
      content,
      score,
      createTime: createTime.toISOString(),
      modules: selectedModules,
      source,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantScale: tenant.scale,
      userId: `USER${Math.floor(Math.random() * 10000)}`,
    });
  }

  return data;
}

async function sendBotNotification(token: string, chatId: string, message: string) {
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: message }),
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    console.warn(`发送Bot消息失败: ${data.msg}`);
    return false;
  }

  return true;
}

async function aiAnalyzeFeedback(content: string, npsScore: number, module: string, existingTags: any[]) {
  const llmConfig = JSON.parse(process.env.LLM_CONFIG || '{}');
  
  const tagContext = existingTags.length > 0
    ? `\n\n已有标签体系（请尽量使用已有标签，如没有合适的再创建新标签）：\n${existingTags
        .map((t: any) => `- ${t.tag1 || t.tag1Name || ''} > ${t.tag2 || t.tag2Name || ''} > ${t.tag3 || t.tag3Name || ''}`)
        .slice(0, 30)
        .join('\n')}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `你是一位专业的NPS分析专家，请以JSON格式输出分析结果：\n{\n  "tag1": "一级分类（如：产品功能、用户体验、性能问题、客户服务、其他）",\n  "tag2": "二级分类（更具体的维度）",\n  "tag3": "三级分类（最细粒度的分类）",\n  "summary": "一句话摘要，不超过50字",\n  "suggestions": "给产品团队的具体建议，不超过100字",\n  "priority": "优先级（urgent/high/medium/low）",\n  "confidence": 0.95\n}`,
    },
    {
      role: 'user',
      content: `请分析以下NPS反馈：\n\n所属模块：${module}\nNPS评分：${npsScore}/10\n反馈内容：${content}${tagContext}`,
    },
  ];

  try {
    const response = await fetch(llmConfig.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`LLM调用失败: ${data.error.message}`);
    }

    return JSON.parse(data.choices[0].message.content);
  } catch (error) {
    console.error(`AI分析失败: ${error instanceof Error ? error.message : error}`);
    return {
      tag1: '未分类',
      tag2: '未分类',
      tag3: '未分类',
      summary: 'AI分析失败',
      suggestions: '',
      priority: 'medium',
      confidence: 0,
    };
  }
}

async function testFullFlow() {
  console.log('========================================');
  console.log('NPS Insight 完整流程测试');
  console.log('========================================\n');

  const appToken = process.env.BITABLE_TOKEN;

  try {
    const token = await getTenantAccessToken();
    console.log(`✓ 飞书客户端连接成功`);

    const tables = await listTables(token, appToken!);
    console.log(`\n✓ 多维表格验证成功，共 ${tables.length} 张表`);
    tables.forEach((t: any) => console.log(`  - ${t.name} (${t.table_id})`));

    console.log('\n【步骤 2】获取表ID...');
    const tableNameToId: Record<string, string> = {};
    const tableDefinitions = {
      feedback: { name: '反馈列表' },
      tags: { name: '标签体系' },
      tenants: { name: '租户信息' },
      analysis: { name: '周期分析' },
    };
    
    for (const [key, tableDef] of Object.entries(tableDefinitions)) {
      const existing = tables.find((t: any) => t.name === tableDef.name);
      if (existing) {
        tableNameToId[key] = existing.table_id;
        console.log(`✓ ${tableDef.name} 表已存在 (${existing.table_id})`);
      } else {
        console.log(`✗ ${tableDef.name} 表不存在`);
      }
    }

    const feedbackTableId = tableNameToId['feedback'];
    const tenantTableId = tableNameToId['tenants'];
    const tagTableId = tableNameToId['tags'];
    const analysisTableId = tableNameToId['analysis'];

    console.log('\n【步骤 3】Mock反馈数据（模拟从FeelGood拉取）...');
    const mockFeedbacks = generateMockFeedbacks(50);
    console.log(`✓ 生成了 ${mockFeedbacks.length} 条模拟反馈数据`);

    console.log('\n【步骤 4】筛选租户ID并导入租户信息...');
    const tenantIdsFromFeedbacks = Array.from(new Set(mockFeedbacks.map(f => f.tenantId)));
    console.log(`✓ 从反馈中筛选出 ${tenantIdsFromFeedbacks.length} 个租户ID`);
    
    if (tenantTableId) {
      const tenantRecords = tenantIdsFromFeedbacks.map(tenantId => {
        const tenant = TENANTS_DB.find(t => t.tenantId === tenantId);
        return {
          fields: {
            tenantId: tenant?.tenantId || tenantId,
            tenantName: tenant?.tenantName || `租户${tenantId}`,
            scale: tenant?.scale || 'A3',
            contact: tenant?.contact || '未知',
            contactEmail: tenant?.contactEmail || '',
            industry: tenant?.industry || '未知',
            address: tenant?.address || '',
          },
        };
      });
      
      try {
        await batchCreateRecords(token, appToken!, tenantTableId, tenantRecords);
        console.log(`✓ 成功导入 ${tenantRecords.length} 条租户信息`);
      } catch (error) {
        console.log(`⚠ 导入租户信息失败（可能已存在）: ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log('\n【步骤 5】检查并添加缺失字段...');
    const existingFields: string[] = [];
    if (feedbackTableId) {
      const fields = await listFields(token, appToken!, feedbackTableId);
      existingFields.push(...fields);
      console.log(`  当前字段: ${fields.join(', ')}`);
      
      const requiredFields = [
        { name: 'tenantName', type: 1 },
      ];
      for (const field of requiredFields) {
        if (!existingFields.includes(field.name)) {
          try {
            await createField(token, appToken!, feedbackTableId, field.name, field.type);
            console.log(`  ✓ 添加缺失字段: ${field.name}`);
            existingFields.push(field.name);
          } catch (error) {
            console.log(`  ⚠ 字段 ${field.name} 创建失败，跳过: ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    }

    console.log('\n【步骤 5.1】检查并修复tag1字段类型...');
    if (feedbackTableId) {
      const allFields = await listFields(token, appToken!, feedbackTableId);
      const tag1Field = allFields.find((f: any) => f.field_name === 'tag1');
      console.log(`  当前tag1字段类型: ${tag1Field?.type}`);
      if (tag1Field && tag1Field.type !== 1) {
        console.log(`  ⚠ tag1字段当前是类型 ${tag1Field.type}（单选），需要改为文本类型`);
        console.log(`  ├─ 删除旧的tag1字段...`);
        await deleteField(token, appToken!, feedbackTableId, 'tag1');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`  └─ 创建新的tag1字段（文本类型）...`);
        await createField(token, appToken!, feedbackTableId, 'tag1', 1);
        console.log(`  ✓ tag1字段已改为文本类型`);
      } else {
        console.log(`  ✓ tag1字段类型正确（文本类型）`);
      }
    }

    console.log('\n【步骤 6】清空现有数据...');
    if (feedbackTableId) {
      const existingFeedbacks = await listRecords(token, appToken!, feedbackTableId, 500);
      for (const record of existingFeedbacks) {
        if (record.record_id) {
          try {
            await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${feedbackTableId}/records/${record.record_id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            });
          } catch (e) {
            // ignore
          }
        }
      }
      console.log(`  ✓ 清空了 ${existingFeedbacks.length} 条反馈记录`);
    }
    if (tagTableId) {
      const existingTags = await listRecords(token, appToken!, tagTableId, 500);
      for (const record of existingTags) {
        if (record.record_id) {
          try {
            await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tagTableId}/records/${record.record_id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            });
          } catch (e) {
            // ignore
          }
        }
      }
      console.log(`  ✓ 清空了 ${existingTags.length} 条标签记录`);
    }

    console.log('\n【步骤 7】导入反馈列表...');
    if (!feedbackTableId) {
      console.error('✗ 反馈列表表ID未配置');
      return;
    }

    const feedbackRecords = mockFeedbacks.map((f) => {
      const date = new Date(f.createTime);
      const fields: Record<string, unknown> = {
        feedbackId: f.feedbackId,
        content: f.content,
        npsScore: f.score,
        createTime: date.getTime(),
        module: f.modules,
        source: f.source || '',
        tenantId: f.tenantId || '',
        tenantScale: f.tenantScale || '',
        userId: f.userId || '',
        status: 'new',
      };
      if (existingFields.includes('tenantName')) {
        fields['tenantName'] = f.tenantName || '';
      }
      return { fields };
    });

    const createdRecords = await batchCreateRecords(token, appToken!, feedbackTableId, feedbackRecords);
    console.log(`✓ 成功导入 ${createdRecords.length} 条反馈数据`);

    console.log('\n【步骤 8】获取已有标签体系...');
    let existingTags: any[] = [];
    if (tagTableId) {
      existingTags = await listRecords(token, appToken!, tagTableId, 500);
      console.log(`✓ 获取到 ${existingTags.length} 条已有标签`);
    }

    console.log('\n【步骤 9】AI分析打标（完整流程）...');
    console.log('  ┌─ 步骤8.1: AI分析反馈内容');
    console.log('  ├─ 步骤8.2: 与标签体系对比');
    console.log('  ├─ 步骤8.3: 不存在则创建新标签');
    console.log('  └─ 步骤8.4: 更新反馈列表标签');

    const feedbackRecordsWithId = await listRecords(token, appToken!, feedbackTableId, 500);
    const newTagsCreated = 0;
    const updatedFeedbacks: Array<{ record_id: string; fields: Record<string, unknown> }> = [];
    const newTagsToCreate: any[] = [];

    for (const record of feedbackRecordsWithId) {
      const fields = record.fields;
      if (fields.tag1 && fields.tag1 !== '未分类') {
        console.log(`  跳过已打标记录: ${fields.feedbackId}`);
        continue;
      }

      console.log(`  处理反馈: ${fields.feedbackId}`);
      
      const aiResult = await aiAnalyzeFeedback(
        String(fields.content || ''),
        Number(fields.npsScore || 0),
        Array.isArray(fields.module) ? fields.module.join(', ') : String(fields.module || ''),
        existingTags
      );

      console.log(`    AI结果: ${aiResult.tag1} > ${aiResult.tag2} > ${aiResult.tag3}`);

      const tagExists = existingTags.find(
        (t: any) => 
          (t.fields.tag1 || t.fields.tag1Name) === aiResult.tag1 && 
          (t.fields.tag2 || t.fields.tag2Name) === aiResult.tag2 && 
          (t.fields.tag3 || t.fields.tag3Name) === aiResult.tag3
      );

      if (!tagExists) {
        console.log(`    标签不存在，添加到待创建列表`);
        newTagsToCreate.push({
          fields: {
            tagId: `TAG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            tag1: aiResult.tag1,
            tag2: aiResult.tag2,
            tag3: aiResult.tag3,
            usageCount: 1,
          },
        });
      } else {
        console.log(`    标签已存在`);
        if (tagTableId && tagExists.record_id) {
          const currentCount = Number(tagExists.fields.usageCount || 0);
          await updateRecord(token, appToken!, tagTableId, tagExists.record_id, {
            usageCount: currentCount + 1,
          });
        }
      }

      updatedFeedbacks.push({
        record_id: record.record_id,
        fields: {
          tag1: aiResult.tag1,
          tag2: aiResult.tag2,
          tag3: aiResult.tag3,
          summary: aiResult.summary || '',
          suggestions: aiResult.suggestions || '',
        },
      });
    }

    if (tagTableId && newTagsToCreate.length > 0) {
      await batchCreateRecords(token, appToken!, tagTableId, newTagsToCreate);
      console.log(`\n✓ 成功创建 ${newTagsToCreate.length} 条新标签`);
    }

    if (updatedFeedbacks.length > 0) {
      await batchUpdateRecords(token, appToken!, feedbackTableId, updatedFeedbacks);
      console.log(`✓ 成功更新 ${updatedFeedbacks.length} 条反馈的标签`);
    }

    console.log('\n【步骤 10】统计分析...');
    const allFeedbacks = await listRecords(token, appToken!, feedbackTableId, 500);
    
    const tag1Distribution: Record<string, number> = {};
    const tag2Distribution: Record<string, number> = {};
    const tag3Distribution: Record<string, number> = {};
    
    allFeedbacks.forEach((r: any) => {
      const tag1 = String(r.fields.tag1 || '未分类');
      const tag2 = String(r.fields.tag2 || '未分类');
      const tag3 = String(r.fields.tag3 || '未分类');
      
      tag1Distribution[tag1] = (tag1Distribution[tag1] || 0) + 1;
      tag2Distribution[tag2] = (tag2Distribution[tag2] || 0) + 1;
      tag3Distribution[tag3] = (tag3Distribution[tag3] || 0) + 1;
    });

    console.log('\n  Tag1分布:');
    Object.entries(tag1Distribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tag, count]) => {
        const percentage = ((count / allFeedbacks.length) * 100).toFixed(1);
        console.log(`    ${tag}: ${count}条 (${percentage}%)`);
      });

    console.log('\n  Tag2分布（TOP10）:');
    Object.entries(tag2Distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([tag, count]) => {
        console.log(`    ${tag}: ${count}次`);
      });

    console.log('\n  Tag3分布（TOP10）:');
    Object.entries(tag3Distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([tag, count]) => {
        console.log(`    ${tag}: ${count}次`);
      });

    const avgScore = allFeedbacks.reduce((sum: number, r: any) => sum + Number(r.fields.npsScore || 0), 0) / allFeedbacks.length;
    console.log(`\n  平均评分: ${avgScore.toFixed(2)}`);

    console.log('\n【步骤 11】生成周期分析报告...');
    if (analysisTableId) {
      const periodId = `PA_${Date.now()}`;
      const periodName = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月第${Math.ceil(new Date().getDate() / 7)}周`;
      
      const topTag1s = Object.entries(tag1Distribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag, count]) => `${tag}(${count}条)`);

      await createRecord(token, appToken!, analysisTableId, {
        periodId,
        periodName,
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime(),
        endDate: new Date().getTime(),
        totalFeedbacks: allFeedbacks.length,
        avgScore: avgScore,
        topIssues: JSON.stringify(topTag1s),
      });
      console.log(`✓ 成功生成周期分析报告: ${periodName}`);
    }

    console.log('\n【步骤 10】发送Bot通知...');
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    if (chatId) {
      const message = `【NPS Insight】完整流程测试完成\n\n📊 统计结果：\n- 反馈总数：${allFeedbacks.length}条\n- 平均评分：${avgScore.toFixed(2)}\n- 新增标签：${newTagsToCreate.length}个\n- TOP标签：${Object.entries(tag1Distribution).sort((a, b) => b[1] - a[1])[0]?.[0] || '无'}\n\n分析报告已生成，请查看多维表格。`;
      
      const success = await sendBotNotification(token, chatId, message);
      if (success) {
        console.log('✓ Bot通知发送成功');
      } else {
        console.log('⚠ Bot通知发送失败');
      }
    }

    console.log('\n========================================');
    console.log('测试完成！');
    console.log('========================================');

  } catch (error) {
    console.error('\n✗ 测试流程失败:', error);
  }
}

async function createRecord(token: string, appToken: string, tableId: string, fields: Record<string, unknown>) {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${appToken}/tables/${tableId}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建记录失败: ${data.msg}`);
  }

  return data.data?.record;
}

testFullFlow().catch(console.error);