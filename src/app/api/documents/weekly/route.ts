/**
 * 周报文档 API
 * POST /api/documents/weekly - 生成/追加周报
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TOP_ISSUES_FIELDS } from '@/lib/feishu/constants';
import { getDefaultDocument, getDefaultNotification } from '@/lib/adapter-factory';
import { DocumentAdapter } from '@/lib/document/base-document';

/**
 * 生成周报
 * @param weekOffset 周偏移量（0=本周，1=上周）
 */
async function generateWeeklyReport(weekOffset: number = 0): Promise<{
  success: boolean;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  topIssues: { tag1: string; count: number }[];
  documentUrl?: string;
  error?: string;
}> {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const year = now.getFullYear();

  // 计算指定周的起始日期
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - (7 * weekOffset + now.getDay() + 6));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startDate = weekStart.toISOString();
  const endDate = weekEnd.toISOString();

  try {
    // 获取该周的所有反馈
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 500 });

    const weekFeedbacks = records.filter((r) => {
      const createTime = extractFieldValue(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!createTime) return false;
      const time = new Date(createTime);
      return time >= weekStart && time <= weekEnd;
    });

    const totalFeedbacks = weekFeedbacks.length;

    // 计算NPS
    let promoter = 0, passive = 0, detractor = 0;
    weekFeedbacks.forEach((f) => {
      const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score >= 4) promoter++;
      else if (score === 3) passive++;
      else detractor++;
    });

    const npsScore = totalFeedbacks > 0
      ? Math.round(((promoter - detractor) / totalFeedbacks) * 100)
      : 0;

    // 统计Top问题
    const tagCounts: Record<string, number> = {};
    weekFeedbacks.forEach((f) => {
      const tag1 = extractFieldValue(f.fields[FEEDBACK_FIELDS.TAG1]);
      if (tag1) {
        tagCounts[tag1] = (tagCounts[tag1] || 0) + 1;
      }
    });

    const topIssues = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag1, count]) => ({ tag1, count }));

    // 生成文档
    const document = getDefaultDocument();
    const weekTitle = `第${currentWeek}周周报`;
    const docContent = generateWeeklyDocContent({
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks,
      npsScore,
      promoter,
      passive,
      detractor,
      topIssues,
    });

    let documentUrl: string | undefined;
    try {
      const doc = await document.create(weekTitle, docContent);
      documentUrl = doc.url;
    } catch (docError) {
      console.error('[周报] 生成文档失败', docError);
    }

    return {
      success: true,
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks,
      npsScore,
      topIssues,
      documentUrl,
    };
  } catch (error) {
    return {
      success: false,
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks: 0,
      npsScore: 0,
      topIssues: [],
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 生成周报文档内容
 */
function generateWeeklyDocContent(data: {
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  promoter: number;
  passive: number;
  detractor: number;
  topIssues: { tag1: string; count: number }[];
}): string {
  const startDateStr = new Date(data.startDate).toLocaleDateString('zh-CN');
  const endDateStr = new Date(data.endDate).toLocaleDateString('zh-CN');

  let content = `# 第${data.weekNumber}周周报\n\n`;
  content += `**周期**: ${startDateStr} - ${endDateStr}\n\n`;

  content += `## 📊 数据概览\n\n`;
  content += `- 新增反馈: ${data.totalFeedbacks} 条\n`;
  content += `- NPS 分数: ${data.npsScore}%\n`;
  content += `- 推荐者: ${data.promoter} 人\n`;
  content += `- 被动者: ${data.passive} 人\n`;
  content += `- 贬损者: ${data.detractor} 人\n\n`;

  if (data.topIssues.length > 0) {
    content += `## 🔥 Top 问题\n\n`;
    data.topIssues.forEach((item, index) => {
      content += `${index + 1}. **${item.tag1}**: ${item.count} 条反馈\n`;
    });
    content += '\n';
  }

  content += `---\n\n`;
  content += `*由 NPS Insight 自动生成于 ${new Date().toLocaleString('zh-CN')}*\n`;

  return content;
}

/**
 * 获取ISO周数
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ============================================
// API 路由
// ============================================

/**
 * GET /api/documents/weekly - 获取周报列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const generate = searchParams.get('generate');

    if (generate === 'true') {
      const weekOffset = parseInt(searchParams.get('weekOffset') || '0', 10);
      const result = await generateWeeklyReport(weekOffset);
      return NextResponse.json({ success: result.success, data: result });
    }

    // 返回周报列表（从分析表筛选）
    const records = await bitableClient.listRecords(TABLE_NAMES.TOP_ISSUES, { pageSize: 500 });

    const weeklyReports = records
      .filter((r) => {
        const name = extractFieldValue(r.fields[TOP_ISSUES_FIELDS.TAG2_NAME] || '');
        return name.includes('周报') || name.includes('周');
      })
      .map((r) => ({
        periodId: extractFieldValue(r.fields[TOP_ISSUES_FIELDS.ISSUE_KEY] || ''),
        periodName: extractFieldValue(r.fields[TOP_ISSUES_FIELDS.TAG2_NAME] || ''),
        totalFeedbacks: Number(r.fields[TOP_ISSUES_FIELDS.TOTAL_COUNT] || 0),
        npsScore: Number(r.fields[TOP_ISSUES_FIELDS.AVG_SCORE] || 0),
        recordId: r.record_id,
      }));

    return NextResponse.json({ success: true, data: weeklyReports });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取周报失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

/**
 * POST /api/documents/weekly - 生成新周报
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const weekOffset = body.weekOffset || 0;

    const result = await generateWeeklyReport(weekOffset);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    // 保存到分析表
    try {
      await bitableClient.createRecord(TABLE_NAMES.TOP_ISSUES, {
        [TOP_ISSUES_FIELDS.TAG2_NAME]: `第${result.weekNumber}周周报`,
        [TOP_ISSUES_FIELDS.TAG3_NAMES]: ['周报'],
        [TOP_ISSUES_FIELDS.TOTAL_COUNT]: result.totalFeedbacks,
        [TOP_ISSUES_FIELDS.PERIOD_NEW_COUNT]: result.totalFeedbacks,
        [TOP_ISSUES_FIELDS.AVG_SCORE]: result.npsScore,
      });
    } catch (saveError) {
      console.error('[API] 保存周报记录失败', saveError);
    }

    // 发送通知
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    if (chatId) {
      try {
        const notification = getDefaultNotification();
        const message = `📊 **第${result.weekNumber}周周报**\n\n` +
          `• 新增反馈: ${result.totalFeedbacks} 条\n` +
          `• NPS 分数: ${result.npsScore}%\n` +
          `• Top问题: ${result.topIssues.slice(0, 3).map((t) => t.tag1).join(', ') || '无'}\n` +
          (result.documentUrl ? `\n📄 [查看文档](${result.documentUrl})` : '');

        await notification.sendText(chatId, message);
      } catch (notifyError) {
        console.error('[API] 发送周报通知失败', notifyError);
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 生成周报失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
