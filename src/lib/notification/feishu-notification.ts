/**
 * 飞书通知适配器实现
 * 封装飞书 Bot API，实现 NotificationAdapter 接口
 */

import { NotificationAdapter } from './base-notification';
import { InteractiveMessageContent } from '../feishu/bot';
import { sendNotification, sendCardNotification } from './feishu-notifier';
import { getTenantAccessToken } from '../feishu/client';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

/**
 * 飞书通知适配器
 */
export class FeishuNotificationAdapter implements NotificationAdapter {
  private appId: string;
  private appSecret: string;

  constructor(appId?: string, appSecret?: string) {
    this.appId = appId || process.env.FEISHU_APP_ID || '';
    this.appSecret = appSecret || process.env.FEISHU_APP_SECRET || '';
    
    if (!this.appId || !this.appSecret) {
      throw new Error('飞书应用配置缺失');
    }
  }

  /**
   * 获取适配器类型
   */
  getType(): string {
    return 'feishu';
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await getTenantAccessToken();
      if (!token) {
        return { success: false, message: '获取飞书 Token 失败' };
      }
      return { success: true, message: '飞书连接成功' };
    } catch (error) {
      return { success: false, message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  }

  /**
   * 发送文本消息
   */
  async sendText(channel: string, content: string): Promise<boolean> {
    return sendNotification(channel, content);
  }

  /**
   * 发送卡片消息
   */
  async sendCard(channel: string, card: InteractiveMessageContent): Promise<boolean> {
    return sendCardNotification(channel, card);
  }

  /**
   * 发送消息到多个渠道
   */
  async sendToMultiple(channelIds: string[], card: InteractiveMessageContent): Promise<void> {
    for (const channelId of channelIds) {
      try {
        await this.sendCard(channelId, card);
        console.log(`[通知] 已发送到渠道 ${channelId}`);
      } catch (error) {
        console.error(`[通知] 发送到渠道 ${channelId} 失败:`, error);
      }
    }
  }

  /**
   * 发送富文本消息
   */
  async sendPost(channel: string, title: string, content: string): Promise<boolean> {
    try {
      const token = await getTenantAccessToken();
      
      const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: channel,
          msg_type: 'post',
          content: JSON.stringify({
            post: {
              zh_cn: {
                title,
                content: [[{ tag: 'text', text: content }]],
              },
            },
          }),
        }),
      });
      
      const data = await response.json();
      if (data.code !== 0) {
        console.error('[FeishuNotification] 发送富文本消息失败:', data.msg);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[FeishuNotification] 发送富文本消息异常:', error);
      return false;
    }
  }
}