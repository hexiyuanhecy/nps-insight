/**
 * 飞书消息通知服务
 */

import { getTenantAccessToken } from '../feishu/client';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

export async function sendNotification(chatId: string, message: string): Promise<boolean> {
  try {
    const token = await getTenantAccessToken();

    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message }),
      }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      console.error('[FeishuNotifier] 发送消息失败:', data.msg);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[FeishuNotifier] 发送消息异常:', error);
    return false;
  }
}

export async function sendCardNotification(chatId: string, card: any): Promise<boolean> {
  try {
    const token = await getTenantAccessToken();

    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      console.error('[FeishuNotifier] 发送卡片消息失败:', data.msg);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[FeishuNotifier] 发送卡片消息异常:', error);
    return false;
  }
}

/**
 * 构建周报卡片
 */
export function buildWeeklyReportCard(data: {
  newCount: number;
  reviewCount: number;
  topIssues: Array<{ tag1: string; tag2: string; tag3: string; count: number }>;
}): any {
  return {
    config: {
      wide_screen_mode: true,
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `# NPS 周报\n\n**新增反馈**：${data.newCount} 条\n**待审核**：${data.reviewCount} 条`,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `## Top 3 问题\n\n${data.topIssues
            .slice(0, 3)
            .map(
              (issue, i) =>
                `${i + 1}. **${issue.tag1}** - ${issue.tag2} - ${issue.tag3} (${issue.count}条)`
            )
            .join('\n')}`,
        },
      },
    ],
  };
}
