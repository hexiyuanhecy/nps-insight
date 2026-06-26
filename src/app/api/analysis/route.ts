/**
 * 分析报告API
 * GET /api/analysis - 获取 Top 问题分析列表
 * POST /api/analysis - 重新生成 Top 问题分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TOP_ISSUES_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';

// ============================================
// GET - 获取 Top 问题列表
// ============================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const records = await bitableClient.listRecords(TABLE_NAMES.TOP_ISSUES, {
      pageSize: 500,
    });

    const issues = records.map((record) => ({
      tag2: extractFieldValue(record.fields[TOP_ISSUES_FIELDS.TAG2]),
      totalCount: Number(record.fields[TOP_ISSUES_FIELDS.TOTAL_COUNT] || 0),
      a4Count: Number(record.fields[TOP_ISSUES_FIELDS.A4_COUNT] || 0),
      a5Count: Number(record.fields[TOP_ISSUES_FIELDS.A5_COUNT] || 0),
      a6Count: Number(record.fields[TOP_ISSUES_FIELDS.A6_COUNT] || 0),
      largeTenantCount: Number(record.fields[TOP_ISSUES_FIELDS.LARGE_TENANT_COUNT] || 0),
      largeTenantRatio: Number(record.fields[TOP_ISSUES_FIELDS.LARGE_TENANT_RATIO] || 0),
      manualPriority: Number(record.fields[TOP_ISSUES_FIELDS.MANUAL_PRIORITY] || 0),
      owner: extractFieldValue(record.fields[TOP_ISSUES_FIELDS.OWNER]),
      resolution: extractFieldValue(record.fields[TOP_ISSUES_FIELDS.RESOLUTION]),
      status: extractFieldValue(record.fields[TOP_ISSUES_FIELDS.STATUS]),
      iterationPeriod: extractFieldValue(record.fields[TOP_ISSUES_FIELDS.ITERATION_PERIOD]),
      recordId: record.record_id,
    }));

    // 按 largeTenantCount 降序
    issues.sort((a, b) => b.largeTenantCount - a.largeTenantCount);

    // 内存分页
    const total = issues.length;
    const start = (page - 1) * pageSize;
    const paginatedIssues = issues.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      data: {
        list: paginatedIssues,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取分析报告失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ============================================
// POST - 重新生成 Top 问题分析
// ============================================

export async function POST(request: NextRequest) {
  try {
    const generator = new TopIssuesGenerator();
    const issues = await generator.generate();
    await generator.writeToTable(issues);

    return NextResponse.json({
      success: true,
      data: {
        count: issues.length,
        message: 'Top 问题分析生成成功',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 生成分析报告失败', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
