/**
 * NPS Insight 打标测试脚本
 * 测试AI打标功能
 * 
 * 用法: npm run test:tag
 */

require('dotenv').config();

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

// 从环境变量获取配置
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_TOKEN = process.env.BITABLE_TOKEN;
const BITABLE_TABLE_ID = process.env.BITABLE_TABLE_ID;
const BITABLE_TABLE_ID_TAGS = process.env.BITABLE_TABLE_ID_TAGS;

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 获取LLM配置
 */
function getLLMConfig(): LLMConfig {
  const config = JSON.parse(process.env.LLM_CONFIG || '{}');
  return {
    baseUrl: config.baseUrl || 'https://api-hub.agnes-ai.com/v1',
    apiKey: config.apiKey || process.env.LLM_API_KEY || '',
    model: config.model || 'agnes-2.0-flash',
  };
}

/**
 * 获取飞书Tenant Access Token
 */
async function getTenantAccessToken(): Promise<string> {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取Token失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

/**
 * 获取所有记录
 */
async function listRecords(token: string, tableId: string, pageSize: number = 100): Promise<any[]> {
  const allRecords: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BITABLE_API_BASE}/apps/${BITABLE_TOKEN}/tables/${tableId}/records`);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    url.searchParams.set('page_size', String(pageSize));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`列出记录失败: ${data.msg}`);
    }

    allRecords.push(...(data.data?.items || []));
    pageToken = data.data?.page_token;
    if (!data.data?.has_more) break;
  } while (pageToken);

  return allRecords;
}

/**
 * 批量更新记录
 */
async function batchUpdateRecords(
  token: string,
  tableId: string,
  records: Array<{ record_id: string; fields: Record<string, unknown> }>
): Promise<boolean> {
  const response = await fetch(
    `${BITABLE_API_BASE}/apps/${BITABLE_TOKEN}/tables/${tableId}/records/batch_update`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ records }),
    }
  );

  const data = await response.json();
  return data.code === 0;
}

/**
 * 调用LLM进行打标
 */
async function tagFeedbackWithLLM(
  content: string,
  npsScore: number,
  module: string
): Promise<{
  tag1: string;
  tag2: string;
  tag3: string;
  confidence: number;
  summary: string;
  suggestions: string[];
}> {
  const config = getLLMConfig();

  const systemPrompt = `你是NPS反馈分析专家。请分析用户反馈，判断问题类型并打标签。

Tag1（一级标签）：疑似Bug、功能优化、界面改进、性能提升、用户教育、安全合规、无效反馈

Tag2（二级标签）：功能模块（动态，可新增）

Tag3（三级标签）：具体问题（动态，可新增）

优先级规则：
- NPS <= 4 -> HIGH
- NPS 5-6 -> MEDIUM
- NPS >= 7 -> LOW

输出格式（JSON）：
{
  "tag1": "Tag1名称",
  "tag2": "功能模块名称",
  "tag3": "具体问题",
  "priority": "HIGH | MEDIUM | LOW",
  "confidence": 0.95,
  "summary": "一句话总结",
  "suggestions": ["建议1", "建议2"]
}`;

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `反馈：${content}\nNPS：${npsScore}\n模块：${module}` },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(`LLM调用失败: ${data.error.message}`);
    }

    const result = JSON.parse(data.choices[0].message.content);
    return {
      tag1: result.tag1 || '无效反馈',
      tag2: result.tag2 || '',
      tag3: result.tag3 || '',
      confidence: result.confidence || 0.5,
      summary: result.summary || '',
      suggestions: result.suggestions || [],
    };
  } catch (error) {
    console.error('LLM调用失败:', error);
    return {
      tag1: '无效反馈',
      tag2: '未知',
      tag3: '分析失败',
      confidence: 0,
      summary: 'AI分析失败',
      suggestions: [],
    };
  }
}

/**
 * 执行打标测试
 */
async function testTagging() {
  console.log('========================================');
  console.log('NPS Insight 打标测试');
  console.log('========================================\n');

  try {
    const token = await getTenantAccessToken();
    console.log('✓ 飞书连接成功');

    // 获取未打标的反馈
    if (!BITABLE_TABLE_ID) {
      console.error('✗ BITABLE_TABLE_ID 未配置');
      return;
    }

    const allRecords = await listRecords(token, BITABLE_TABLE_ID);
    console.log(`✓ 获取到 ${allRecords.length} 条反馈`);

    // 筛选未打标的反馈
    const untaggedRecords = allRecords.filter((r: any) => {
      const tag1 = r.fields?.Tag1 || r.fields?.tag1 || r.fields?.['Tag1(问题性质)'];
      return !tag1 || tag1 === '';
    });

    console.log(`✓ 其中 ${untaggedRecords.length} 条未打标`);

    if (untaggedRecords.length === 0) {
      console.log('\n没有需要打标的反馈');
      return;
    }

    // 限制测试数量
    const testRecords = untaggedRecords.slice(0, 10);
    console.log(`\n开始对前 ${testRecords.length} 条反馈进行打标测试...\n`);

    const updateRecords: Array<{ record_id: string; fields: Record<string, unknown> }> = [];

    for (const record of testRecords) {
      const content = record.fields?.反馈内容 || record.fields?.content || record.fields?.['反馈内容'] || '';
      const score = record.fields?.评分 || record.fields?.score || record.fields?.['评分'] || 0;
      const module = record.fields?.模块 || record.fields?.module || record.fields?.['模块'] || '';

      console.log(`处理: ${content.substring(0, 30)}...`);

      const result = await tagFeedbackWithLLM(content, score, module);

      console.log(`  → Tag1: ${result.tag1}`);
      console.log(`  → Tag2: ${result.tag2}`);
      console.log(`  → Tag3: ${result.tag3}`);
      console.log(`  → 置信度: ${result.confidence}`);

      updateRecords.push({
        record_id: record.record_id,
        fields: {
          Tag1: result.tag1,
          Tag2: result.tag2,
          Tag3: result.tag3,
          置信度: result.confidence,
          审核状态: result.confidence < 0.8 ? '待审核' : '无需审核',
        },
      });
    }

    // 批量更新
    if (updateRecords.length > 0) {
      console.log('\n批量更新标签...');
      const success = await batchUpdateRecords(token, BITABLE_TABLE_ID, updateRecords);
      if (success) {
        console.log(`✓ 成功更新 ${updateRecords.length} 条记录`);
      } else {
        console.log('✗ 批量更新失败');
      }
    }

    console.log('\n========================================');
    console.log('打标测试完成');
    console.log('========================================');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);
  }
}

testTagging().catch(console.error);
