/**
 * 文档层抽象接口
 * 用于文档操作的统一抽象，支持飞书或其他文档系统
 */

/**
 * 文档适配器接口
 * 所有文档实现必须遵循此接口
 */
export interface DocumentAdapter {
  /**
   * 获取适配器类型
   */
  getType(): string;

  /**
   * 测试连接
   */
  testConnection(): Promise<{ success: boolean; message: string }>;

  /**
   * 创建文档
   */
  create(title: string, content: string): Promise<{ documentId: string; url: string }>;

  /**
   * 追加内容到文档
   */
  append(
    documentId: string,
    content: string,
    position?: 'top' | 'bottom'
  ): Promise<void>;

  /**
   * 更新文档内容
   */
  update(documentId: string, content: string): Promise<void>;

  /**
   * 获取文档内容
   */
  getContent(documentId: string): Promise<string>;

  /**
   * 删除文档
   */
  delete(documentId: string): Promise<void>;
}

/**
 * 文档类型
 */
export type DocumentType = 'feishu' | 'markdown' | 'html' | 'pdf';

/**
 * 文档配置
 */
export interface DocumentConfig {
  /** 文档类型 */
  type: DocumentType;
  /** 文档 ID（如飞书文档 token） */
  documentId?: string;
  /** 是否启用 */
  enabled: boolean;
}