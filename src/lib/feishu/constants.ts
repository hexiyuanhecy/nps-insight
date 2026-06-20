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
  /** 周期分析表 */
  ANALYSIS: 'analysis',
  /** 系统配置表 */
  CONFIG: 'config',
} as const;

export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES];

// ============================================
// 反馈表字段定义
// ============================================

/** 反馈表字段名 —— 与应用自建多维表格字段严格对应 */
export const FEEDBACK_FIELDS = {
  FEEDBACK_ID: '反馈ID',
  TENANT_ID: '租户ID',
  TENANT_NAME: '租户名称',
  TENANT_SCALE: '租户规模',
  USER_ID: '用户ID',
  USER_NAME: '用户名称',
  CREATE_TIME: '创建时间',
  MODULE: '模块',
  CONTENT: '反馈内容',
  NPS_SCORE: '评分',
  SOURCE: '来源',
  TAG1: 'Tag1',
  TAG2: 'Tag2',
  TAG3: 'Tag3',
  CONFIDENCE: '置信度',
  STATUS: '审核状态',
  TAG_TIME: '打标时间',
} as const;

/** 反馈表字段定义（用于自动建表） —— 与实际表结构一致 */
export const FEEDBACK_FIELD_DEFS: BitableField[] = [
  { field_name: FEEDBACK_FIELDS.FEEDBACK_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TENANT_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TENANT_NAME, field_type: 'Text' },
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
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.USER_ID, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.USER_NAME, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.CREATE_TIME, field_type: 'DateTime', property: { date_formatter: 'yyyy/MM/dd' } },
  { field_name: FEEDBACK_FIELDS.MODULE, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.CONTENT, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.NPS_SCORE, field_type: 'Number' },
  { field_name: FEEDBACK_FIELDS.SOURCE, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TAG1, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TAG2, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.TAG3, field_type: 'Text' },
  { field_name: FEEDBACK_FIELDS.CONFIDENCE, field_type: 'Number' },
  {
    field_name: FEEDBACK_FIELDS.STATUS,
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '待审核', color: 0 },
        { name: '已审核', color: 1 },
        { name: '无需审核', color: 2 },
      ],
    },
  },
  { field_name: FEEDBACK_FIELDS.TAG_TIME, field_type: 'DateTime', property: { date_formatter: 'yyyy/MM/dd HH:mm' } },
];

// ============================================
// 标签表字段定义
// ============================================

/** 标签表字段名 — 与多维表格实际字段严格对应 */
export const TAG_FIELDS = {
  TAG_ID: 'tagId',
  TAG1_NAME: 'Tag1名称',
  TAG2_NAME: 'Tag2名称',
  TAG3_NAME: 'Tag3名称',
  USAGE_COUNT: '使用次数',
  DEFINITION: '定义',
  STATUS: '状态',
  CREATED_BY: '创建人',
  CREATED_AT: '创建时间',
} as const;

/** 标签表字段定义（用于自动建表） */
export const TAG_FIELD_DEFS: BitableField[] = [
  { field_name: 'tagId', field_type: 'Text' },
  { field_name: 'Tag1名称', field_type: 'Text' },
  { field_name: 'Tag2名称', field_type: 'Text' },
  { field_name: 'Tag3名称', field_type: 'Text' },
  { field_name: '使用次数', field_type: 'Number' },
  { field_name: '定义', field_type: 'Text' },
  {
    field_name: '状态',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: 'active', color: 0 },
        { name: 'inactive', color: 1 },
      ],
    },
  },
  { field_name: '创建人', field_type: 'Text' },
  { field_name: '创建时间', field_type: 'DateTime' },
];

// ============================================
// 租户表字段定义
// ============================================

/** 租户表字段名 — 与多维表格实际字段严格对应 */
export const TENANT_FIELDS = {
  TENANT_ID: '租户ID',
  TENANT_NAME: '租户名称',
  SCALE: '规模',
  CONTACT: '联系人',
  CONTACT_EMAIL: '联系邮箱',
  LOG_PLATFORM: '日志平台',
  LOG_ENDPOINT: '日志端点',
  LOG_CREDENTIALS: '日志凭证',
  CREATED_AT: '创建时间',
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
      ],
    },
  },
  { field_name: '联系人', field_type: 'Text' },
  { field_name: '联系邮箱', field_type: 'Text' },
  { field_name: '日志平台', field_type: 'Text' },
  { field_name: '日志端点', field_type: 'Text' },
  { field_name: '日志凭证', field_type: 'Text' },
  { field_name: '创建时间', field_type: 'DateTime' },
];

// ============================================
// 周期分析表字段定义
// ============================================

/** 周期分析表字段名 */
export const ANALYSIS_FIELDS = {
  PERIOD_ID: '周期ID',
  PERIOD_NAME: '周期名称',
  START_DATE: '开始日期',
  END_DATE: '结束日期',
  TOTAL_FEEDBACKS: '总反馈数',
  NPS_SCORE: 'NPS得分',
  TOP_ISSUES: 'Top问题',
  ISSUE_KEY: '问题标识',
  TAG1: 'Tag1',
  TAG2: 'Tag2',
  TAG3: 'Tag3',
  TOTAL_COUNT: '累计数量',
  LARGE_TENANT_COUNT: '大租户数',
  LARGE_TENANT_RATIO: '大租户占比',
  AVG_SCORE: '平均分',
  COMPOSITE_SCORE: '综合评分',
  NEW_COUNT: '本月新增',
  STATUS: '状态',
  CREATED_AT: '创建时间',
} as const;

