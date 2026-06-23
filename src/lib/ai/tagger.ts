/**
 * AI打标引擎（PRD v6.0）
 * 流程：语言检测 → Tag3 → Tag2 → Tag1 → 置信度 → needLogCheck
 * 支持标签缓存复用，避免每批重复查询
 */

import { chatCompletionJSON } from './index';
import { generateBatchTaggingPrompt } from './prompts';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';

// ============================================
// 类型定义
// ============================================

export interface AITagResult {
  tag1: string[];
  tag2: string[];
  tag3: string[];
  confidence: number;
  needLogCheck: boolean;
  reviewNeeded: boolean;
  translatedContent: string;
}

export interface TagRecord {
  tagId: string;
  tag1Name: string;
  tag2Name: string;
  tag3Name: string;
  usageCount: number;
  recordId: string;
  table?: 'tag1' | 'tag2' | 'tag3';
}

// ============================================
// 标签缓存
// ============================================

let _tagCache: TagRecord[] | null = null;
let _tagCacheTime = 0;
const TAG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 获取已有标签（带缓存）
 */
export async function getCachedTags(): Promise<TagRecord[]> {
  const now = Date.now();
  if (_tagCache && now - _tagCacheTime < TAG_CACHE_TTL_MS) {
    return _tagCache;
  }
  _tagCache = await getAllTags();
  _tagCacheTime = now;
  return _tagCache;
}

/**
 * 清除标签缓存
 */
export function invalidateTagCache(): void {
  _tagCache = null;
  _tagCacheTime = 0;
}

// ============================================
// 单条反馈打标
// ============================================

/**
 * 对单条反馈进行AI打标
 */
export async function analyzeFeedback(
  content: string,
  unsatisfactoryReason: string,
  source: string,
  existingTags: TagRecord[],
  confidenceThreshold: number
): Promise<AITagResult> {
  const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
  const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
  const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);

  const prompt = generateBatchTaggingPrompt(
    [{ id: '0', content, score: 0, source, unsatisfactoryReason }],
    tag1List, tag2List, tag3List, confidenceThreshold
  );

  const result = await chatCompletionJSON<Array<{
    tag1: string[];
    tag2: string[];
    tag3: string[];
    confidence: number;
    needLogCheck: boolean;
    translatedContent: string;
  }>>([{ role: 'user', content: prompt }], { temperature: 0.3 });

  // result 是数组，取第一条
  const raw = result?.[0] || {};
  return normalizeTagResult(raw, confidenceThreshold);
}

// ============================================
// 批量反馈打标
// ============================================

/**
 * 批量对一组反馈进行AI打标
 * @param batch 反馈数组（每条含 record_id, content, score, source, unsatReason）
 * @param existingTags 已有标签（用于 prompt 注入）
 * @param confidenceThreshold 置信度阈值
 * @returns 打标结果数组，与 batch 一一对应
 */
export async function batchAnalyzeFeedbacks(
  batch: Array<{
    record_id: string;
    content: string;
    score: number;
    source: string;
    unsatReason: string;
  }>,
  existingTags: TagRecord[],
  confidenceThreshold: number = 0.8
): Promise<Array<{ success: boolean; result?: AITagResult; recordId: string }>> {
  const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
  const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
  const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);

  const inputs = batch
    .filter(f => f.content)
    .map((fb, idx) => ({
      id: String(idx),
      content: fb.content,
      score: fb.score,
      source: fb.source,
      unsatisfactoryReason: fb.unsatReason,
    }));

  if (inputs.length === 0) {
    return batch.map(fb => ({ success: false, recordId: fb.record_id }));
  }

  const prompt = generateBatchTaggingPrompt(inputs, tag1List, tag2List, tag3List, confidenceThreshold);

  try {
    const result = await chatCompletionJSON<Array<{
      tag1: string[];
      tag2: string[];
      tag3: string[];
      confidence: number;
      needLogCheck: boolean;
      translatedContent: string;
    }>>([{ role: 'user', content: prompt }], { temperature: 0.3 });

    return batch.map((fb, idx) => {
      const raw = inputs[idx] ? result?.[idx] : {};
      const normalized = normalizeTagResult(raw || { tag1: [] as string[], tag2: [] as string[], tag3: [] as string[], confidence: 0, needLogCheck: false, translatedContent: '' } as any, confidenceThreshold);
      return { success: true, result: normalized, recordId: fb.record_id };
    });
  } catch (error) {
    console.error('[Tagger] 批量打标失败:', error);
    return batch.map(fb => ({ success: false, recordId: fb.record_id }));
  }
}

// ============================================
// 完整打标流程
// ============================================

/**
 * 完整打标流程：AI分析 → 标签查找/创建 → 写入反馈记录
 */
