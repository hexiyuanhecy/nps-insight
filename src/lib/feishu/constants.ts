/**
 * 飞书多维表格常量定义
 * 包含所有表名、字段名、字段类型等常量
 */

import { BitableField } from '@/lib/types';

// ============================================
// 表名定义
// ============================================

/** 多维表格中的表名称 */
export const TABLE_NAMES = {
  /** 反馈列表表 */
  FEEDBACK: 'feedback',
  /** 标签体系表 */
  TAGS: 'tags',
  /** 一级标签表 */
  TAG1: 'tag1',
  /** 二级标签表 */
  TAG2: 'tag2',
  /** 三级标签表 */
  TAG3: 'tag3',

  /** 租户信息表 */
  TENANTS: 'tenants',
  /** Top问题表 */
  TOP_ISSUES: 'top_issues',
  /** 周期分析表（用于存储分析报告） */
  ANALYSIS: 'analysis',
} as const;

export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES];

// ============================================
// 反馈表字段定义
// ============================================

/** 反馈表字段名 —— 与实际飞书表格字段对应 */
export const FEEDBACK_FIELDS = {
  FEEDBACK_ID: '反馈ID',
  TENANT_ID: '租户ID',
  TENANT_NAME: '租户名称',
  TENANT_SCALE: '租户规模',
  USER_ID: '用户ID',
  CREATE_TIME: '创建时间',
  UNSATISFACTION_REASON: '不满意原因',
  CONTENT: '反馈原文',
  TRANSLATED_CONTENT: '翻译后文本',
  TAG1: 'tag1',
  TAG2: 'tag2',
  TAG3: 'tag3',
  NPS_SCORE: '评分',
  SOURCE: '反馈平台',
  CONFIDENCE: 'AI 置信度',
  NEED_LOG_CHECK: '需查日志',
  REVIEW_NEEDED: '待审核',
  STATUS: '打标状态',
} as const;

/** 反馈表字段定义（用于自动建表）—— 与目标多维表格"反馈列表"表严格对齐 */
export const FEEDBACK_FIELD_DEFS: BitableField[] = [
  { field_name: FEEDBACK_FIELDS.FEEDBACK_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TENANT_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TENANT_NAME, field_type: 'AutoNumber' },
  {
    field_name: FEEDBACK_FIELDS.TENANT_SCALE,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: 'A1', color: 0 },
        { name: 'A2', color: 1 },
        { name: 'A3', color: 2 },
        { name: 'A4', color: 3 },
        { name: 'A5', color: 4 },
        { name: 'A6', color: 5 },
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.USER_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.CREATE_TIME, field_type: 'DateTime', property: { date_formatter: 'yyyy/MM/dd' } },
  {
    field_name: FEEDBACK_FIELDS.UNSATISFACTION_REASON,
    field_type: 'MultiSelect',
    property: {
      options: [
        { name: '系统卡顿', color: 0 },
        { name: '界面不美观', color: 1 },
        { name: '功能缺失', color: 2 },
        { name: '打开速度慢', color: 3 },
        { name: '其他', color: 4 },
        { name: '缺少功能', color: 5 },
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.CONTENT, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TRANSLATED_CONTENT, field_type: 'Text' },
  {
    field_name: FEEDBACK_FIELDS.TAG1,
    field_type: 'MultiSelect',
    property: {
      options: [
        { name: '疑似Bug', color: 0 },
        { name: '功能优化', color: 1 },
        { name: '界面改进', color: 2 },
        { name: '性能提升', color: 3 },
        { name: '用户教育', color: 4 },
        { name: '安全合规', color: 5 },
        { name: '无效反馈', color: 6 },
        { name: '细节优化', color: 7 },
      ],
    },
  },
  {
    field_name: FEEDBACK_FIELDS.TAG2,
    field_type: 'MultiSelect',
    property: {
      options: [
        { name: '通用体验', color: 0 },
        { name: '稳定性', color: 1 },
        { name: '性能', color: 2 },
        { name: 'UI/UX', color: 3 },
        { name: '易用性', color: 4 },
        { name: '竞争力', color: 5 },
        { name: '满意度', color: 6 },
        { name: '功能性', color: 7 },
        { name: '体验优化', color: 8 },
        { name: '产品竞争力', color: 9 },
        { name: '用户体验', color: 0 },
        { name: '产品优化', color: 1 },
        { name: '功能价值', color: 2 },
        { name: 'UI/UX设计', color: 3 },
        { name: '竞品对比', color: 4 },
        { name: '整体体验', color: 5 },
        { name: '整体稳定性', color: 6 },
        { name: 'UI设计', color: 7 },
        { name: '产品体验', color: 8 },
        { name: '细节优化', color: 9 },
        { name: '功能实用性', color: 0 },
        { name: '细节体验', color: 1 },
        { name: '系统稳定性', color: 2 },
        { name: '功能稳定性', color: 3 },
        { name: '价值认可', color: 4 },
        { name: '性能表现', color: 5 },
        { name: '功能体验', color: 6 },
        { name: '市场竞争力', color: 7 },
      ],
    },
  },
  {
    field_name: FEEDBACK_FIELDS.TAG3,
    field_type: 'MultiSelect',
    property: {
      options: [
        { name: '不好用', color: 0 },
        { name: '太卡', color: 1 },
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.NPS_SCORE, field_type: 'Number', property: { formatter: '0.0' } },
  {
    field_name: FEEDBACK_FIELDS.SOURCE,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '管理后台', color: 0 },
        { name: '请假员工端', color: 1 },
        { name: '打卡小程序', color: 2 },
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.CONFIDENCE, field_type: 'Number', property: { formatter: '0.0' } },
  { field_name: FEEDBACK_FIELDS.NEED_LOG_CHECK, field_type: 'Textarea' },
  { field_name: FEEDBACK_FIELDS.REVIEW_NEEDED, field_type: 'Textarea' },
  {
    field_name: FEEDBACK_FIELDS.STATUS,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '未打标', color: 0 },
        { name: '已打标', color: 1 },
      ],
    },
  },
];

