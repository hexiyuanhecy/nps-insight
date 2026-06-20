/**
 * Webhook 接收端点
 * POST /api/webhook/feelgood
 * 接收 Feelgood 推送的反馈数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { WebhookAdapter } from '@/lib/data-sources/webhook-adapter';

/**
 * POST /api/webhook/feelgood
 * 接收 Webhook 推送数据
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    console.log('[Webhook] 收到推送数据:', JSON.stringify(payload).substring(0, 200));

    // 处理 Webhook 数据
    const feedback = WebhookAdapter.handleWebhookPayload(payload);

    if (!feedback) {
      return NextResponse.json(
        { success: false, error: '数据格式不正确' },
        { status: 400 }
      );
    }

    console.log(`[Webhook] 已缓存反馈: ${feedback.feedbackId}`);

    return NextResponse.json({
      success: true,
      message: '数据已接收',
      feedbackId: feedback.feedbackId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Webhook] 处理推送数据失败', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhook/feelgood
 * 获取 Webhook 接收地址和状态
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const webhookUrl = WebhookAdapter.getWebhookUrl(baseUrl);
  const bufferSize = WebhookAdapter.getBufferSize();

  return NextResponse.json({
    success: true,
    data: {
      webhookUrl,
      bufferSize,
      status: bufferSize > 0 ? '有数据待处理' : '等待数据推送',
    },
  });
}
