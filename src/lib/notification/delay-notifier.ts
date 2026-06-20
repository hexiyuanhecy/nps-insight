/**
 * 延迟通知服务
 * 支持配置变更的批量收集和延迟发送，避免短时间内发送多条消息
 */

import { sendNotification } from './feishu-notifier';

interface ConfigChange {
  type: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
}

class DelayNotifier {
  private changes: ConfigChange[] = [];
  private timer: NodeJS.Timeout | null = null;
  private delayMinutes: number = 2;
  private chatId: string | null = null;

  constructor(delayMinutes: number = 2) {
    this.delayMinutes = delayMinutes;
    this.chatId = process.env.NOTIFICATION_CHAT_ID || null;
  }

  recordChange(type: string, field: string, newValue?: string, oldValue?: string) {
    this.changes.push({
      type,
      field,
      oldValue,
      newValue,
      timestamp: Date.now(),
    });

    this.scheduleNotification();
  }

  private scheduleNotification() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.sendNotification();
    }, this.delayMinutes * 60 * 1000);
  }

  private async sendNotification() {
    if (!this.chatId || this.changes.length === 0) {
      this.changes = [];
      return;
    }

    const changes = [...this.changes];
    this.changes = [];
    this.timer = null;

    const groupedChanges = this.groupChanges(changes);
    const message = this.formatMessage(groupedChanges);

    try {
      await sendNotification(this.chatId, message);
      console.log('[DelayNotifier] 配置变更通知已发送');
    } catch (error) {
      console.error('[DelayNotifier] 发送通知失败:', error);
    }
  }

  private groupChanges(changes: ConfigChange[]): Record<string, ConfigChange[]> {
    const groups: Record<string, ConfigChange[]> = {};
    
    changes.forEach((change) => {
      if (!groups[change.type]) {
        groups[change.type] = [];
      }
      groups[change.type].push(change);
    });

    return groups;
  }

  private formatMessage(groupedChanges: Record<string, ConfigChange[]>): string {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    let message = `【NPS Insight 配置变更通知】\n\n时间: ${timeStr}\n\n`;

    const typeNames: Record<string, string> = {
      dataSource: '数据源配置',
      llm: 'AI 模型配置',
      bitable: '多维表格配置',
      tags: '标签配置',
      notification: '通知配置',
    };

    Object.entries(groupedChanges).forEach(([type, changes]) => {
      message += `### ${typeNames[type] || type}\n`;
      
      changes.forEach((change) => {
        if (change.oldValue && change.newValue) {
          message += `- ${change.field}: ${change.oldValue} → ${change.newValue}\n`;
        } else if (change.newValue) {
          message += `- ${change.field}: 已设置为 "${change.newValue}"\n`;
        } else {
          message += `- ${change.field}: 已更新\n`;
        }
      });
      
      message += '\n';
    });

    message += `共 ${Object.values(groupedChanges).reduce((sum, arr) => sum + arr.length, 0)} 项配置变更`;

    return message;
  }

  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.changes = [];
  }
}

export const delayNotifier = new DelayNotifier(2);

export function notifyConfigChange(type: string, field: string, newValue?: string, oldValue?: string) {
  delayNotifier.recordChange(type, field, newValue, oldValue);
}
