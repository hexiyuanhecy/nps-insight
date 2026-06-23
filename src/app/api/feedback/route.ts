/**
 * 反馈管理API
 * GET /api/feedback - 获取反馈列表
 * POST /api/feedback - 创建新反馈
 * PUT /api/feedback - 更新反馈
 * DELETE /api/feedback - 删除反馈
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import {
  Feedback,
  CreateFeedbackRequest,
  UpdateFeedbackRequest,
  PaginatedResponse,
} from '@/lib/types';
import { analyzeFeedback, getCachedTags } from '@/lib/ai/tagger';

// ============================================
// GET - 获取反馈列表
// ============================================

/**
 * GET /api/feedback
 * 查询参数：
 * - page: 页码（默认1）
 * - pageSize: 每页数量（默认20）
 * - status: 状态筛选
 * - priority: 优先级筛选
 * - module: 模块筛选
 * - tenantId: 租户筛选
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const tenantId = searchParams.get('tenantId');

    // 构建过滤条件
    const conditions: Array<{ field: string; operator: string; value: unknown }> = [];
    if (status) conditions.push({ field: FEEDBACK_FIELDS.STATUS, operator: 'is', value: status });
    if (tenantId) conditions.push({ field: FEEDBACK_FIELDS.TENANT_ID, operator: 'is', value: tenantId });

    let filter: string | undefined;
    if (conditions.length > 0) {
      filter = JSON.stringify({
        conjunction: 'and',
        conditions: conditions.map((c) => ({
          field_name: c.field,
          operator: c.operator,
          value: [c.value],
        })),
      });
    }

    // 查询记录
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      filter,
      pageSize: 500, // 先获取所有，再内存分页
    });

    // 转换为Feedback对象
    const feedbacks: Feedback[] = records.map((record) => recordToFeedback(record));

    // 内存分页
    const total = feedbacks.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFeedbacks = feedbacks.slice(start, end);

    const result: PaginatedResponse<Feedback> = {
      list: paginatedFeedbacks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取反馈列表失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// POST - 创建反馈
// ============================================

/**
 * POST /api/feedback
 * 创建新反馈，可选自动AI打标
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateFeedbackRequest & { autoTag?: boolean } = await request.json();
    const { tenantId, userId, userName, content, npsScore, source, autoTag = true } = body;

    // 参数校验
    if (!tenantId || !content || npsScore === undefined) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：tenantId, content, npsScore' },
        { status: 400 }
      );
    }

    // 生成feedbackId
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 准备字段数据
    const now = Date.now();
    const fields: Record<string, unknown> = {
      [FEEDBACK_FIELDS.FEEDBACK_ID]: feedbackId,
      [FEEDBACK_FIELDS.TENANT_ID]: tenantId,
      [FEEDBACK_FIELDS.USER_ID]: userId || '',
      [FEEDBACK_FIELDS.USER_NAME]: userName || '',
      [FEEDBACK_FIELDS.CREATE_TIME]: now,
      [FEEDBACK_FIELDS.CONTENT]: content,
      [FEEDBACK_FIELDS.NPS_SCORE]: npsScore,
      [FEEDBACK_FIELDS.SOURCE]: source || 'manual',
      [FEEDBACK_FIELDS.STATUS]: '待审核',
    };

    // 自动AI打标
    if (autoTag) {
      try {
        console.log(`[API] 对反馈 ${feedbackId} 进行AI打标`);
        // 使用完整参数调用 analyzeFeedback
        const existingTags = await getCachedTags();
        const analysisResult = await analyzeFeedback(
          content,
          '', // unsatisfactoryReason
          source || 'manual',
          existingTags,
          0.8 // confidenceThreshold
        );

        // 更新字段（只写表中存在的字段，字段名严格对应：Tag1/Tag2/Tag3 大写 T）
        fields[FEEDBACK_FIELDS.TAG1] = analysisResult.tag1 || '';
        fields[FEEDBACK_FIELDS.TAG2] = analysisResult.tag2 || '';
        fields[FEEDBACK_FIELDS.TAG3] = analysisResult.tag3 || '';
        fields[FEEDBACK_FIELDS.CONFIDENCE] = analysisResult.confidence ?? 0.8;
        fields[FEEDBACK_FIELDS.TAG_TIME] = now;

        console.log(`[API] 反馈 ${feedbackId} AI打标完成`);
      } catch (aiError) {
        console.error(`[API] 反馈 ${feedbackId} AI打标失败`, aiError);
        // AI打标失败不影响主流程
      }
    }

    // 创建记录
    const record = await bitableClient.createRecord(TABLE_NAMES.FEEDBACK, fields);

    return NextResponse.json({
      success: true,
      data: {
        feedbackId,
        recordId: record.record_id,
        message: '反馈创建成功',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 创建反馈失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// PUT - 更新反馈
// ============================================

/**
 * PUT /api/feedback
 * 更新反馈信息
 */
