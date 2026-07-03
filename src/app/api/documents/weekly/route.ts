/**
 * 周报文档 API
 * POST /api/documents/weekly - 生成/追加周报
 * GET  /api/documents/weekly - 获取周报列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TOP_ISSUES_FIELDS } from '@/lib/feishu/constants';
import { getDefaultNotification } from '@/lib/adapter-factory';
import { generateWeeklyReport } from '@/lib/documents/weekly-generator';
import { DEFAULT_PAGE_SIZE, DEFAULT_TOP_N } from '@/constants/app-constants';

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
    const records = await bitableClient.listRecords(TABLE_NAMES.TOP_ISSUES, { pageSize: DEFAULT_PAGE_SIZE });

    const weeklyReports = records
      .filter((r) => {
        const name = extractFieldValue(r.fields[TOP_ISSUES_FIELDS.TAG2] || '');
        return name.includes('周报') || name.includes('周');
      })
      .map((r) => ({
        periodName: extractFieldValue(r.fields[TOP_ISSUES_FIELDS.TAG2] || ''),
        totalFeedbacks: Number(r.fields[TOP_ISSUES_FIELDS.TOTAL_COUNT] || 0),
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

    // 注意：Top问题表的统计字段（总反馈数等）由飞书自动计算，不再手动写入
    // 周报/月报数据主要通过文档和通知推送，无需存入Top问题表
    console.log('[API] 周报生成完成，跳过Top问题表写入（统计字段由飞书自动计算）');

    // 发送通知
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    if (chatId) {
      try {
        const notification = getDefaultNotification();
        const message = `📊 **第${result.weekNumber}周周报**\n\n` +
          `• 新增反馈: ${result.totalFeedbacks} 条\n` +
          `• NPS 分数: ${result.npsScore}%\n` +
          `• Top问题: ${result.topIssues.slice(0, Math.min(3, DEFAULT_TOP_N)).map((t) => t.tag3).join(', ') || '无'}\n` +
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