// ============================================
// 标签表字段定义
// ============================================

/** 标签表字段名 — 与多维表格实际字段严格对应 */
export const TAG_FIELDS = {
  TAG_ID: 'tagId',
  TAG_NAME: 'tagName',
  DESC: 'desc',
  COUNT: 'count',
} as const;

/** 标签表字段定义（用于自动建表） */
export const TAG_FIELD_DEFS: BitableField[] = [
  { field_name: 'tagId', field_type: 'Text' },
  { field_name: 'tagName', field_type: 'Text' },
  { field_name: 'desc', field_type: 'Text' },
  { field_name: 'count', field_type: 'AutoNumber' },
];

// ============================================
// 租户表字段定义
// ============================================

/** 租户表字段名 — 与多维表格实际字段严格对应 */
export const TENANT_FIELDS = {
  TENANT_ID: '租户ID',
  TENANT_NAME: '租户名称',
  SCALE: '规模',
  IS_ENTERPRISE: '是否企业版',
  CONTACT: '联系人',
  CONTACT_EMAIL: '联系邮箱',
} as const;

/** 租户表字段定义（用于自动建表） */
export const TENANT_FIELD_DEFS: BitableField[] = [
  { field_name: '租户ID', field_type: 'Text' },
  { field_name: '租户名称', field_type: 'Text' },
  {
    field_name: '规模',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: 'A1', color: 0 },
        { name: 'A2', color: 1 },
        { name: 'A3', color: 2 },
        { name: 'A4', color: 3 },
        { name: 'A5', color: 4 },
        { name: 'A6', color: 5 },
      ],
    },
  },
  { field_name: '是否企业版', field_type: 'Textarea' },
  { field_name: '联系人', field_type: 'Text' },
  { field_name: '联系邮箱', field_type: 'Text' },
];

// ============================================
// 周期分析表字段定义
// ============================================

/** Top问题表字段名 —— 与目标多维表格"top 问题表"严格对应（共15个字段） */
export const TOP_ISSUES_FIELDS = {
  INDEX: 'index',
  MODULE: '所属模块',
  TAG2: 'tag2',
  TAG3: 'tag3',
  TOTAL_COUNT: '总反馈数',
  A4_COUNT: 'A4反馈数',
  A5_COUNT: 'A5反馈数',
  A6_COUNT: 'A6反馈数',
  LARGE_TENANT_COUNT: '大租户反馈数',
  LARGE_TENANT_RATIO: '大租户占比',
  MANUAL_PRIORITY: '人工排序',
  OWNER: '负责人',
  RESOLUTION: '解决方案',
  STATUS: '状态',
  ITERATION_PERIOD: '迭代周期',
} as const;