export async function PUT(request: NextRequest) {
  try {
    const body: { recordId: string } & UpdateFeedbackRequest = await request.json();
    const { recordId, ...updates } = body;

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：recordId' },
        { status: 400 }
      );
    }

    // 构建更新字段
    const fields: Record<string, unknown> = {};
    if (updates.status !== undefined) fields[FEEDBACK_FIELDS.STATUS] = updates.status;
    if (updates.tag1 !== undefined) fields[FEEDBACK_FIELDS.TAG1] = updates.tag1;
    if (updates.tag2 !== undefined) fields[FEEDBACK_FIELDS.TAG2] = updates.tag2;
    if (updates.tag3 !== undefined) fields[FEEDBACK_FIELDS.TAG3] = updates.tag3;
    if (updates.npsScore !== undefined) fields[FEEDBACK_FIELDS.NPS_SCORE] = updates.npsScore;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { success: false, error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    const record = await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, recordId, fields);

    return NextResponse.json({
      success: true,
      data: {
        recordId: record.record_id,
        message: '反馈更新成功',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 更新反馈失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// DELETE - 删除反馈
// ============================================

/**
 * DELETE /api/feedback
 * 删除反馈
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get('recordId');

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：recordId' },
        { status: 400 }
      );
    }

    await bitableClient.deleteRecord(TABLE_NAMES.FEEDBACK, recordId);

    return NextResponse.json({
      success: true,
      data: { message: '反馈删除成功' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 删除反馈失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 将多维表格记录转换为Feedback对象
 */
function recordToFeedback(record: { record_id: string; fields: Record<string, unknown> }): Feedback {
  const f = record.fields;
  return {
    feedbackId: extractFieldValue(f[FEEDBACK_FIELDS.FEEDBACK_ID]),
    tenantId: extractFieldValue(f[FEEDBACK_FIELDS.TENANT_ID]),
    tenantName: extractFieldValue(f[FEEDBACK_FIELDS.TENANT_NAME]),
    tenantScale: extractFieldValue(f[FEEDBACK_FIELDS.TENANT_SCALE]),
    userId: extractFieldValue(f[FEEDBACK_FIELDS.USER_ID]),
    userName: extractFieldValue(f[FEEDBACK_FIELDS.USER_NAME]),
    createTime: String(f[FEEDBACK_FIELDS.CREATE_TIME] || ''),
    // module 字段暂时使用 UNSATISFACTION_REASON 替代（PRD v2 中无 module）
    module: extractFieldValue(f[FEEDBACK_FIELDS.UNSATISFACTION_REASON]),
    content: extractFieldValue(f[FEEDBACK_FIELDS.CONTENT]),
    npsScore: Number(f[FEEDBACK_FIELDS.NPS_SCORE] || 0),
    source: extractFieldValue(f[FEEDBACK_FIELDS.SOURCE]),
    tag1: extractFieldValue(f[FEEDBACK_FIELDS.TAG1]),
    tag2: extractFieldValue(f[FEEDBACK_FIELDS.TAG2]),
    tag3: extractFieldValue(f[FEEDBACK_FIELDS.TAG3]),
    confidence: Number(f[FEEDBACK_FIELDS.CONFIDENCE] || 0),
    tagTime: String(f[FEEDBACK_FIELDS.TAG_TIME] || ''),
    status: extractFieldValue(f[FEEDBACK_FIELDS.STATUS]) as Feedback['status'],
    recordId: record.record_id,
  };
}
