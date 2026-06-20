/**
 * 分析报告API
 * GET /api/analysis - 获取分析报告列表
 * POST /api/analysis - 生成新的分析报告
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, ANALYSIS_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { PeriodAnalysis, Feedback, PaginatedResponse } from '@/lib/types';
import { chatCompletionJSON } from '@/lib/ai';
import { generatePeriodAnalysisPrompt } from '@/lib/ai/prompts';

// 中文字段名映射
const ANALYSIS_CHINESE_FIELDS = {
  PERIOD_ID: '问题标识',
  PERIOD_NAME: '问题名称',
  START_DATE: '开始日期',
  END_DATE: '结束日期',
  TOTAL_FEEDBACKS: '反馈总数',
  NPS_SCORE: 'NPS分数',
  TOP_ISSUES: 'Top问题',
  CREATED_AT: '创建时间',
};

// ============================================
// GET - 获取分析报告列表
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const records = await bitableClient.listRecords(TABLE_NAMES.ANALYSIS, {
      pageSize: 500,
    });

    const analysisList: PeriodAnalysis[] = records.map((record) => ({
      periodId: extractFieldValue(record.fields[ANALYSIS_FIELDS.PERIOD_ID]),
      periodName: extractFieldValue(record.fields[ANALYSIS_FIELDS.PERIOD_NAME]),
      startDate: String(record.fields[ANALYSIS_FIELDS.START_DATE] || ''),
      endDate: String(record.fields[ANALYSIS_FIELDS.END_DATE] || ''),
      totalFeedbacks: Number(record.fields[ANALYSIS_FIELDS.TOTAL_FEEDBACKS] || 0),
      npsScore: Number(record.fields[ANALYSIS_FIELDS.NPS_SCORE] || 0),
      topIssues: extractFieldValue(record.fields[ANALYSIS_FIELDS.TOP_ISSUES]),
      createdAt: String(record.fields[ANALYSIS_FIELDS.CREATED_AT] || ''),
      recordId: record.record_id,
    }));

    // 按创建时间倒序
    analysisList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 内存分页
    const total = analysisList.length;
    const start = (page - 1) * pageSize;
    const paginatedList = analysisList.slice(start, start + pageSize);

    const result: PaginatedResponse<PeriodAnalysis> = {
      list: paginatedList,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取分析报告失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// POST - 生成分析报告
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: {
      periodName: string;
      startDate: string;
      endDate: string;
    } = await request.json();

    const { periodName, startDate, endDate } = body;

    if (!periodName || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：periodName, startDate, endDate' },
        { status: 400 }
      );
    }

    // 1. 获取该周期内的所有反馈
    const feedbackRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    const feedbacks: Feedback[] = feedbackRecords
      .map((record) => ({
        feedbackId: extractFieldValue(record.fields[FEEDBACK_FIELDS.FEEDBACK_ID]),
        tenantId: extractFieldValue(record.fields[FEEDBACK_FIELDS.TENANT_ID]),
        tenantName: extractFieldValue(record.fields[FEEDBACK_FIELDS.TENANT_NAME]),
        tenantScale: extractFieldValue(record.fields[FEEDBACK_FIELDS.TENANT_SCALE]),
        userId: extractFieldValue(record.fields[FEEDBACK_FIELDS.USER_ID]),
        userName: extractFieldValue(record.fields[FEEDBACK_FIELDS.USER_NAME]),
        createTime: Number(record.fields[FEEDBACK_FIELDS.CREATE_TIME]) || 0,
        module: extractFieldValue(record.fields[FEEDBACK_FIELDS.MODULE]),
        content: extractFieldValue(record.fields[FEEDBACK_FIELDS.CONTENT]),
        npsScore: Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0),
        source: extractFieldValue(record.fields[FEEDBACK_FIELDS.SOURCE]),
        tag1: extractFieldValue(record.fields[FEEDBACK_FIELDS.TAG1]),
        tag2: extractFieldValue(record.fields[FEEDBACK_FIELDS.TAG2]),
        tag3: extractFieldValue(record.fields[FEEDBACK_FIELDS.TAG3]),
        confidence: Number(record.fields[FEEDBACK_FIELDS.CONFIDENCE] || 0),
        status: extractFieldValue(record.fields[FEEDBACK_FIELDS.STATUS]) as Feedback['status'],
        recordId: record.record_id,
      }))
      .filter((f) => {
        const createTime = Number(f.createTime) || new Date(f.createTime as unknown as string).getTime();
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        return createTime >= startTime && createTime <= endTime;
      });

    if (feedbacks.length === 0) {
      return NextResponse.json(
        { success: false, error: '该周期内没有反馈数据' },
        { status: 400 }
      );
    }

    // 2. 计算基础统计数据
    const stats = {
      total: feedbacks.length,
      promoter: feedbacks.filter((f) => f.npsScore >= 9).length,
      passive: feedbacks.filter((f) => f.npsScore >= 7 && f.npsScore <= 8).length,
      detractor: feedbacks.filter((f) => f.npsScore <= 6).length,
    };
    const npsScore = Math.round(((stats.promoter - stats.detractor) / stats.total) * 100);

    // 3. AI生成分析报告
    let topIssues: string[] = [];
    try {
      const messages = generatePeriodAnalysisPrompt(
        periodName,
        feedbacks.map((f) => ({
          content: f.content,
          npsScore: f.npsScore,
          module: f.module,
          tag1: f.tag1,
        }))
      );

      const aiResult = await chatCompletionJSON<{
        topIssues: string[];
        insights: string;
        recommendations: string;
      }>(messages, { temperature: 0.3, maxTokens: 2048 });

      topIssues = aiResult.topIssues || [];
    } catch (aiError) {
      console.error('[API] AI分析失败，使用默认统计', aiError);
      // 使用标签统计作为TOP问题
      const tagCounts: Record<string, number> = {};
      feedbacks.forEach((f) => {
        if (f.tag1) {
          tagCounts[f.tag1] = (tagCounts[f.tag1] || 0) + 1;
        }
      });
      topIssues = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => `${tag} (${count}条)`);
    }

    // 4. 保存分析报告
    const periodId = `pa_${Date.now()}`;
    const record = await bitableClient.createRecord(TABLE_NAMES.ANALYSIS, {
      [ANALYSIS_FIELDS.PERIOD_ID]: periodId,
      [ANALYSIS_FIELDS.PERIOD_NAME]: periodName,
      [ANALYSIS_FIELDS.START_DATE]: new Date(startDate).getTime(),
      [ANALYSIS_FIELDS.END_DATE]: new Date(endDate).getTime(),
      [ANALYSIS_FIELDS.TOTAL_FEEDBACKS]: stats.total,
      [ANALYSIS_FIELDS.NPS_SCORE]: npsScore,
      [ANALYSIS_FIELDS.TOP_ISSUES]: JSON.stringify(topIssues),
      [ANALYSIS_FIELDS.CREATED_AT]: Date.now(),
    });

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        recordId: record.record_id,
        periodName,
        npsScore,
        totalFeedbacks: stats.total,
        topIssues,
        distribution: {
          promoter: stats.promoter,
          passive: stats.passive,
          detractor: stats.detractor,
        },
        message: '分析报告生成成功',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 生成分析报告失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
