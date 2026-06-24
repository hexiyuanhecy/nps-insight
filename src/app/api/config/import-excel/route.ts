/**
 * Excel 导入 API
 * POST /api/config/import-excel
 * 接收 Excel 文件，解析数据并写入多维表格
 */

import { NextRequest, NextResponse } from 'next/server';
import { ExcelAdapter } from '@/lib/data-sources/excel-adapter';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import type { FeedbackRecord } from '@/lib/data-sources/base-adapter';

export async function POST(request: NextRequest) {
  try {
    // 1. 检查环境配置
    const appToken = process.env.BITABLE_TOKEN;
    const feedbackTableId =
      process.env.BITABLE_FEEDBACK_TABLE_ID ||
      process.env.BITABLE_TABLE_ID;

    if (!appToken || !feedbackTableId) {
      return NextResponse.json(
        { success: false, error: '多维表格未配置，请先绑定表格' },
        { status: 400 }
      );
    }

    // 2. 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: '请上传 Excel 文件' },
        { status: 400 }
      );
    }

    // 3. 检查文件类型
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];
    const fileName = file.name.toLowerCase();
    const isValidExtension =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      fileName.endsWith('.csv');

    if (!validTypes.includes(file.type) && !isValidExtension) {
      return NextResponse.json(
        { success: false, error: '文件格式不支持，请上传 .xlsx、.xls 或 .csv 文件' },
        { status: 400 }
      );
    }

    // 4. 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 5. 使用 ExcelAdapter 解析数据
    const adapter = new ExcelAdapter({
      type: 'excel',
      fileBuffer: buffer,
    });

    const feedbacks = await adapter.fetchData();

    if (feedbacks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, written: 0, skipped: 0 },
        message: 'Excel 文件为空或无有效数据',
      });
    }

    // 6. 查询已存在的反馈 ID（用于去重）
    // 使用分页查询获取所有记录
    const allExistingRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    // 如果记录数超过 500，继续查询（listRecords 内部会自动分页）
    const existingIds = new Set(
      allExistingRecords.map((r) => {
        const id = r.fields[FEEDBACK_FIELDS.FEEDBACK_ID];
        // 飞书 Text 字段返回 [{text: "...", type: "text"}] 格式
        if (Array.isArray(id) && id.length > 0 && typeof id[0] === 'object' && 'text' in id[0]) {
          return (id[0] as { text: string }).text;
        }
        return String(id || '');
      })
    );

    // 7. 过滤重复数据
    const newFeedbacks = feedbacks.filter(
      (f) => !existingIds.has(f.feedbackId)
    );

    const skipped = feedbacks.length - newFeedbacks.length;

    if (newFeedbacks.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: feedbacks.length, written: 0, skipped },
        message: `共 ${feedbacks.length} 条数据，全部已存在，跳过导入`,
      });
    }

    // 8. 转换为多维表格字段格式
    // 注意：飞书多维表格不接受空字符串，可选字段只在有值时才设置
    const records = newFeedbacks.map((f: FeedbackRecord) => {
      const fields: Record<string, unknown> = {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: f.feedbackId,
        [FEEDBACK_FIELDS.CONTENT]: f.content,
        [FEEDBACK_FIELDS.NPS_SCORE]: f.score,
        [FEEDBACK_FIELDS.CREATE_TIME]: new Date(f.createTime).getTime(),
        [FEEDBACK_FIELDS.SOURCE]: f.source || 'excel_import',
        [FEEDBACK_FIELDS.STATUS]: '未打标',
      };

      // 可选字段：只在有值时才设置
      if (f.tenantId) fields[FEEDBACK_FIELDS.TENANT_ID] = f.tenantId;
      if (f.tenantName) fields[FEEDBACK_FIELDS.TENANT_NAME] = f.tenantName;
      if (f.tenantScale) fields[FEEDBACK_FIELDS.TENANT_SCALE] = f.tenantScale;
      if (f.larkUserId) fields[FEEDBACK_FIELDS.USER_ID] = f.larkUserId;
      if (f.dissatisfactionReason) fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] = f.dissatisfactionReason;
      if (f.module) fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] = f.module; // module 映射到不满意原因字段

      return { fields };
    });

    // 9. 批量写入多维表格
    const createdRecords = await bitableClient.batchCreateRecords(
      TABLE_NAMES.FEEDBACK,
      records
    );

    // 10. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        total: feedbacks.length,
        written: createdRecords.length,
        skipped,
      },
      message: `导入完成：共 ${feedbacks.length} 条，写入 ${createdRecords.length} 条，跳过 ${skipped} 条重复数据`,
    });
  } catch (error) {
    console.error('[Excel Import] 导入失败:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
