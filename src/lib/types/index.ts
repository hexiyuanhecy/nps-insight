/**
 * NPS Insight - 全局类型定义
 * 包含所有数据模型、API请求/响应类型、枚举定义
 */

// ============================================
// 基础枚举类型
// ============================================

/** 反馈处理状态 */
export enum FeedbackStatus {
  NEW = 'new',           // 新提交
  PENDING = 'pending',   // 待处理
  PROCESSING = 'processing', // 处理中
  RESOLVED = 'resolved', // 已解决
  CLOSED = 'closed',     // 已关闭
}

/** 优先级 */
export enum Priority {
  URGENT = 'urgent',     // 紧急
  HIGH = 'high',         // 高
  MEDIUM = 'medium',     // 中
  LOW = 'low',           // 低
}

/** 标签状态 */
export enum TagStatus {
  ACTIVE = 'active',     // 启用
  INACTIVE = 'inactive', // 停用
}

/** 租户规模 */
export enum TenantScale {
  A1 = 'A1',             // 小型 (< 100人)
  A2 = 'A2',             // 中小型 (100-500人)
  A3 = 'A3',             // 中型 (500-1000人)
  A4 = 'A4',             // 中大型 (1000-5000人)
  A5 = 'A5',             // 大型 (5000-10000人)
  A6 = 'A6',             // 企业级 (> 10000人)
}

/** NPS评分等级 */
export enum NPSCategory {
  DETRACTOR = 'detractor',   // 贬损者 (0-6分)
  PASSIVE = 'passive',       // 被动者 (7-8分)
  PROMOTER = 'promoter',     // 推荐者 (9-10分)
}

// ============================================
// 数据模型类型
// ============================================

/** NPS反馈记录 —— 与PRD v2对齐 */
export interface Feedback {
  /** 唯一标识 */
  feedbackId: string;
  /** 租户ID */
  tenantId: string;
  /** 租户名称 */
  tenantName?: string;
  /** 租户规模 */
  tenantScale?: string;
  /** 用户ID */
  userId: string;
  /** 用户名称 */
  userName?: string;
  /** 创建时间 */
  createTime: string;
  /** 不满意原因（PRD v2：不满意原因，多选） */
  module?: string;
  /** 反馈原文 */
  content: string;
  /** 翻译后文本 */
  translatedContent?: string;
  /** NPS评分 (1-5) */
  npsScore: number;
  /** 反馈平台 */
  source: string;
  /** 一级标签 */
  tag1?: string;
  /** 二级标签 */
  tag2?: string;
  /** 三级标签 */
  tag3?: string;
  /** AI置信度 */
  confidence?: number;
  /** 需查日志 */
  needLogCheck?: boolean;
  /** 待审核 */
  reviewNeeded?: boolean;
  /** 打标时间 */
  tagTime?: string;
  /** AI生成的摘要 */
  summary?: string;
  /** AI建议 */
  suggestions?: string;
  /** 优先级 */
  priority?: Priority;
  /** 处理状态 */
  status: FeedbackStatus;
  /** 处理人ID */
  assigneeId?: string;
  /** 记录ID（飞书多维表格内部ID） */
  recordId?: string;
}

/** 标签体系 */
export interface Tag {
  /** 标签唯一标识 */
  tagId: string;
  /** 一级标签名称 */
  tag1Name: string;
  /** 二级标签名称 */
  tag2Name: string;
  /** 三级标签名称 */
  tag3Name: string;
  /** 使用次数 */
  usageCount: number;
  /** 状态 */
  status: TagStatus;
  /** 创建人 */
  createdBy: string;
  /** 创建时间 */
  createdAt: string;
  /** 记录ID（飞书多维表格内部ID） */
  recordId?: string;
}

/** 租户信息 */
export interface Tenant {
  /** 租户ID */
  tenantId: string;
  /** 租户名称 */
  tenantName: string;
  /** 规模 */
  scale: TenantScale;
  /** 联系人 */
  contact: string;
  /** 联系邮箱 */
  contactEmail: string;
  /** 日志平台 */
  logPlatform?: string;
  /** 日志端点 */
  logEndpoint?: string;
  /** 日志凭证 */
  logCredentials?: string;
  /** 记录ID（飞书多维表格内部ID） */
  recordId?: string;
}

