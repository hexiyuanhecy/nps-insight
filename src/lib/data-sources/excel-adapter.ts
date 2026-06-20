/**
 * Excel 导入数据源适配器
 */

import {
  DataSourceAdapter,
  FeedbackRecord,
  FieldMapping,
  DEFAULT_FIELD_MAPPING,
} from './base-adapter';

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
      const feedbackId =
        row[mapping.feedbackId as string] ||
        row['id'] ||
        row['编号'] ||
        `EXCEL-${index + 1}`;
      const content =
        row[mapping.content as string] ||
        row['content'] ||
        row['评价内容'] ||
        row['反馈内容'] ||
        '';
      const score = Number(
        row[mapping.score as string] ||
          row['score'] ||
          row['评分'] ||
          0
      );
      const createTime =
        row[mapping.createTime as string] ||
        row['create_time'] ||
        row['评价时间'] ||
        row['提交时间'] ||
        new Date().toISOString();

      return {
        feedbackId: String(feedbackId),
        content: String(content),
        score,
        createTime: typeof createTime === 'string' ? createTime : new Date(createTime).toISOString(),
        module: row[mapping.module as string] || row['module'] || row['功能模块'],
        source: row[mapping.source as string] || row['source'] || row['来源'],
        dissatisfactionReason:
          row[mapping.dissatisfactionReason as string] || row['reason'] || row['不满意原因'],
        tenantId: row[mapping.tenantId as string] || row['tenant_id'] || row['租户ID'],
        tenantName: row[mapping.tenantName as string] || row['tenant_name'] || row['租户名称'],
        tenantScale: row[mapping.tenantScale as string] || row['tenant_scale'] || row['租户规模'],
        larkUserId: row[mapping.larkUserId as string] || row['user_id'],
      };
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