/** Top问题表字段定义（用于自动建表）—— 与目标多维表格"top 问题表"严格对齐（共15个字段） */
export const TOP_ISSUES_FIELD_DEFS: BitableField[] = [
  { field_name: TOP_ISSUES_FIELDS.INDEX, field_type: 'Text' },
  { field_name: TOP_ISSUES_FIELDS.MODULE, field_type: 'AutoNumber' },
  {
    field_name: TOP_ISSUES_FIELDS.TAG2,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '通用体验', color: 0 },
        { name: '稳定性', color: 1 },
        { name: '性能', color: 2 },
        { name: 'UI/UX', color: 3 },
        { name: '易用性', color: 4 },
        { name: '竞争力', color: 5 },
        { name: '满意度', color: 6 },
        { name: '功能性', color: 7 },
        { name: '体验优化', color: 8 },
        { name: '产品竞争力', color: 9 },
        { name: '用户体验', color: 0 },
        { name: '产品优化', color: 1 },
        { name: '功能价值', color: 2 },
        { name: 'UI/UX设计', color: 3 },
        { name: '竞品对比', color: 4 },
        { name: '整体体验', color: 5 },
        { name: '整体稳定性', color: 6 },
        { name: 'UI设计', color: 7 },
        { name: '产品体验', color: 8 },
        { name: '细节优化', color: 9 },
        { name: '功能实用性', color: 0 },
        { name: '细节体验', color: 1 },
        { name: '系统稳定性', color: 2 },
        { name: '功能稳定性', color: 3 },
        { name: '价值认可', color: 4 },
        { name: '性能表现', color: 5 },
        { name: '功能体验', color: 6 },
        { name: '市场竞争力', color: 7 },
      ],
    },
  },
  { field_name: TOP_ISSUES_FIELDS.TAG3, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.TOTAL_COUNT, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.A4_COUNT, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.A5_COUNT, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.A6_COUNT, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.LARGE_TENANT_COUNT, field_type: 'AutoNumber' },
  { field_name: TOP_ISSUES_FIELDS.LARGE_TENANT_RATIO, field_type: 'Formula' },
  { field_name: TOP_ISSUES_FIELDS.MANUAL_PRIORITY, field_type: 'Number', property: { formatter: '0.0' } },
  { field_name: TOP_ISSUES_FIELDS.OWNER, field_type: 'Text' },
  { field_name: TOP_ISSUES_FIELDS.RESOLUTION, field_type: 'Text' },
  {
    field_name: TOP_ISSUES_FIELDS.STATUS,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '待讨论', color: 0 },
        { name: '已排期', color: 1 },
        { name: '已上线', color: 2 },
        { name: '验证中', color: 3 },
      ],
    },
  },
  {
    field_name: TOP_ISSUES_FIELDS.ITERATION_PERIOD,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: 'Sprint 1', color: 0 },
        { name: 'Sprint 2', color: 1 },
        { name: 'Sprint 3+', color: 2 },
        { name: '待定', color: 3 },
      ],
    },
  },
];

// ============================================
// 一级标签表字段定义
// ============================================

export const TAG1_FIELDS = {
  TAG_ID: 'tagId',
  TAG_NAME: 'tagName',
  DESC: 'desc',
  COUNT: 'count',
} as const;

export const TAG1_FIELD_DEFS: BitableField[] = [
  { field_name: 'tagId', field_type: 'Text' },
  {
    field_name: 'tagName',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '疑似Bug', color: 0 },
        { name: '功能优化', color: 1 },
        { name: '界面改进', color: 2 },
        { name: '性能提升', color: 3 },
        { name: '用户教育', color: 4 },
        { name: '安全合规', color: 5 },
        { name: '无效反馈', color: 6 },
      ],
    },
  },
  { field_name: 'desc', field_type: 'Text' },
  { field_name: 'count', field_type: 'AutoNumber' },
];

// ============================================
// 二级标签表字段定义
// ============================================