export async function completeTaggingProcess(
  feedbackId: string,
  content: string,
  score: number,
  module: string,
  unsatisfactoryReason: string,
  source: string,
  recordId: string,
  confidenceThreshold: number = 0.8
): Promise<{ success: boolean; result?: AITagResult; newTagsCreated: number }> {
  try {
    console.log(`[Tagger] 开始处理反馈: ${feedbackId}`);

    // 1. 获取已有标签
    const existingTags = await getCachedTags();

    // 2. AI打标
    console.log(`[Tagger] 步骤1: AI分析反馈内容`);
    const aiResult = await analyzeFeedback(content, unsatisfactoryReason, source, existingTags, confidenceThreshold);
    console.log(`[Tagger] AI分析结果: tag1=${aiResult.tag1}, tag2=${aiResult.tag2}, tag3=${aiResult.tag3}, confidence=${aiResult.confidence}`);

    // 3. 创建/更新标签
    console.log(`[Tagger] 步骤2: 创建/更新标签`);
    let newTagsCreated = 0;
    for (const tag1 of aiResult.tag1) {
      await ensureTagExists(tag1, null, null, 'tag1');
      newTagsCreated++;
    }
    for (const tag2 of aiResult.tag2) {
      await ensureTagExists(null, tag2, null, 'tag2');
      newTagsCreated++;
    }
    for (const tag3 of aiResult.tag3) {
      await ensureTagExists(null, null, tag3, 'tag3');
      newTagsCreated++;
    }

    // 4. 更新反馈记录
    console.log(`[Tagger] 步骤3: 更新反馈记录`);
    await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, recordId, {
      [FEEDBACK_FIELDS.TAG1]: aiResult.tag1,
      [FEEDBACK_FIELDS.TAG2]: aiResult.tag2,
      [FEEDBACK_FIELDS.TAG3]: aiResult.tag3,
      [FEEDBACK_FIELDS.CONFIDENCE]: aiResult.confidence,
      [FEEDBACK_FIELDS.NEED_LOG_CHECK]: aiResult.needLogCheck,
      [FEEDBACK_FIELDS.REVIEW_NEEDED]: aiResult.reviewNeeded,
      [FEEDBACK_FIELDS.TRANSLATED_CONTENT]: aiResult.translatedContent || '',
      [FEEDBACK_FIELDS.STATUS]: '已打标',
    });

    console.log(`[Tagger] 打标完成: ${feedbackId}`);
    return { success: true, result: aiResult, newTagsCreated };
  } catch (error) {
    console.error(`[Tagger] 打标失败: ${feedbackId}`, error);
    return { success: false, newTagsCreated: 0 };
  }
}

/**
 * 确保标签存在于标签体系表中
 */
async function ensureTagExists(
  tag1Name: string | null,
  tag2Name: string | null,
  tag3Name: string | null,
  level: 'tag1' | 'tag2' | 'tag3'
): Promise<void> {
  const existing = await getAllTags();
  const table = TABLE_NAMES.TAG1;

  if (level === 'tag1') {
    const found = existing.find(t => t.tag1Name === tag1Name);
    if (!found) {
      await bitableClient.createRecord(table, {
        [TAG_FIELDS.TAG_ID]: `tag1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        [TAG_FIELDS.TAG1_NAME]: tag1Name!,
        [TAG_FIELDS.USAGE_COUNT]: 1,
      });
    } else {
      await bitableClient.updateRecord(table, found.recordId!, {
        [TAG_FIELDS.USAGE_COUNT]: found.usageCount + 1,
      });
    }
  } else if (level === 'tag2') {
    const found = existing.find(t => t.tag2Name === tag2Name);
    if (!found) {
      await bitableClient.createRecord(table, {
        [TAG_FIELDS.TAG_ID]: `tag2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        [TAG_FIELDS.TAG2_NAME]: tag2Name!,
        [TAG_FIELDS.USAGE_COUNT]: 1,
      });
    } else {
      await bitableClient.updateRecord(table, found.recordId!, {
        [TAG_FIELDS.USAGE_COUNT]: found.usageCount + 1,
      });
    }
  } else {
    const found = existing.find(t => t.tag3Name === tag3Name);
    if (!found) {
      await bitableClient.createRecord(table, {
        [TAG_FIELDS.TAG_ID]: `tag3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        [TAG_FIELDS.TAG3_NAME]: tag3Name!,
        [TAG_FIELDS.USAGE_COUNT]: 1,
      });
    } else {
      await bitableClient.updateRecord(table, found.recordId!, {
        [TAG_FIELDS.USAGE_COUNT]: found.usageCount + 1,
      });
    }
  }
}

// ============================================
// 标签管理
// ============================================

/**
 * 获取所有标签
 */
export async function getAllTags(): Promise<TagRecord[]> {
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TAGS, { pageSize: 500 });
    return records.map((record) => ({
      tagId: String(record.fields[TAG_FIELDS.TAG_ID] || ''),
      tag1Name: String(record.fields[TAG_FIELDS.TAG1_NAME] || ''),
      tag2Name: String(record.fields[TAG_FIELDS.TAG2_NAME] || ''),
      tag3Name: String(record.fields[TAG_FIELDS.TAG3_NAME] || ''),
      usageCount: Number(record.fields[TAG_FIELDS.USAGE_COUNT] || 0),
      recordId: record.record_id,
    }));
  } catch (error) {
    console.error('[Tagger] 获取标签失败', error);
    return [];
  }
}

// ============================================
// 工具函数
// ============================================

function normalizeTagResult(
  raw: {
    tag1: string[];
    tag2: string[];
    tag3: string[];
    confidence: number;
    needLogCheck: boolean;
    translatedContent: string;
  },
  confidenceThreshold: number
): AITagResult {
  const confidence = Math.max(0, Math.min(1, raw.confidence || 0.5));
  const reviewNeeded = confidence < confidenceThreshold || raw.tag1.length === 0 || raw.tag2.length === 0 || raw.tag3.length === 0;

  return {
    tag1: (raw.tag1 || ['未分类']).filter(Boolean),
    tag2: (raw.tag2 || ['未分类']).filter(Boolean),
    tag3: (raw.tag3 || ['未分类']).filter(Boolean),
    confidence,
    needLogCheck: !!raw.needLogCheck,
    reviewNeeded,
    translatedContent: raw.translatedContent || '',
  };
}

export const tagger = {
  analyzeFeedback,
  batchAnalyzeFeedbacks,
  completeTaggingProcess,
  getAllTags,
  getCachedTags,
  invalidateTagCache,
};
