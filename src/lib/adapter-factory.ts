/**
 * 服务工厂
 * 根据配置创建不同的 Adapter 实现
 */

import { StorageAdapter } from './storage/base-storage';
import { FeishuStorageAdapter } from './storage/feishu-storage';
import { NotificationAdapter } from './notification/base-notification';
import { FeishuNotificationAdapter } from './notification/feishu-notification';
import { DocumentAdapter } from './document/base-document';
import { FeishuDocumentAdapter } from './document/feishu-document';

/**
 * 适配器类型配置
 */
export type AdapterType = 'feishu' | 'sqlite' | 'webhook' | 'markdown' | 'local';

/**
 * 服务工厂类
 */
export class AdapterFactory {
  /**
   * 创建存储适配器
   */
  static createStorage(type?: AdapterType): StorageAdapter {
    const storageType = type || (process.env.STORAGE_ADAPTER as AdapterType) || 'feishu';
    
    switch (storageType) {
      case 'feishu':
        return new FeishuStorageAdapter();
      case 'sqlite':
        // TODO: 实现 SQLiteStorageAdapter
        throw new Error('SQLite 存储适配器尚未实现');
      default:
        throw new Error(`未知的存储适配器类型: ${storageType}`);
    }
  }

  /**
   * 创建通知适配器
   */
  static createNotification(type?: AdapterType): NotificationAdapter {
    const notificationType = type || (process.env.NOTIFICATION_ADAPTER as AdapterType) || 'feishu';
    
    switch (notificationType) {
      case 'feishu':
        return new FeishuNotificationAdapter();
      case 'webhook':
        // TODO: 实现 WebhookNotificationAdapter
        throw new Error('Webhook 通知适配器尚未实现');
      default:
        throw new Error(`未知的通知适配器类型: ${notificationType}`);
    }
  }

  /**
   * 创建文档适配器
   */
  static createDocument(type?: AdapterType, options?: {
    userAccessToken?: string;
    userRefreshToken?: string;
    tokenExpiresAt?: number;
  }): DocumentAdapter {
    const documentType = type || (process.env.DOCUMENT_ADAPTER as AdapterType) || 'feishu';
    
    switch (documentType) {
      case 'feishu':
        return new FeishuDocumentAdapter(
          undefined,
          undefined,
          options?.userAccessToken,
          options?.userRefreshToken,
          options?.tokenExpiresAt
        );
      case 'markdown':
        // TODO: 实现 MarkdownDocumentAdapter
        throw new Error('Markdown 文档适配器尚未实现');
      default:
        throw new Error(`未知的文档适配器类型: ${documentType}`);
    }
  }
}

/**
 * 默认适配器实例（单例模式）
 */
let defaultStorage: StorageAdapter | null = null;
let defaultNotification: NotificationAdapter | null = null;
let defaultDocument: DocumentAdapter | null = null;

/**
 * 获取默认存储适配器
 */
export function getDefaultStorage(): StorageAdapter {
  if (!defaultStorage) {
    defaultStorage = AdapterFactory.createStorage();
  }
  return defaultStorage;
}

/**
 * 获取默认通知适配器
 */
export function getDefaultNotification(): NotificationAdapter {
  if (!defaultNotification) {
    defaultNotification = AdapterFactory.createNotification();
  }
  return defaultNotification;
}

/**
 * 获取默认文档适配器
 */
export function getDefaultDocument(): DocumentAdapter {
  if (!defaultDocument) {
    defaultDocument = AdapterFactory.createDocument();
  }
  return defaultDocument;
}