export const TAG2_FIELDS = {
  TAG_ID: 'tagId',
  TAG_NAME: 'tagName',
  DESC: 'desc',
  COUNT: 'count',
} as const;

export const TAG2_FIELD_DEFS: BitableField[] = [
  { field_name: 'tagId', field_type: 'Text' },
  {
    field_name: 'tagName',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '通用体验', color: 0 },
        { name: '稳定性', color: 1 },
        { name: '性能', color: 2 },
        { name: 'UI/UX', color: 3 },
        { name: '易用性', color: 4 },
        { name: '竞争力', color: 5 },
        { name: '满意度', color: 6 },
        { name: '功能性', color: 7 },
        { name: '体验优化', color: 8 },
        { name: '产品竞争力', color: 9 },
        { name: '用户体验', color: 0 },
        { name: '产品优化', color: 1 },
        { name: '功能价值', color: 2 },
        { name: 'UI/UX设计', color: 3 },
        { name: '竞品对比', color: 4 },
        { name: '整体体验', color: 5 },
        { name: '整体稳定性', color: 6 },
        { name: 'UI设计', color: 7 },
        { name: '产品体验', color: 8 },
        { name: '细节优化', color: 9 },
        { name: '功能实用性', color: 0 },
        { name: '细节体验', color: 1 },
        { name: '系统稳定性', color: 2 },
        { name: '功能稳定性', color: 3 },
        { name: '价值认可', color: 4 },
        { name: '性能表现', color: 5 },
        { name: '功能体验', color: 6 },
        { name: '市场竞争力', color: 7 },
      ],
    },
  },
  { field_name: 'desc', field_type: 'Text' },
  { field_name: 'count', field_type: 'AutoNumber' },
];

// ============================================
// 三级标签表字段定义
// ============================================

export const TAG3_FIELDS = {
  TAG_ID: 'tagId',
  TAG_NAME: 'tagName',
  DESC: 'desc',
  COUNT: 'count',
} as const;

export const TAG3_FIELD_DEFS: BitableField[] = [
  { field_name: 'tagId', field_type: 'Text' },
  {
    field_name: 'tagName',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '不好用', color: 0 },
        { name: '太卡', color: 1 },
      ],
    },
  },
  { field_name: 'desc', field_type: 'Text' },
  { field_name: 'count', field_type: 'AutoNumber' },
];
// ============================================
// 表结构汇总（用于自动建表）
// ============================================

/** 所有表的结构定义 */
export const TABLE_DEFINITIONS: Record<string, { name: string; fields: BitableField[] }> = {
  [TABLE_NAMES.FEEDBACK]: {
    name: '反馈表',
    fields: FEEDBACK_FIELD_DEFS,
  },
  [TABLE_NAMES.TAG1]: {
    name: "Tag1表",
    fields: TAG1_FIELD_DEFS,
  },
  [TABLE_NAMES.TAG2]: {
    name: "Tag2表",
    fields: TAG2_FIELD_DEFS,
  },
  [TABLE_NAMES.TAG3]: {
    name: "Tag3表",
    fields: TAG3_FIELD_DEFS,
  },

  [TABLE_NAMES.TENANTS]: {
    name: '租户表',
    fields: TENANT_FIELD_DEFS,
  },
  [TABLE_NAMES.TOP_ISSUES]: {
    name: 'Top问题表',
    fields: TOP_ISSUES_FIELD_DEFS,
  },
};

/** 周期分析表字段名（用于存储分析报告） */
export const ANALYSIS_FIELDS = {
  PERIOD_NAME: '周期名称',
  TOTAL_FEEDBACKS: '总反馈数',
  NPS_SCORE: 'NPS得分',
  TOP_ISSUES: '主要问题',
  START_DATE: '开始日期',
  END_DATE: '结束日期',
  CREATED_AT: '创建时间',
} as const;

// Alias for backward compatibility
export const TABLE_NAMES_ANALYSIS = TABLE_NAMES.TOP_ISSUES;

// ============================================
// 飞书API常量
// ============================================

/** 飞书API域名 */
export const FEISHU_API_DOMAIN = 'https://open.feishu.cn';

/** 飞书API版本 */
export const FEISHU_API_VERSION = 'v1';

/** 消息卡片模板版本 */
export const CARD_TEMPLATE_VERSION = '1.0.0';


