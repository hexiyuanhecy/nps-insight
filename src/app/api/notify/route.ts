/**
 * 飞书消息通知 API
 * POST /api/notify - 发送飞书消息
 */

import { NextRequest, NextResponse } from 'next/server';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken(): Promise<string> {
  const res = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`);
  return data.tenant_access_token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { chatId, text, msgType = 'text', message } = body;

    // 支持 message 作为 text 的别名
    const textContent = text || message;
    const targetChatId = chatId || process.env.NOTIFICATION_CHAT_ID;
    if (!targetChatId) {
      return NextResponse.json(
        { success: false, error: '缺少 chatId，也没有配置 NOTIFICATION_CHAT_ID' },
        { status: 400 }
      );
    }
    if (!textContent) {
      return NextResponse.json(
        { success: false, error: '缺少 text 消息内容' },
        { status: 400 }
      );
    }

    const token = await getTenantAccessToken();

    const res = await fetch(
      `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: targetChatId,
          msg_type: msgType,
          content: JSON.stringify({ text: textContent }),
        }),
      }
    );
    const data = await res.json();
    if (data.code !== 0) {
      return NextResponse.json(
        { success: false, error: `飞书 API 错误: ${data.msg}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        messageId: data.data?.message_id,
        chatId: targetChatId,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '未知错误';
    console.error('[API] 发送通知失败', error);
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
