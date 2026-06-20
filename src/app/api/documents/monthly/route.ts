/**
 * 月报文档 API
 * POST /api/documents/monthly - 生成/追加月报
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { getDefaultDocument, getDefaultNotification, getDefaultStorage } from '@/lib/adapter-factory';
import { TagEvolution } from '@/lib/ai/tag-evolution';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';
import { FormulaSync } from '@/lib/analysis/formula-sync';

/**
 * 生成月报
 * @param year 年份
 * @param month 月份（1-12）
 */
async function generateMonthlyReport(year?: number, month?: number): Promise<{
  success: boolean;
  year: number;
  month: number;
  periodName: string;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  promoter: number;
  passive: number;
  detractor: number;
  evolutionReport?: any;
  topIssues: { tag1: string; tag2: string; tag3: string; count: number }[];
  documentUrl?: string;
  error?: string;
}> {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  // 计算月度的起始和结束日期
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const periodName = `${targetYear}年${targetMonth}月`;

  try {
    // 获取该月的所有反馈
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 500 });

    const monthFeedbacks = records.filter((r) => {
      const createTime = extractFieldValue(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!createTime) return false;
      const time = new Date(createTime);
      return time >= startDate && time <= endDate;
    });

    const totalFeedbacks = monthFeedbacks.length;

    // 计算NPS
    let promoter = 0, passive = 0, detractor = 0;
    monthFeedbacks.forEach((f) => {
      const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score >= 4) promoter++;
      else if (score === 3) passive++;
      else detractor++;
    });

    const npsScore = totalFeedbacks > 0
      ? Math.round(((promoter - detractor) / totalFeedbacks) * 100)
      : 0;

    // 1. 标签自进化
    let evolutionReport = null;
    try {
      const storage = getDefaultStorage();
      const tagEvolution = new TagEvolution(storage);
      evolutionReport = await tagEvolution.execute();
    } catch (evolutionError) {
      console.error('[月报] 标签自进化失败', evolutionError);
    }

    // 2. Top问题生成
    let topIssues: { tag1: string; tag2: string; tag3: string; count: number }[] = [];
    try {
      const storage = getDefaultStorage();
      const formulaSync = new FormulaSync(storage);
      const weights = await formulaSync.getWeights();

      const topIssuesGenerator = new TopIssuesGenerator(storage);
      topIssuesGenerator.setWeights(weights);
      const issues = await topIssuesGenerator.generate();

      topIssues = issues.slice(0, 20).map((issue) => ({
        tag1: issue.tag1,
        tag2: issue.tag2,
        tag3: issue.tag3,
        count: issue.count,
      }));
    } catch (topError) {
      console.error('[月报] Top问题生成失败', topError);

      // 使用简单统计
      const tagCounts: Record<string, number> = {};
      monthFeedbacks.forEach((f) => {
        const tag1 = extractFieldValue(f.fields[FEEDBACK_FIELDS.TAG1]);
        if (tag1) {
          tagCounts[tag1] = (tagCounts[tag1] || 0) + 1;
        }
      });

      topIssues = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag1, count]) => ({ tag1, tag2: '', tag3: '', count }));
    }

    // 生成文档
    let documentUrl: string | undefined;
    try {
      const document = getDefaultDocument();
      const docContent = generateMonthlyDocContent({
        periodName,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalFeedbacks,
        npsScore,
        promoter,
        passive,
        detractor,
        evolutionReport,
        topIssues,
      });

      const doc = await document.create(`${periodName}月度分析报告`, docContent);
      documentUrl = doc.url;
    } catch (docError) {
      console.error('[月报] 生成文档失败', docError);
    }

    return {
      success: true,
      year: targetYear,
      month: targetMonth,
      periodName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalFeedbacks,
      npsScore,
      promoter,
      passive,
      detractor,
      evolutionReport,
      topIssues,
      documentUrl,
    };
  } catch (error) {
    return {
      success: false,
      year: targetYear,
      month: targetMonth,
      periodName,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalFeedbacks: 0,
      npsScore: 0,
      promoter: 0,
      passive: 0,
      detractor: 0,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 生成月报文档内容
 */
function generateMonthlyDocContent(data: {
  periodName: string;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  promoter: number;
  passive: number;
  detractor: number;
  evolutionReport?: any;
  topIssues: { tag1: string; tag2: string; tag3: string; count: number }[];
}): string {
  const startDateStr = new Date(data.startDate).toLocaleDateString('zh-CN');
  const endDateStr = new Date(data.endDate).toLocaleDateString('zh-CN');

  let content = `# ${data.periodName}月度分析报告\n\n`;
  content += `**周期**: ${startDateStr} - ${endDateStr}\n\n`;

  content += `## 📊 周期概览\n\n`;
  content += `- 新增反馈: ${data.totalFeedbacks} 条\n`;
  content += `- NPS 分数: ${data.npsScore}%\n`;
  content += `- 推荐者: ${data.promoter} 人\n`;
  content += `- 被动者: ${data.passive} 人\n`;
  content += `- 贬损者: ${data.detractor} 人\n\n`;

  // 标签自进化报告
  if (data.evolutionReport) {
    content += `## 🔄 标签自进化报告\n\n`;

    if (data.evolutionReport.duplicates && data.evolutionReport.duplicates.length > 0) {
      content += `### 重复标签（建议合并）\n\n`;
      data.evolutionReport.duplicates.forEach((d: any) => {
        content += `- ${d.tag1 || ''} / ${d.tag2 || ''} / ${d.tag3 || ''}\n`;
        content += `  相似标签: ${d.similarTags?.map((t: any) => t.name).join(', ')}\n`;
      });
      content += '\n';
    }

    if (data.evolutionReport.splittable && data.evolutionReport.splittable.length > 0) {
      content += `### 可拆分标签\n\n`;
      data.evolutionReport.splittable.forEach((s: any) => {
        content += `- ${s.tag1 || ''} / ${s.tag2 || ''}: ${s.tag3Count} 个子标签\n`;
      });
      content += '\n';
    }

    if (data.evolutionReport.rare && data.evolutionReport.rare.length > 0) {
      content += `### 冷门标签（保留）\n\n`;
      data.evolutionReport.rare.forEach((r: any) => {
        content += `- ${r.tag1 || ''} / ${r.tag2 || ''} / ${r.tag3 || ''}: ${r.usageCount} 次使用\n`;
      });
      content += '\n';
    }

    if (
      (!data.evolutionReport.duplicates || data.evolutionReport.duplicates.length === 0) &&
      (!data.evolutionReport.splittable || data.evolutionReport.splittable.length === 0) &&
      (!data.evolutionReport.rare || data.evolutionReport.rare.length === 0)
    ) {
      content += `未检测到需要进化的标签。\n\n`;
    }
  }

  // Top问题
  if (data.topIssues.length > 0) {
    content += `## 🔥 Top 20 问题\n\n`;
    content += `| 排名 | Tag1 | Tag2 | Tag3 | 数量 |\n`;
    content += `|------|------|------|------|------|\n`;

    data.topIssues.forEach((item, index) => {
      content += `| ${index + 1} | ${item.tag1 || '-'} | ${item.tag2 || '-'} | ${item.tag3 || '-'} | ${item.count} |\n`;
    });
    content += '\n';
  }

  // 典型反馈
  content += `## 💬 关注点\n\n`;
  content += `建议在会议中重点讨论以下问题：\n\n`;
  if (data.topIssues.length > 0) {
    content += `1. ${data.topIssues[0]?.tag1 || ''}${data.topIssues[0]?.tag2 ? ' - ' + data.topIssues[0].tag2 : ''}: 共 ${data.topIssues[0]?.count || 0} 条反馈\n`;
  }
  if (data.topIssues.length > 1) {
    content += `2. ${data.topIssues[1]?.tag1 || ''}${data.topIssues[1]?.tag2 ? ' - ' + data.topIssues[1].tag2 : ''}: 共 ${data.topIssues[1]?.count || 0} 条反馈\n`;
  }
  content += '\n';

  // 议程建议
  content += `## 📋 会议议程建议\n\n`;
  content += `1. 上月数据回顾（NPS ${data.npsScore}%）\n`;
  content += `2. Top问题讨论\n`;
  content += `3. 标签优化决策\n`;
  content += `4. 下月行动计划\n\n`;

  content += `---\n\n`;
  content += `*由 NPS Insight 自动生成于 ${new Date().toLocaleString('zh-CN')}*\n`;

  return content;
}

// ============================================
// API 路由
// ============================================

/**
 * GET /api/documents/monthly - 获取月报列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const generate = searchParams.get('generate');

    if (generate === 'true') {
      const year = parseInt(searchParams.get('year') || '0', 10) || undefined;
      const month = parseInt(searchParams.get('month') || '0', 10) || undefined;
      const result = await generateMonthlyReport(year, month);
      return NextResponse.json({ success: result.success, data: result });
    }

    // 返回月报列表
    const records = await bitableClient.listRecords(TABLE_NAMES.ANALYSIS, { pageSize: 500 });

    const monthlyReports = records
      .filter((r) => {
        const name = extractFieldValue(r.fields['问题名称'] || r.fields['periodName'] || '');
        return name.includes('月') && !name.includes('周');
      })
      .map((r) => ({
        periodId: extractFieldValue(r.fields['问题标识'] || r.fields['periodId'] || ''),
        periodName: extractFieldValue(r.fields['问题名称'] || r.fields['periodName'] || ''),
        totalFeedbacks: Number(r.fields['反馈总数'] || r.fields['totalFeedbacks'] || 0),
        npsScore: Number(r.fields['NPS分数'] || r.fields['npsScore'] || 0),
        createdAt: extractFieldValue(r.fields['创建时间'] || r.fields['createdAt'] || ''),
        recordId: r.record_id,
      }));

    return NextResponse.json({ success: true, data: monthlyReports });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取月报失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

/**
 * POST /api/documents/monthly - 生成新月报
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const year = body.year;
    const month = body.month;

    const result = await generateMonthlyReport(year, month);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    // 保存到分析表
    try {
      await bitableClient.createRecord(TABLE_NAMES.ANALYSIS, {
        ['问题标识']: `monthly_${result.year}_${String(result.month).padStart(2, '0')}`,
        ['问题名称']: result.periodName,
        ['开始日期']: new Date(result.startDate).getTime(),
        ['结束日期']: new Date(result.endDate).getTime(),
        ['反馈总数']: result.totalFeedbacks,
        ['NPS分数']: result.npsScore,
        ['Top问题']: JSON.stringify(result.topIssues),
        ['创建时间']: Date.now(),
      });
    } catch (saveError) {
      console.error('[API] 保存月报记录失败', saveError);
    }

    // 发送通知
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    if (chatId) {
      try {
        const notification = getDefaultNotification();
        const message = `📊 **${result.periodName}月度分析报告**\n\n` +
          `• 新增反馈: ${result.totalFeedbacks} 条\n` +
          `• NPS 分数: ${result.npsScore}%\n` +
          `• 推荐者: ${result.promoter} / 被动者: ${result.passive} / 贬损者: ${result.detractor}\n` +
          `• Top问题: ${result.topIssues.slice(0, 3).map((t) => `${t.tag1 || ''}${t.tag2 ? '-' + t.tag2 : ''}`).join(', ') || '无'}\n` +
          (result.documentUrl ? `\n📄 [查看会议文档](${result.documentUrl})` : '');

        await notification.send(chatId, message);
      } catch (notifyError) {
        console.error('[API] 发送月报通知失败', notifyError);
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 生成月报失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
