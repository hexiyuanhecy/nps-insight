/**
 * AI 输出结构 Zod Schema 定义
 * 用于替代裸 JSON.parse，提供强类型与运行时校验
 */

import { z } from 'zod';

// ============================================
// 批量打标结果 Schema
// ============================================

/** 单条反馈打标结果 Schema */
const TaggingItemSchema = z.object({
  /** 反馈 ID（批量场景使用） */
  id: z.string().optional(),
  /** 一级标签列表 */
  tag1: z.array(z.string()),
  /** 二级标签列表 */
  tag2: z.array(z.string()),
  /** 三级标签列表 */
  tag3: z.array(z.string()),
  /** 置信度，范围 0-1 */
  confidence: z.number().min(0).max(1),
  /** 是否需要查日志 */
  needLogCheck: z.boolean(),
  /** 翻译后的内容（非中文反馈时填充） */
  translatedContent: z.string(),
});

/** AI 批量打标返回结构 Schema */
export const BatchTaggingResultSchema = z.object({
  results: z.array(TaggingItemSchema),
});

/** 批量打标结果类型推导 */
export type BatchTaggingResult = z.infer<typeof BatchTaggingResultSchema>;

// ============================================
// 标签进化结果 Schema
// ============================================

/** 标签合并组 Schema */
const MergeGroupSchema = z.object({
  /** 待合并的标签 ID 列表 */
  merge_group: z.array(z.string()),
  /** 保留的主标签 ID */
  retain_tag_id: z.string(),
  /** 合并依据描述 */
  reason: z.string(),
});

/** Tag3 拆分生成新 Tag2 项 Schema */
const SplitItemSchema = z.object({
  /** 原 Tag2 ID */
  origin_tag2_id: z.string(),
  /** 新生成的 Tag2 列表 */
  new_tag2_list: z.array(
    z.object({
      /** 新 Tag2 名称 */
      new_tag2_name: z.string(),
      /** 绑定的 Tag3 ID 列表 */
      bind_tag3_ids: z.array(z.string()),
    })
  ),
});

/** 标签进化 AI 返回结构 Schema */
export const TagEvolutionResultSchema = z.object({
  tag3_opt_result: z.object({
    merge_tag3: z.array(MergeGroupSchema),
    split_tag3_to_new_tag2: z.array(SplitItemSchema),
  }),
  tag2_opt_result: z.object({
    merge_tag2: z.array(MergeGroupSchema),
  }),
  manual_review: z.array(z.string()),
});

/** 标签进化结果类型推导 */
export type TagEvolutionResult = z.infer<typeof TagEvolutionResultSchema>;

// ============================================
// ChatBot 意图识别结果 Schema
// ============================================

/** ChatBot 支持的意图类型 */
const QueryIntentSchema = z.enum([
  'nps_overview',
  'score_distribution',
  'top_issues',
  'recent_feedback',
  'tag_stats',
  'trend_analysis',
  'specific_feedback',
  'help',
  'unknown',
]);

/** ChatBot 意图识别结果 Schema */
export const IntentResultSchema = z.object({
  /** 识别出的意图类型 */
  intent: QueryIntentSchema,
  /** 意图参数 */
  params: z.object({
    /** 时间范围 */
    timeRange: z.string().optional(),
    /** 标签过滤 */
    tagFilter: z.string().optional(),
    /** 评分过滤 */
    scoreFilter: z.string().optional(),
    /** 数量限制 */
    limit: z.number().optional(),
    /** 关键词列表 */
    keywords: z.array(z.string()).optional(),
  }),
  /** 置信度，范围 0-1 */
  confidence: z.number().min(0).max(1),
});

/** 意图识别结果类型推导 */
export type IntentResult = z.infer<typeof IntentResultSchema>;
