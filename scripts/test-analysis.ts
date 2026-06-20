/**
 * NPS Insight 分析测试脚本
 * 测试月度分析功能（标签自进化 + Top问题生成）
 * 
 * 用法: npm run test:analysis
 */

require('dotenv').config();

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

// 从环境变量获取配置
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_TOKEN = process.env.BITABLE_TOKEN;
const BITABLE_TABLE_ID = process.env.BITABLE_TABLE_ID;
const BITABLE_TABLE_ID_TAGS = process.env.BITABLE_TABLE_ID_TAGS;
const BITABLE_TABLE_ID_TENANTS = process.env.BITABLE_TABLE_ID_TENANTS;
const BITABLE_TABLE_ID_ANALYSIS = process.env.BITABLE_TABLE_ID_ANALYSIS;

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
 * 创建记录
 */
async function createRecord(token: string, tableId: string, fields: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${BITABLE_API_BASE}/apps/${BITABLE_TOKEN}/tables/${tableId}/records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`创建记录失败: ${data.msg}`);
  }

  return data.data?.record?.record_id || '';
}

/**
 * 计算字符串相似度（简单实现）
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * 执行分析测试
 */
async function testAnalysis() {
  console.log('========================================');
  console.log('NPS Insight 分析测试');
  console.log('========================================\n');

  try {
    const token = await getTenantAccessToken();
    console.log('✓ 飞书连接成功');

    // 1. 获取反馈数据
    if (!BITABLE_TABLE_ID) {
      console.error('✗ BITABLE_TABLE_ID 未配置');
      return;
    }

    const feedbacks = await listRecords(token, BITABLE_TABLE_ID);
    console.log(`✓ 获取到 ${feedbacks.length} 条反馈`);

    // 2. 获取标签数据
    if (!BITABLE_TABLE_ID_TAGS) {
      console.error('✗ BITABLE_TABLE_ID_TAGS 未配置');
      return;
    }

    const tags = await listRecords(token, BITABLE_TABLE_ID_TAGS);
    console.log(`✓ 获取到 ${tags.length} 条标签`);

    // 3. 获取租户数据
    if (BITABLE_TABLE_ID_TENANTS) {
      const tenants = await listRecords(token, BITABLE_TABLE_ID_TENANTS);
      console.log(`✓ 获取到 ${tenants.length} 条租户`);
    }

    // ============================================
    // 步骤1: 标签自进化测试
    // ============================================
    console.log('\n【步骤1】标签自进化分析');
    console.log('----------------------------------------');

    // 3.1 检测重复标签
    console.log('\n3.1 检测重复标签（相似度>0.85）...');
    const SIMILARITY_THRESHOLD = 0.85;
    const duplicates: Array<{ tags: any[]; similarity: number }> = [];

    const tag3Groups: Record<string, any[]> = {};
    for (const tag of tags) {
      const tag3Name = tag.fields?.['Tag3名称'] || tag.fields?.tag3Name || '';
      if (!tag3Groups[tag3Name]) {
        tag3Groups[tag3Name] = [];
      }
      tag3Groups[tag3Name].push(tag);
    }

    // 检测跨组相似标签
    const tag3Names = Object.keys(tag3Groups);
    for (let i = 0; i < tag3Names.length; i++) {
      for (let j = i + 1; j < tag3Names.length; j++) {
        const similarity = calculateSimilarity(tag3Names[i], tag3Names[j]);
        if (similarity > SIMILARITY_THRESHOLD) {
          duplicates.push({
            tags: [tag3Groups[tag3Names[i]][0], tag3Groups[tag3Names[j]][0]],
            similarity,
          });
          console.log(`  发现重复: "${tag3Names[i]}" ≈ "${tag3Names[j]}" (相似度: ${similarity.toFixed(2)})`);
        }
      }
    }

    if (duplicates.length === 0) {
      console.log('  未发现重复标签');
    }

    // 3.2 检测可拆分标签
    console.log('\n3.2 检测可拆分标签（Tag2下Tag3数量>10且分布不均）...');
    const tag2Groups: Record<string, { tag2: any; tag3Count: number }> = {};

    for (const tag of tags) {
      const tag2Name = tag.fields?.['Tag2名称'] || tag.fields?.tag2Name || '';
      const tag3Name = tag.fields?.['Tag3名称'] || tag.fields?.tag3Name || '';

      if (!tag2Groups[tag2Name]) {
        tag2Groups[tag2Name] = { tag2: tag, tag3Count: 0 };
      }
      if (tag3Name) {
        tag2Groups[tag2Name].tag3Count++;
      }
    }

    const splittables: Array<{ tag2: any; tag3Count: number; suggestion: string }> = [];
    for (const [name, group] of Object.entries(tag2Groups)) {
      if (group.tag3Count > 10) {
        splittables.push({
          tag2: group.tag2,
          tag3Count: group.tag3Count,
          suggestion: `建议拆分为多个子模块`,
        });
        console.log(`  发现可拆分: "${name}" (包含 ${group.tag3Count} 个Tag3)`);
      }
    }

    if (splittables.length === 0) {
      console.log('  未发现可拆分标签');
    }

    // 3.3 冷门标签
    console.log('\n3.3 冷门标签（usageCount<5且6个月未使用）...');
    const coldTags = tags.filter((tag: any) => {
      const usageCount = tag.fields?.使用次数 || tag.fields?.usageCount || 0;
      return usageCount < 5;
    });

    if (coldTags.length > 0) {
      console.log(`  发现 ${coldTags.length} 个冷门标签（保留不处理）`);
      coldTags.slice(0, 5).forEach((tag: any) => {
        console.log(`    - ${tag.fields?.['Tag3名称'] || tag.fields?.tag3Name || '未知'} (使用${tag.fields?.使用次数 || 0}次)`);
      });
    } else {
      console.log('  未发现冷门标签');
    }

    // ============================================
    // 步骤2: Top问题生成测试
    // ============================================
    console.log('\n【步骤2】Top问题生成');
    console.log('----------------------------------------');

    // 统计 Tag1+Tag2+Tag3 组合
    const issueGroups: Record<string, {
      tag1: string;
      tag2: string;
      tag3: string;
      count: number;
      totalScore: number;
      largeTenantCount: number;
    }> = {};

    for (const feedback of feedbacks) {
      const tag1 = feedback.fields?.Tag1 || feedback.fields?.tag1 || feedback.fields?.['Tag1(问题性质)'] || '';
      const tag2 = feedback.fields?.Tag2 || feedback.fields?.tag2 || '';
      const tag3 = feedback.fields?.Tag3 || feedback.fields?.tag3 || '';
      const score = Number(feedback.fields?.评分 || feedback.fields?.score || 0);
      const tenantScale = feedback.fields?.租户规模 || '';

      if (!tag1 && !tag2 && !tag3) continue;

      const key = `${tag1}||${tag2}||${tag3}`;
      if (!issueGroups[key]) {
        issueGroups[key] = {
          tag1,
          tag2,
          tag3,
          count: 0,
          totalScore: 0,
          largeTenantCount: 0,
        };
      }

      issueGroups[key].count++;
      issueGroups[key].totalScore += score;
      if (tenantScale === 'A4' || tenantScale === 'A5') {
        issueGroups[key].largeTenantCount++;
      }
    }

    // 计算综合评分
    const QUANTITY_WEIGHT = 0.5;
    const LARGE_TENANT_WEIGHT = 0.3;
    const QUALITY_WEIGHT = 0.2;

    const issues = Object.values(issueGroups).map((issue) => {
      const avgScore = issue.totalScore / issue.count;
      const largeTenantRatio = issue.count > 0 ? issue.largeTenantCount / issue.count : 0;
      const qualityScore = 10 - avgScore; // 评分越低，质量分越高
      const compositeScore =
        issue.count * QUANTITY_WEIGHT +
        largeTenantRatio * LARGE_TENANT_WEIGHT * 100 +
        qualityScore * QUALITY_WEIGHT;

      return {
        tag1: issue.tag1,
        tag2: issue.tag2,
        tag3: issue.tag3,
        totalCount: issue.count,
        avgScore,
        largeTenantRatio,
        compositeScore,
        issueKey: `${issue.tag1}||${issue.tag2}||${issue.tag3}`,
      };
    });

    // 按综合评分排序
    issues.sort((a, b) => b.compositeScore - a.compositeScore);

    console.log(`\n生成 ${issues.length} 个问题组合`);
    console.log('\nTop 10 问题:');
    console.log('| 排名 | Tag1 | Tag2 | Tag3 | 数量 | 大租户占比 | 平均分 | 综合评分 |');
    console.log('|------|------|------|------|------|------------|--------|----------|');

    for (let i = 0; i < Math.min(10, issues.length); i++) {
      const issue = issues[i];
      console.log(
        `| ${i + 1} | ${issue.tag1} | ${issue.tag2} | ${issue.tag3} | ${issue.totalCount} | ${(issue.largeTenantRatio * 100).toFixed(1)}% | ${issue.avgScore.toFixed(1)} | ${issue.compositeScore.toFixed(2)} |`
      );
    }

    // ============================================
    // 步骤3: 写入Top问题表
    // ============================================
    if (BITABLE_TABLE_ID_ANALYSIS) {
      console.log('\n【步骤3】写入Top问题表');
      console.log('----------------------------------------');

      const top30 = issues.slice(0, 30);
      for (const issue of top30) {
        await createRecord(token, BITABLE_TABLE_ID_ANALYSIS, {
          问题标识: issue.issueKey,
          Tag1: issue.tag1,
          Tag2: issue.tag2,
          Tag3: issue.tag3,
          累计数量: issue.totalCount,
          大租户数: issue.largeTenantCount,
          大租户占比: Math.round(issue.largeTenantRatio * 100),
          平均分: Math.round(issue.avgScore * 10) / 10,
          综合评分: Math.round(issue.compositeScore * 100) / 100,
          本月新增: 0,
          状态: '待讨论',
        });
      }

      console.log(`✓ 成功写入 ${top30.length} 条Top问题`);
    }

    console.log('\n========================================');
    console.log('分析测试完成');
    console.log('========================================');
  } catch (error) {
    console.error('\n✗ 测试失败:', error);
  }
}

testAnalysis().catch(console.error);
