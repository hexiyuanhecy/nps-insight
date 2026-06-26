/**
 * 标签管理 API
 * GET /api/tags - 获取标签列表（支持 level 参数：tag1/tag2/tag3）
 * POST /api/tags - 创建标签（支持 level 参数）
 * PUT /api/tags - 更新标签（支持 level 参数）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTags,
  getCachedTags,
} from '@/lib/ai/tagger';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';
import { PaginatedResponse, Tag } from '@/lib/types';
import { TABLES } from '@/lib/storage/base-storage';

type TagLevel = 'tag1' | 'tag2' | 'tag3';

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResponse<T> {
  const total = items.length;
  const start = (page - 1) * pageSize;
  const list = items.slice(start, start + pageSize);
  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
    const level = searchParams.get('level') as TagLevel | null;

    const allTags = await getAllTags();

    if (level === 'tag1') {
      const tags = allTags.filter(t => t.tag1Name && !t.tag2Name && !t.tag3Name);
      return NextResponse.json({ success: true, data: paginate<Tag>(tags as Tag[], page, pageSize) });
    }
    if (level === 'tag2') {
      const tags = allTags.filter(t => t.tag2Name && !t.tag3Name);
      return NextResponse.json({ success: true, data: paginate<Tag>(tags as Tag[], page, pageSize) });
    }
    if (level === 'tag3') {
      const tags = allTags.filter(t => t.tag3Name);
      return NextResponse.json({ success: true, data: paginate<Tag>(tags as Tag[], page, pageSize) });
    }

    return NextResponse.json({ success: true, data: paginate<Tag>(allTags as Tag[], page, pageSize) });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取标签列表失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      level,
      name,
      definition,
      tag1Name,
      tag2Name,
      tag3Name,
      createdBy = 'api',
    } = body as {
      level?: TagLevel;
      name?: string;
      definition?: string;
      tag1Name?: string;
      tag2Name?: string;
      tag3Name?: string;
      createdBy?: string;
    };

    if (!level || !name) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：level + name' },
        { status: 400 },
      );
    }

    const tableMap = {
      tag1: { table: TABLE_NAMES.TAG1, fields: TAG1_FIELDS },
      tag2: { table: TABLE_NAMES.TAG2, fields: TAG2_FIELDS },
      tag3: { table: TABLE_NAMES.TAG3, fields: TAG3_FIELDS },
    } as const;
    const { table, fields } = tableMap[level];
    const tagId = `${level}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const createFields: Record<string, unknown> = {
      [fields.TAG_ID]: tagId,
      [fields.TAG_NAME]: name,
    };

    if (level === 'tag1') {
      createFields[(fields as typeof TAG1_FIELDS).DESC] = definition || '';
    }

    const record = await bitableClient.createRecord(table, createFields);

    return NextResponse.json({
      success: true,
      data: { recordId: record.record_id, tagId, message: '标签创建成功' },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 创建标签失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { level, recordId, name, definition } = body as {
      level?: TagLevel;
      recordId?: string;
      name?: string;
      definition?: string;
    };

    if (!level || !recordId) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：level, recordId' },
        { status: 400 },
      );
    }

    const tableMap = {
      tag1: { table: TABLE_NAMES.TAG1, fields: TAG1_FIELDS },
      tag2: { table: TABLE_NAMES.TAG2, fields: TAG2_FIELDS },
      tag3: { table: TABLE_NAMES.TAG3, fields: TAG3_FIELDS },
    } as const;
    const { table, fields } = tableMap[level];

    const updateFields: Record<string, unknown> = {};
    if (name !== undefined) updateFields[fields.TAG_NAME] = name;
    if (level === 'tag1') {
      if (definition !== undefined) updateFields[(fields as typeof TAG1_FIELDS).DESC] = definition;
    }

    const record = await bitableClient.updateRecord(table, recordId, updateFields);
    return NextResponse.json({
      success: true,
      data: { recordId: record.record_id, message: '标签更新成功' },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 更新标签失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
