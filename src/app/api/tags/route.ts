/**
 * 标签管理 API
 * GET /api/tags - 获取标签列表（支持 level 参数：tag1/tag2/tag3）
 * POST /api/tags - 创建标签（支持 level 参数）
 * PUT /api/tags - 更新标签（支持 level 参数）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  findOrCreateTag,
  getAllTag1,
  getAllTag2,
  getAllTag3,
  getAllTags,
} from '@/lib/ai/tagger';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';
import { PaginatedResponse, Tag, Tag1, Tag2, Tag3, TagStatus } from '@/lib/types';

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

    if (level === 'tag1') {
      const tags = await getAllTag1();
      return NextResponse.json({ success: true, data: paginate<Tag1>(tags, page, pageSize) });
    }
    if (level === 'tag2') {
      const tags = await getAllTag2();
      return NextResponse.json({ success: true, data: paginate<Tag2>(tags, page, pageSize) });
    }
    if (level === 'tag3') {
      const tags = await getAllTag3();
      return NextResponse.json({ success: true, data: paginate<Tag3>(tags, page, pageSize) });
    }

    const tags = await getAllTags();
    return NextResponse.json({ success: true, data: paginate<Tag>(tags, page, pageSize) });
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

    if (tag1Name && tag2Name && tag3Name) {
      const recordId = await findOrCreateTag(tag1Name, tag2Name, tag3Name, createdBy);
      return NextResponse.json({
        success: true,
        data: { recordId, message: '标签创建成功' },
      });
    }

    if (!level || !name) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：level + name，或 tag1Name/tag2Name/tag3Name' },
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

    const record = await bitableClient.createRecord(table, {
      [fields.TAG_ID]: tagId,
      [fields.NAME]: name,
      [fields.DEFINITION]: definition || '',
      [fields.USAGE_COUNT]: 0,
      [fields.LARGE_TENANT_COUNT]: 0,
      [fields.LARGE_TENANT_RATIO]: 0,
      [fields.STATUS]: TagStatus.ACTIVE,
      [fields.CREATED_BY]: createdBy,
      [fields.CREATED_AT]: Date.now(),
    });

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
    const { level, recordId, name, definition, status } = body as {
      level?: TagLevel;
      recordId?: string;
      name?: string;
      definition?: string;
      status?: TagStatus;
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
    if (name !== undefined) updateFields[fields.NAME] = name;
    if (definition !== undefined) updateFields[fields.DEFINITION] = definition;
    if (status !== undefined) updateFields[fields.STATUS] = status;

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
