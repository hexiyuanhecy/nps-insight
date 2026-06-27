/**
 * 飞书存储适配器实现
 * 封装飞书多维表格 API，实现 StorageAdapter 接口
 */

import { StorageAdapter, TABLES } from './base-storage';
import { BitableRecord, BitableQueryParams } from '@/lib/types';
import {
  createRecord,
  batchCreateRecords,
  updateRecord,
  batchUpdateRecords,
  deleteRecord,
  getRecord,
  listRecords,
  searchRecords,
  searchRecordsFuzzy,
  listTables,
  createTable,
  addField,
  resolveTableId,
} from '../feishu/bitable';
import { getTenantAccessToken } from '../feishu/client';
import { DEFAULT_PAGE_SIZE } from '@/constants/app-constants';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

/**
 * 飞书存储适配器
 */
export class FeishuStorageAdapter implements StorageAdapter {
  private appToken: string;

  constructor(appToken?: string) {
    this.appToken = appToken || process.env.BITABLE_TOKEN || '';
    if (!this.appToken) {
      throw new Error('飞书多维表格 Token 未配置');
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

      // 尝试列出表
      const tables = await this.listTables();
      return { success: true, message: `连接成功，共 ${tables.length} 张表` };
    } catch (error) {
      return { success: false, message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  }

  /**
   * 创建单条记录
   */
  async createRecord(tableId: string, fields: Record<string, unknown>): Promise<BitableRecord> {
    const resolvedTableId = resolveTableId(tableId);
    return createRecord(resolvedTableId, fields);
  }

  /**
   * 批量创建记录
   */
  async batchCreateRecords(
    tableId: string,
    records: Array<{ fields: Record<string, unknown> }>
  ): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    return batchCreateRecords(resolvedTableId, records);
  }

  /**
   * 更新单条记录
   */
  async updateRecord(
    tableId: string,
    recordId: string,
    fields: Record<string, unknown>
  ): Promise<BitableRecord> {
    const resolvedTableId = resolveTableId(tableId);
    return updateRecord(resolvedTableId, recordId, fields);
  }

  /**
   * 批量更新记录
   */
  async batchUpdateRecords(
    tableId: string,
    records: Array<{ record_id: string; fields: Record<string, unknown> }>
  ): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    return batchUpdateRecords(resolvedTableId, records);
  }

  /**
   * 删除单条记录
   */
  async deleteRecord(tableId: string, recordId: string): Promise<void> {
    const resolvedTableId = resolveTableId(tableId);
    return deleteRecord(resolvedTableId, recordId);
  }

  /**
   * 获取单条记录
   */
  async getRecord(tableId: string, recordId: string): Promise<BitableRecord | null> {
    const resolvedTableId = resolveTableId(tableId);
    return getRecord(resolvedTableId, recordId);
  }

  /**
   * 列出所有记录
   */
  async listRecords(tableId: string, params?: BitableQueryParams): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    return listRecords(resolvedTableId, params);
  }

  /**
   * 搜索记录（精确匹配）
   */
  async searchRecords(
    tableId: string,
    fieldName: string,
    fieldValue: string | number
  ): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    return searchRecords(resolvedTableId, fieldName, fieldValue);
  }

  /**
   * 搜索记录（模糊匹配）
   */
  async searchRecordsFuzzy(
    tableId: string,
    fieldName: string,
    fieldValue: string
  ): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    return searchRecordsFuzzy(resolvedTableId, fieldName, fieldValue);
  }

  /**
   * 全量加载到内存 Map
   */
  async loadAllToMap(tableId: string, keyField?: string): Promise<Map<string, BitableRecord>> {
    const resolvedTableId = resolveTableId(tableId);
    const records = await listRecords(resolvedTableId, { pageSize: DEFAULT_PAGE_SIZE });
    
    const map = new Map<string, BitableRecord>();
    const key = keyField || 'record_id';
    
    for (const record of records) {
      const keyValue = key === 'record_id' 
        ? record.record_id 
        : String(record.fields[key] || record.record_id);
      map.set(keyValue, record);
    }
    
    return map;
  }

  /**
   * 按时间范围查询记录
   */
  async listRecordsByTimeRange(
    tableId: string,
    timeField: string,
    start: Date,
    end: Date
  ): Promise<BitableRecord[]> {
    const resolvedTableId = resolveTableId(tableId);
    
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [
        {
          field_name: timeField,
          operator: 'greaterOrEqual',
          value: [start.getTime()],
        },
        {
          field_name: timeField,
          operator: 'lessOrEqual',
          value: [end.getTime()],
        },
      ],
    });
    
    return listRecords(resolvedTableId, { filter, pageSize: DEFAULT_PAGE_SIZE });
  }

  /**
   * 获取表的字段列表
   */
  async getTableFields(
    tableId: string
  ): Promise<Array<{ field_id: string; field_name: string; type: number }>> {
    const resolvedTableId = resolveTableId(tableId);
    const token = await getTenantAccessToken();
    
    const response = await fetch(
      `${BITABLE_API_BASE}/apps/${this.appToken}/tables/${resolvedTableId}/fields`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取字段列表失败: ${data.msg}`);
    }
    
    return (data.data?.items || []).map((item: any) => ({
      field_id: item.field_id || '',
      field_name: item.field_name || '',
      type: item.type || 1,
    }));
  }

  /**
   * 列出所有表
   */
  async listTables(): Promise<Array<{ table_id: string; name: string }>> {
    return listTables();
  }

  /**
   * 创建新表
   */
  async createTable(
    name: string,
    fields: Array<{ field_name: string; field_type: string; property?: Record<string, unknown> }>
  ): Promise<string> {
    return createTable(name, fields);
  }

  /**
   * 添加字段
   */
  async addField(
    tableId: string,
    fieldName: string,
    fieldType: number,
    property?: Record<string, unknown>
  ): Promise<void> {
    const resolvedTableId = resolveTableId(tableId);
    return addField(resolvedTableId, fieldName, fieldType, property);
  }
}