/** 周期分析报告 */
export interface PeriodAnalysis {
  /** 周期ID */
  periodId: string;
  /** 周期名称（如：2024-Q1） */
  periodName: string;
  /** 开始日期 */
  startDate: string;
  /** 结束日期 */
  endDate: string;
  /** 总反馈数 */
  totalFeedbacks: number;
  /** NPS综合得分 */
  npsScore: number;
  /** 主要问题（JSON字符串） */
  topIssues: string;
  /** 创建时间 */
  createdAt: string;
  /** 记录ID（飞书多维表格内部ID） */
  recordId?: string;
}

/** 系统配置 */
export interface SystemConfig {
  /** 配置键 */
  configKey: string;
  /** 配置值 */
  configValue: string;
  /** 描述 */
  description?: string;
  /** 更新时间 */
  updatedAt: string;
  /** 记录ID（飞书多维表格内部ID） */
  recordId?: string;
}

// ============================================
// AI相关类型
// ============================================

/** AI打标结果 */
export interface AITagResult {
  /** 一级标签 */
  tag1: string;
  /** 二级标签 */
  tag2: string;
  /** 三级标签 */
  tag3: string;
  /** 摘要 */
  summary: string;
  /** 建议 */
  suggestions: string;
  /** 优先级 */
  priority: Priority;
  /** 置信度 (0-1) */
  confidence: number;
}

/** AI分析请求 */
export interface AIAnalysisRequest {
  /** 反馈内容 */
  content: string;
  /** NPS评分 */
  npsScore: number;
  /** 所属模块 */
  module: string;
  /** 已有标签列表（用于参考） */
  existingTags?: Tag[];
}

/** AI批量分析请求 */
export interface AIBatchRequest {
  /** 反馈列表 */
  feedbacks: Pick<Feedback, 'feedbackId' | 'content' | 'npsScore' | 'module'>[];
  /** 已有标签列表 */
  existingTags?: Tag[];
}

/** AI批量分析结果 */
export interface AIBatchResult {
  /** 反馈ID */
  feedbackId: string;
  /** 打标结果 */
  result: AITagResult;
}

// ============================================
// API请求/响应类型
// ============================================

/** 通用API响应 */
export interface ApiResponse<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 错误码 */
  code?: string;
}

/** 分页请求参数 */
export interface PaginationParams {
  /** 页码（从1开始） */
  page: number;
  /** 每页数量 */
  pageSize: number;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  list: T[];
  /** 总数量 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
}

/** 创建反馈请求 */
export interface CreateFeedbackRequest {
  tenantId: string;
  userId: string;
  userName: string;
  module: string;
  content: string;
  npsScore: number;
  source: string;
}

/** 更新反馈请求 */
export interface UpdateFeedbackRequest {
  status?: FeedbackStatus;
  priority?: Priority;
  assigneeId?: string;
  tag1?: string;
  tag2?: string;
  tag3?: string;
  summary?: string;
  suggestions?: string;
  npsScore?: number;
}

/** 创建标签请求 */
export interface CreateTagRequest {
  tag1Name: string;
  tag2Name: string;
  tag3Name: string;
  createdBy: string;
}

/** 更新配置请求 */
export interface UpdateConfigRequest {
  configValue: string;
  description?: string;
}

// ============================================
// 飞书Webhook相关类型
// ============================================

/** 飞书Webhook事件 */
export interface FeishuWebhookEvent {
  /** 事件类型 */
  event_type: string;
  /** 事件唯一标识 */
  uuid: string;
  /** 时间戳 */
  ts: string;
  /** 事件token */
  token: string;
  /** 事件数据 */
  event: {
    /** URL验证挑战字符串 */
    challenge?: string;
    /** 消息类型 */
    message_type?: string;
    /** 消息内容 */
    content?: string;
    /** 发送者 */
    sender?: {
      sender_id?: {
        union_id?: string;
        open_id?: string;
        user_id?: string;
      };
    };
    /** 群聊ID */
    chat_id?: string;
    /** 消息ID */
    message_id?: string;
    /**  mentions */
    mentions?: Array<{
      key: string;
      id: {
        union_id: string;
        open_id: string;
      };
      name: string;
      tenant_key: string;
    }>;
  };
}

/** 飞书Bot命令 */
export interface BotCommand {
  /** 命令名称 */
  command: string;
  /** 命令参数 */
  args: string[];
  /** 原始消息 */
  originalMessage: string;
  /** 发送者ID */
  senderId: string;
  /** 群聊ID */
  chatId: string;
  /** 消息ID */
  messageId: string;
}

// ============================================
// 定时任务相关类型
// ============================================

/** 同步任务配置 */
export interface SyncConfig {
  /** 数据源URL */
  sourceUrl?: string;
  /** 数据源API Key */
  sourceApiKey?: string;
  /** 目标通知群ID */
  notificationChatId?: string;
  /** 同步频率（cron表达式） */
  cronSchedule?: string;
  /** 上次同步时间 */
  lastSyncAt?: string;
  /** 是否启用自动同步 */
  autoSyncEnabled: boolean;
}

/** 同步任务结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 同步数量 */
  syncedCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 详细信息 */
  details: string[];
  /** 执行时间 */
  executedAt: string;
}

