/**
 * Excel 导入数据源适配器
 */

import {
  DataSourceAdapter,
  FeedbackRecord,
  FieldMapping,
  DEFAULT_FIELD_MAPPING,
  extractFieldValue
} from './base-adapter'

export interface ExcelAdapterConfig {
  type: 'excel';
  fileBuffer?: Buffer;
  fieldMapping?: FieldMapping;
}

export class ExcelAdapter implements DataSourceAdapter {
  private config: ExcelAdapterConfig;
  private xlsx: typeof import('xlsx') | null = null;

  constructor(config: ExcelAdapterConfig) {
    this.config = config;
  }

  getType(): string {
    return 'excel';
  }

  getDefaultFieldMapping(): FieldMapping {
    return DEFAULT_FIELD_MAPPING;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config.fileBuffer) {
      return { success: false, message: '请先上传 Excel 文件' };
    }
    return { success: true, message: '文件解析成功' };
  }

  async fetchData(startDate?: string, endDate?: string): Promise<FeedbackRecord[]> {
    if (!this.config.fileBuffer) {
      throw new Error('Excel 文件未上传');
    }

    // 动态导入 xlsx
    if (!this.xlsx) {
      this.xlsx = await import('xlsx');
    }

    // 解析 Excel
    const workbook = this.xlsx.read(this.config.fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = this.xlsx.utils.sheet_to_json(worksheet);

    if (rawData.length === 0) {
      return [];
    }

    // 字段自动识别
    if (rawData.length > 0) {
      const headers = Object.keys(rawData[0] as object);
      this.autoDetectFieldMapping(headers);
    }

    const mapping = this.config.fieldMapping || DEFAULT_FIELD_MAPPING;

    // 解析数据
    const feedbacks: FeedbackRecord[] = rawData.map((row: any, index: number) => {
      // 使用 extractFieldValue 统一处理字段值提取
      // 该函数会尝试 mapping 中定义的所有可能字段名
      const feedbackId =
        extractFieldValue(
          row,
          mapping.feedbackId || DEFAULT_FIELD_MAPPING.feedbackId
        ) || `EXCEL-${index + 1}`
      const content =
        extractFieldValue(
          row,
          mapping.content || DEFAULT_FIELD_MAPPING.content
        ) || ''
      const score = Number(
        extractFieldValue(row, mapping.score || DEFAULT_FIELD_MAPPING.score) ||
          0
      )
      const createTime =
        extractFieldValue(
          row,
          mapping.createTime || DEFAULT_FIELD_MAPPING.createTime
        ) || new Date().toISOString()

      return {
        feedbackId: String(feedbackId),
        content: String(content),
        score,
        createTime:
          typeof createTime === 'string'
            ? createTime
            : new Date(createTime).toISOString(),
        module: extractFieldValue(
          row,
          mapping.module || DEFAULT_FIELD_MAPPING.module
        ),
        source: extractFieldValue(
          row,
          mapping.source || DEFAULT_FIELD_MAPPING.source
        ),
        dissatisfactionReason: extractFieldValue(
          row,
          mapping.dissatisfactionReason ||
            DEFAULT_FIELD_MAPPING.dissatisfactionReason
        ),
        tenantId: extractFieldValue(
          row,
          mapping.tenantId || DEFAULT_FIELD_MAPPING.tenantId
        ),
        tenantName: extractFieldValue(
          row,
          mapping.tenantName || DEFAULT_FIELD_MAPPING.tenantName
        ),
        tenantScale: extractFieldValue(
          row,
          mapping.tenantScale || DEFAULT_FIELD_MAPPING.tenantScale
        ),
        larkUserId: extractFieldValue(
          row,
          mapping.larkUserId || DEFAULT_FIELD_MAPPING.larkUserId
        )
      }
    });

    // 按时间范围过滤
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return feedbacks.filter((f) => {
        const createTime = new Date(f.createTime);
        return createTime >= start && createTime <= end;
      });
    }

    return feedbacks;
  }

  private autoDetectFieldMapping(headers: string[]): void {
    const mapping: FieldMapping = {};
    const configMapping = this.config.fieldMapping || {};

    for (const [systemField, possibleFields] of Object.entries(DEFAULT_FIELD_MAPPING)) {
      const fieldList = Array.isArray(possibleFields) ? possibleFields : [possibleFields];
      for (const header of headers) {
        const normalizedHeader = header.toLowerCase().trim();
        const matches = fieldList.some(
          (pf) => pf.toLowerCase().trim() === normalizedHeader
        );
        if (matches) {
          mapping[systemField] = header;
          break;
        }
      }
    }

    // 合并用户手动映射
    this.config.fieldMapping = { ...mapping, ...configMapping };
  }
}
