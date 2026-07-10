/**
 * 应用全局常量定义
 * 所有在多处使用的魔法数字、字符串统一在此定义
 */

// ============================================
// 分页 & 批量大小
// ============================================

/** 多维表格默认分页大小 */
export const DEFAULT_PAGE_SIZE = 500;

/** 大数据量分页大小（用于全量同步） */
export const LARGE_PAGE_SIZE = 5000;

/** AI 打标默认每批处理条数 */
export const DEFAULT_BATCH_SIZE = 20;

/** Mock 数据默认生成条数 */
export const DEFAULT_MOCK_COUNT = 100;

// ============================================
// Top N 数量
// ============================================

/** Top 问题默认展示数量 */
export const DEFAULT_TOP_N = 5;

// ============================================
// 时间相关常量（毫秒）
// ============================================

/** 1 秒 = 1000 毫秒 */
export const MILLISECONDS_PER_SECOND = 1000;

/** 1 分钟 = 60 秒 */
export const SECONDS_PER_MINUTE = 60;

/** 1 小时 = 60 分钟 */
export const MINUTES_PER_HOUR = 60;

/** 1 天 = 24 小时 */
export const HOURS_PER_DAY = 24;

/** 1 天的毫秒数 */
export const MILLISECONDS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

/** 1 天的秒数 */
export const SECONDS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/** 5 分钟的毫秒数（用于缓存 TTL 等） */
export const FIVE_MINUTES_MS = 5 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

// ============================================
// 超时时间（毫秒）
// ============================================

/** 短超时（用于快速检查等） */
export const TIMEOUT_SHORT_MS = 3 * MILLISECONDS_PER_SECOND; // 3 秒

/** 中等超时（用于单次 API 调用等） */
export const TIMEOUT_MEDIUM_MS = 15 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND; // 15 秒

/** 长超时（用于同步任务等） */
export const TIMEOUT_LONG_MS = 30 * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND; // 30 秒

// ============================================
// 时间设置
// ============================================

/** 一天中最后一秒的时间设置（23:59:59.999） */
export const END_OF_DAY = { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 };

// ============================================
// Token 相关
// ============================================

/** Token 自动刷新阈值（秒），剩余时间小于此值时自动刷新 */
export const TOKEN_REFRESH_THRESHOLD_SECONDS = 10 * SECONDS_PER_MINUTE; // 10 分钟

// ============================================
// HTTP 状态码
// ============================================

/** HTTP 状态码：未授权 */
export const HTTP_STATUS_UNAUTHORIZED = 401;

/** HTTP 状态码：服务器错误 */
export const HTTP_STATUS_INTERNAL_ERROR = 500;

// ============================================
// Mock 数据
// ============================================

/** Mock 反馈 ID 前缀 */
export const MOCK_FEEDBACK_ID_PREFIX = 'MOCK';

/** 无意义反馈的原文 */
export const MOCK_IRRELEVANT_FEEDBACK_TEXT = '无意义反馈';

/** Mock 批处理大小（用于 Mock 场景的 AI 打标） */
export const MOCK_BATCH_SIZE = 20;

/** Mock 反馈 ID 序列号上限（Math.random() * 1000，即 0-999） */
export const MOCK_MAX_FEEDBACK_SEQ = 1000;

/** Mock 租户 ID 序列号上限（Math.random() * 999，即 0-998） */
export const MOCK_MAX_TENANT_SEQ = 999;

/** Mock 用户 ID 序列号上限（Math.random() * 9999，即 0-9998） */
export const MOCK_MAX_USER_SEQ = 9999;

/** Mock 日期月份上限（Math.random() * 6 + 1，即 1-6 月） */
export const MOCK_MAX_MONTH = 6;

/** Mock 日期天数上限（Math.random() * 28 + 1，即 1-28 日） */
export const MOCK_MAX_DAY = 28;

// ============================================
// 工具函数
// ============================================

/**
 * 获取当前 Unix 时间戳（秒）
 */
export function getCurrentTimestampSeconds(): number {
  return Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
}