// ============================================
// 飞书多维表格SDK类型
// ============================================

/** 飞书多维表格字段定义 */
export interface BitableField {
  /** 字段名称 */
  field_name: string;
  /** 字段类型 */
  field_type: BitableFieldType;
  /** 字段属性 */
  property?: Record<string, unknown>;
}

/** 飞书多维表格字段类型 */
export type BitableFieldType =
  | 'Text'           // 文本
  | 'Number'         // 数字
  | 'SingleSelect'   // 单选
  | 'MultiSelect'    // 多选
  | 'DateTime'       // 日期时间
  | 'Checkbox'       // 复选框
  | 'Textarea'       // 多行文本
  | 'User'           // 人员
  | 'Phone'          // 电话
  | 'Email'          // 邮箱
  | 'URL'            // 链接
  | 'Attachment'     // 附件
  | 'SingleLink'     // 单向关联
  | 'MultiLink'      // 多选关联
  | 'Lookup'         // 查找引用
  | 'Formula'        // 公式
  | 'DuplexLink'     // 双向关联
  | 'Location'       // 地理位置
  | 'GroupChat'      // 群聊
  | 'AutoNumber';    // 自动编号

/** 飞书多维表格记录 */
export interface BitableRecord {
  /** 记录ID */
  record_id: string;
  /** 创建时间 */
  created_time?: string;
  /** 更新时间 */
  updated_time?: string;
  /** 创建人 */
  created_by?: {
    id: string;
    name: string;
  };
  /** 字段值映射 */
  fields: Record<string, unknown>;
}

/** 飞书多维表格查询参数 */
export interface BitableQueryParams {
  /** 过滤条件 */
  filter?: string;
  /** 排序 */
  sort?: string;
  /** 分页token */
  pageToken?: string;
  /** 每页数量 */
  pageSize?: number;
  /** 视图ID */
  viewId?: string;
  /** 字段列表 */
  fieldNames?: string[];
}

// ============================================
// 用户云资源相关类型
// ============================================

/** 用户云资源 —— 4个核心Token + 用户授权信息 */
export interface UserResource {
  /** 用户根文件夹ID */
  rootFolderToken: string;
  /** 周报归档文件夹ID */
  reportFolderToken: string;
  /** 月报汇总文件夹ID */
  monthFolderToken: string;
  /** 多维表格Base总Token */
  bitableBaseToken: string;
  /** 用户open_id */
  userOpenId?: string;
  
  /** 用户access_token（OAuth获取） */
  userAccessToken?: string;
  /** refresh_token（用于刷新access_token） */
  refreshToken?: string;
  /** access_token过期时间戳（Unix秒） */
  tokenExpiresAt?: number;
  /** 用户名称（用于文件夹命名） */
  userName?: string;
}

/** 用户资源存储接口 */
export interface UserResourceStore {
  /** 获取当前用户资源 */
  get(): Promise<UserResource | null>;
  /** 保存用户资源 */
  save(resource: UserResource): Promise<void>;
  /** 保存用户授权Token */
  saveUserToken?(accessToken: string, refreshToken: string, expiresIn: number): Promise<void>;
  /** 获取有效的access_token（自动判断是否需要刷新） */
  getValidAccessToken?(): Promise<string | null>;
  /** 获取refresh_token */
  getRefreshToken?(): Promise<string | null>;
  /** 清除用户授权Token */
  clearUserToken?(): Promise<void>;
  /** 判断资源是否已初始化（4个Token都有值） */
  exists(): Promise<boolean>;
  /** 判断用户是否已授权（access_token有效或有refresh_token） */
  isUserAuthorized?(): Promise<boolean>;
}
