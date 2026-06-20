/**
 * 数据库直连数据源适配器
 */

import {
  DataSourceAdapter,
  FeedbackRecord,
  FieldMapping,
  DEFAULT_FIELD_MAPPING,
  extractFieldValue,
} from './base-adapter';

export interface DatabaseAdapterConfig {
  type: 'database';
  dbType: 'mysql' | 'postgresql' | 'sqlserver' | 'oracle';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  querySql: string; // 使用 {{startDate}} 和 {{endDate}} 占位符
}

export class DatabaseAdapter implements DataSourceAdapter {
  private config: DatabaseAdapterConfig;

  constructor(config: DatabaseAdapterConfig) {
    this.config = config;
  }

  getType(): string {
    return 'database';
  }

  getDefaultFieldMapping(): FieldMapping {
    return DEFAULT_FIELD_MAPPING;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const pool = await this.createPool();
      const connection = await pool.connect();
      if (connection && typeof connection.release === 'function') {
        connection.release();
      }
      await pool.end();
      return { success: true, message: '数据库连接成功' };
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  async fetchData(startDate: string, endDate: string): Promise<FeedbackRecord[]> {
    const pool = await this.createPool();

    try {
      // 替换时间占位符
      let sql = this.config.querySql
        .replace(/\{\{startDate\}\}/g, startDate)
        .replace(/\{\{endDate\}\}/g, endDate);

      const [rows] = await pool.query(sql);

      if (!Array.isArray(rows)) {
        return [];
      }

      return (rows as any[]).map((row: any, index: number) => {
        const mapping = DEFAULT_FIELD_MAPPING;
        const feedbackId =
          extractFieldValue(row, mapping.feedbackId) || `DB-${index + 1}`;
        const content =
          extractFieldValue(row, mapping.content) || '';
        const score = Number(extractFieldValue(row, mapping.score) || 0);
        const createTime =
          extractFieldValue(row, mapping.createTime) || new Date().toISOString();

        return {
          feedbackId: String(feedbackId),
          content: String(content),
          score,
          createTime,
          module: extractFieldValue(row, mapping.module),
          source: extractFieldValue(row, mapping.source),
          dissatisfactionReason: extractFieldValue(row, mapping.dissatisfactionReason),
          tenantId: extractFieldValue(row, mapping.tenantId),
          tenantName: extractFieldValue(row, mapping.tenantName),
          tenantScale: extractFieldValue(row, mapping.tenantScale),
          larkUserId: extractFieldValue(row, mapping.larkUserId),
        };
      });
    } finally {
      await pool.end();
    }
  }

  private async createPool(): Promise<any> {
    const { dbType, host, port, database, username, password } = this.config;

    switch (dbType) {
      case 'mysql': {
        try {
          const mysql = await import('mysql2/promise');
          return mysql.createPool({
            host,
            port,
            database,
            user: username,
            password,
            waitForConnections: true,
            connectionLimit: 10,
          });
        } catch {
          throw new Error('mysql2 未安装，请运行: npm install mysql2');
        }
      }
      case 'postgresql': {
        try {
          const { Pool } = await import('pg');
          return new Pool({
            host,
            port,
            database,
            user: username,
            password,
            max: 10,
          });
        } catch {
          throw new Error('pg 未安装，请运行: npm install pg');
        }
      }
      default:
        throw new Error(`不支持的数据库类型: ${dbType}`);
    }
  }
}
