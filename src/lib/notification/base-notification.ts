/**
 * 通知层抽象接口
 * 用于消息通知的统一抽象，支持飞书或其他通知渠道
 */

import { InteractiveMessageContent } from '../feishu/bot';

/**
 * 通知适配器接口
 * 所有通知实现必须遵循此接口
 */
export interface NotificationAdapter {
  /**
   * 获取适配器类型
   */
  getType(): string;

  /**
   * 测试连接
   */
  testConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * 发送文本消息
   */
  sendText(channel: string, content: string): Promise<boolean>;

  /**
   * 发送卡片消息
   */
  sendCard(channel: string, card: InteractiveMessageContent): Promise<boolean>;

  /**
   * 发送消息到多个渠道
   */
  sendToMultiple(channelIds: string[], card: InteractiveMessageContent): Promise<void>;

  /**
   * 发送富文本消息
   */
  sendPost(channel: string, title: string, content: string): Promise<boolean>;
}

/**
 * 通知渠道类型
 */
export type NotificationChannel = 'feishu' | 'webhook' | 'email' | 'slack';

/**
 * 通知配置
 */
export interface NotificationConfig {
  /** 通知渠道类型 */
  type: NotificationChannel;
  /** 渠道 ID 列表（如飞书群 ID） */
  channels: string[];
  /** 是否启用 */
  enabled: boolean;
}