/** 周期分析表字段定义（用于自动建表） */
export const ANALYSIS_FIELD_DEFS: BitableField[] = [
  { field_name: '问题标识', field_type: 'Text' },
  { field_name: 'Tag1', field_type: 'Text' },
  { field_name: 'Tag2', field_type: 'Text' },
  { field_name: 'Tag3', field_type: 'Text' },
  { field_name: '累计数量', field_type: 'Number' },
  { field_name: '大租户数', field_type: 'Number' },
  { field_name: '大租户占比', field_type: 'Number' },
  { field_name: '平均分', field_type: 'Number' },
  { field_name: '综合评分', field_type: 'Number' },
  { field_name: '本月新增', field_type: 'Number' },
  {
    field_name: '状态',
    field_type: 'SingleSelect',
    property: {
      options: [
        { name: '待讨论', color: 0 },
        { name: '处理中', color: 1 },
        { name: '已解决', color: 2 },
      ],
    },
  },
];

// ============================================
// 系统配置表字段定义
// ============================================

/** 系统配置表字段名 */
export const CONFIG_FIELDS = {
  CONFIG_KEY: '配置键',
  CONFIG_VALUE: '配置值',
  DESCRIPTION: '描述',
  UPDATED_AT: '更新时间',
} as const;

/** 系统配置表字段定义（用于自动建表） */
export const CONFIG_FIELD_DEFS: BitableField[] = [
  { field_name: '配置键', field_type: 'Text' },
  { field_name: '配置值', field_type: 'Text' },
  { field_name: '描述', field_type: 'Text' },
  { field_name: '更新时间', field_type: 'DateTime' },
];

// ============================================
// 一级标签表字段定义
// ============================================

export const TAG1_FIELDS = {
  TAG_ID: 'tagId',
  NAME: '名称',
  DEFINITION: '定义',
  USAGE_COUNT: '使用次数',
  LARGE_TENANT_COUNT: '大租户数',
  LARGE_TENANT_RATIO: '大租户占比',
  STATUS: '状态',
  CREATED_BY: '创建人',
  CREATED_AT: '创建时间',
} as const;

export const TAG1_FIELD_DEFS: BitableField[] = [
{ field_name: 'tagId', field_type: 'Text' },
{ field_name: '名称', field_type: 'Text' },
{ field_name: '定义', field_type: 'Text' },
{ field_name: '使用次数', field_type: 'Number' },
{ field_name: '大租户数', field_type: 'Number' },
{ field_name: '大租户占比', field_type: 'Number' },
{ field_name: '状态', field_type: 'SingleSelect', property: { options: [{ name: 'active', color: 0 },{ name: 'inactive', color: 1 }] } },
{ field_name: '创建人', field_type: 'Text' },
{ field_name: '创建时间', field_type: 'DateTime' },
];

// ============================================
// 二级标签表字段定义
// ============================================

export const TAG2_FIELDS = {
  TAG_ID: 'tagId',
  NAME: '名称',
  DEFINITION: '定义',
  USAGE_COUNT: '使用次数',
  LARGE_TENANT_COUNT: '大租户数',
  LARGE_TENANT_RATIO: '大租户占比',
  STATUS: '状态',
  CREATED_BY: '创建人',
  CREATED_AT: '创建时间',
} as const;

export const TAG2_FIELD_DEFS: BitableField[] = [
{ field_name: 'tagId', field_type: 'Text' },
{ field_name: '名称', field_type: 'Text' },
{ field_name: '定义', field_type: 'Text' },
{ field_name: '使用次数', field_type: 'Number' },
{ field_name: '大租户数', field_type: 'Number' },
{ field_name: '大租户占比', field_type: 'Number' },
{ field_name: '状态', field_type: 'SingleSelect', property: { options: [{ name: 'active', color: 0 },{ name: 'inactive', color: 1 }] } },
{ field_name: '创建人', field_type: 'Text' },
{ field_name: '创建时间', field_type: 'DateTime' },
];

// ============================================
// 三级标签表字段定义
// ============================================

export const TAG3_FIELDS = {
  TAG_ID: 'tagId',
  NAME: '名称',
  DEFINITION: '定义',
  USAGE_COUNT: '使用次数',
  LARGE_TENANT_COUNT: '大租户数',
  LARGE_TENANT_RATIO: '大租户占比',
  STATUS: '状态',
  CREATED_BY: '创建人',
  CREATED_AT: '创建时间',
} as const;

export const TAG3_FIELD_DEFS: BitableField[] = [
{ field_name: 'tagId', field_type: 'Text' },
{ field_name: '名称', field_type: 'Text' },
{ field_name: '定义', field_type: 'Text' },
{ field_name: '使用次数', field_type: 'Number' },
{ field_name: '大租户数', field_type: 'Number' },
{ field_name: '大租户占比', field_type: 'Number' },
{ field_name: '状态', field_type: 'SingleSelect', property: { options: [{ name: 'active', color: 0 },{ name: 'inactive', color: 1 }] } },
{ field_name: '创建人', field_type: 'Text' },
{ field_name: '创建时间', field_type: 'DateTime' },
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
  [TABLE_NAMES.ANALYSIS]: {
    name: 'Top问题表',
    fields: ANALYSIS_FIELD_DEFS,
  },
  [TABLE_NAMES.CONFIG]: {
    name: '配置表',
    fields: CONFIG_FIELD_DEFS,
  },
};

// ============================================
// 飞书API常量
// ============================================

/** 飞书API域名 */
export const FEISHU_API_DOMAIN = 'https://open.feishu.cn';

/** 飞书API版本 */
export const FEISHU_API_VERSION = 'v1';

/** 消息卡片模板版本 */
export const CARD_TEMPLATE_VERSION = '1.0.0';


