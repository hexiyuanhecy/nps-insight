/**
 * 租户管理 API
 * GET /api/tenants - 获取租户列表
 * POST /api/tenants - 创建新租户
 * PUT /api/tenants - 更新租户
 * DELETE /api/tenants - 删除租户
 */

import { NextRequest, NextResponse } from 'next/server';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TENANT_FIELDS } from '@/lib/feishu/constants';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const records = await bitableClient.listRecords(TABLE_NAMES.TENANTS, { pageSize: 500 });
    const tenants = records.map((r) => ({
      tenantId: String(r.fields[TENANT_FIELDS.TENANT_ID] || ''),
      tenantName: String(r.fields[TENANT_FIELDS.TENANT_NAME] || ''),
      scale: String(r.fields[TENANT_FIELDS.SCALE] || ''),
      contact: String(r.fields[TENANT_FIELDS.CONTACT] || ''),
      contactEmail: String(r.fields[TENANT_FIELDS.CONTACT_EMAIL] || ''),
      logPlatform: String(r.fields[TENANT_FIELDS.LOG_PLATFORM] || ''),
      logEndpoint: String(r.fields[TENANT_FIELDS.LOG_ENDPOINT] || ''),
      logCredentials: String(r.fields[TENANT_FIELDS.LOG_CREDENTIALS] || ''),
      createdAt: String(r.fields[TENANT_FIELDS.CREATED_AT] || ''),
      recordId: r.record_id,
    }));

    const total = tenants.length;
    const start = (page - 1) * pageSize;
    const paginated = tenants.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      data: {
        list: paginated,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 获取租户列表失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, tenantName, scale = 'A3', contact, contactEmail, logPlatform, logEndpoint, logCredentials } = body;

    if (!tenantId || !tenantName) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：tenantId, tenantName' },
        { status: 400 }
      );
    }

    const record = await bitableClient.createRecord(TABLE_NAMES.TENANTS, {
      [TENANT_FIELDS.TENANT_ID]: tenantId,
      [TENANT_FIELDS.TENANT_NAME]: tenantName,
      [TENANT_FIELDS.SCALE]: scale,
      [TENANT_FIELDS.CONTACT]: contact || '',
      [TENANT_FIELDS.CONTACT_EMAIL]: contactEmail || '',
      [TENANT_FIELDS.LOG_PLATFORM]: logPlatform || '',
      [TENANT_FIELDS.LOG_ENDPOINT]: logEndpoint || '',
      [TENANT_FIELDS.LOG_CREDENTIALS]: logCredentials || '',
      [TENANT_FIELDS.CREATED_AT]: Date.now(),
    });

    return NextResponse.json({
      success: true,
      data: {
        tenantId,
        recordId: record.record_id,
        message: '租户创建成功',
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 创建租户失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { recordId, tenantName, scale, contact, contactEmail, logPlatform, logEndpoint, logCredentials } = body;

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：recordId' },
        { status: 400 }
      );
    }

    const fields: Record<string, unknown> = {};
    if (tenantName !== undefined) fields[TENANT_FIELDS.TENANT_NAME] = tenantName;
    if (scale !== undefined) fields[TENANT_FIELDS.SCALE] = scale;
    if (contact !== undefined) fields[TENANT_FIELDS.CONTACT] = contact;
    if (contactEmail !== undefined) fields[TENANT_FIELDS.CONTACT_EMAIL] = contactEmail;
    if (logPlatform !== undefined) fields[TENANT_FIELDS.LOG_PLATFORM] = logPlatform;
    if (logEndpoint !== undefined) fields[TENANT_FIELDS.LOG_ENDPOINT] = logEndpoint;
    if (logCredentials !== undefined) fields[TENANT_FIELDS.LOG_CREDENTIALS] = logCredentials;

    const record = await bitableClient.updateRecord(TABLE_NAMES.TENANTS, recordId, fields);

    return NextResponse.json({
      success: true,
      data: { recordId: record.record_id, message: '租户更新成功' },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 更新租户失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}

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

    await bitableClient.deleteRecord(TABLE_NAMES.TENANTS, recordId);
    return NextResponse.json({ success: true, data: { message: '租户删除成功' } });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 删除租户失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
