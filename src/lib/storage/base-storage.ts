/**
 * 存储层抽象接口
 * 用于多维表格操作的统一抽象，支持飞书或其他存储实现
 */

import { BitableRecord, BitableQueryParams } from '@/lib/types';

/**
 * 存储适配器接口
 * 所有存储实现必须遵循此接口
 */
export interface StorageAdapter {
  getType(): string;
  testConnection(): Promise<{ success: boolean; message: string }>;
  createRecord(tableId: string, fields: Record<string, unknown>): Promise<BitableRecord>;
  batchCreateRecords(tableId: string, records: Array<{ fields: Record<string, unknown> }>): Promise<BitableRecord[]>;
  updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>): Promise<BitableRecord>;
  batchUpdateRecords(tableId: string, records: Array<{ record_id: string; fields: Record<string, unknown> }>): Promise<BitableRecord[]>;
  deleteRecord(tableId: string, recordId: string): Promise<void>;
  listRecords(tableId: string, params?: BitableQueryParams): Promise<BitableRecord[]>;
  searchRecords(tableId: string, fieldName: string, fieldValue: string | number): Promise<BitableRecord[]>;
  searchRecordsFuzzy(tableId: string, fieldName: string, fieldValue: string): Promise<BitableRecord[]>;
  loadAllToMap(tableId: string, keyField?: string): Promise<Map<string, BitableRecord>>;
  listRecordsByTimeRange(tableId: string, timeField: string, start: Date, end: Date): Promise<BitableRecord[]>;
  getTableFields(tableId: string): Promise<Array<{ field_id: string; field_name: string; type: number }>>;
  listTables(): Promise<Array<{ table_id: string; name: string }>>;
  createTable(name: string, fields: Array<{ field_name: string; field_type: string; property?: Record<string, unknown> }>): Promise<string>;
  addField(tableId: string, fieldName: string, fieldType: number, property?: Record<string, unknown>): Promise<void>;
}

export const TABLES = {
  FEEDBACK: 'feedback',
  TAGS: 'tags',
  TAG1: 'tag1',
  TAG2: 'tag2',
  TAG3: 'tag3',
  TENANTS: 'tenants',
  TOP_ISSUES: 'analysis',
  CONFIG: 'config',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];
