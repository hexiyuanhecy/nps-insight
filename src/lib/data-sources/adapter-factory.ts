/**
 * 数据源适配器工厂
 */

import { DataSourceAdapter, DataSourceConfig } from './base-adapter';
import { ApiAdapter } from './api-adapter';
import { ExcelAdapter } from './excel-adapter';
import { DatabaseAdapter } from './database-adapter';
import { WebhookAdapter } from './webhook-adapter';

export class AdapterFactory {
  static create(config: DataSourceConfig): DataSourceAdapter {
    switch (config.type) {
      case 'api':
        return new ApiAdapter(config as any);
      case 'excel':
        return new ExcelAdapter(config as any);
      case 'database':
        return new DatabaseAdapter(config as any);
      case 'webhook':
        return new WebhookAdapter(config as any);
      default:
        throw new Error(`不支持的数据源类型: ${(config as any).type}`);
    }
  }

  /**
   * 从环境变量创建适配器
   */
  static createFromEnv(): DataSourceAdapter | null {
    const configStr = process.env.DATA_SOURCE_CONFIG;
    if (!configStr) {
      return null;
    }

    try {
      const config = JSON.parse(configStr) as DataSourceConfig;
      return this.create(config);
    } catch (error) {
      console.error('解析数据源配置失败:', error);
      return null;
    }
  }
}

// 导出所有适配器类型
export { ApiAdapter } from './api-adapter';
export { ExcelAdapter } from './excel-adapter';
export { DatabaseAdapter } from './database-adapter';
export { WebhookAdapter } from './webhook-adapter';
