/**
 * AI打标引擎（PRD v6.0）
 * 流程：语言检测 → Tag3 → Tag2 → Tag1 → 置信度 → needLogCheck
 * 支持标签缓存复用，避免每批重复查询
 */

import { chatCompletionJSON } from './index';
import { generateBatchTaggingPrompt } from './prompts';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG_FIELDS, FEEDBACK_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';

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

  const result = await chatCompletionJSON<{
    results: Array<{
      tag1: string[];
      tag2: string[];
      tag3: string[];
      confidence: number;
      needLogCheck: boolean;
      translatedContent: string;
    }>;
  }>([{ role: 'user', content: prompt }], { temperature: 0.3 });

  // result 是 { results: [...] } 格式，取第一条
  const raw = result?.results?.[0] || {};
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
    const result = await chatCompletionJSON<{
      results: Array<{
        tag1: string[];
        tag2: string[];
        tag3: string[];
        confidence: number;
        needLogCheck: boolean;
        translatedContent: string;
      }>;
    }>([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 8192 });

    const resultsArray = result?.results || [];

    // 建立 inputs 索引到 result 索引的映射
    const inputIndexMap = new Map<number, number>();
    let inputIdx = 0;
    for (let i = 0; i < batch.length; i++) {
      if (batch[i].content) {
        inputIndexMap.set(i, inputIdx);
        inputIdx++;
      }
    }

    return batch.map((fb, idx) => {
      const resultIdx = inputIndexMap.get(idx);
      const raw = resultIdx !== undefined ? resultsArray[resultIdx] : null;
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
      await ensureTagExists(tag1, 'tag1');
      newTagsCreated++;
    }
    for (const tag2 of aiResult.tag2) {
      await ensureTagExists(tag2, 'tag2');
      newTagsCreated++;
    }
    for (const tag3 of aiResult.tag3) {
      await ensureTagExists(tag3, 'tag3');
      newTagsCreated++;
    }

    // 4. 更新反馈记录
    console.log(`[Tagger] 步骤3: 更新反馈记录`);
    // MultiSelect 字段需要传入字符串数组，过滤空字符串，确保格式正确
    await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, recordId, {
      [FEEDBACK_FIELDS.TAG1]: (aiResult.tag1 || []).filter(t => t),
      [FEEDBACK_FIELDS.TAG2]: (aiResult.tag2 || []).filter(t => t),
      [FEEDBACK_FIELDS.TAG3]: (aiResult.tag3 || []).filter(t => t),
      [FEEDBACK_FIELDS.CONFIDENCE]: aiResult.confidence,
      [FEEDBACK_FIELDS.NEED_LOG_CHECK]: aiResult.needLogCheck ? '是' : '否',
      [FEEDBACK_FIELDS.REVIEW_NEEDED]: aiResult.reviewNeeded ? '是' : '否',
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
 * 确保标签存在于对应的标签表中
 * @param tagName 标签名称
 * @param level 标签层级（'tag1' | 'tag2' | 'tag3'）
 */
export async function ensureTagExists(
  tagName: string,
  level: 'tag1' | 'tag2' | 'tag3'
): Promise<void> {
  try {
    const existing = await getCachedTags();

    // 根据层级确定表名和字段定义
    let tableName: string;
    let tagIdField: string;
    let nameField: string;
    let usageCountField: string;
    let largeTenantCountField: string;
    let largeTenantRatioField: string;
    let tagIdPrefix: string;

    if (level === 'tag1') {
      tableName = TABLE_NAMES.TAG1;
      tagIdField = TAG1_FIELDS.TAG_ID;
      nameField = TAG1_FIELDS.NAME;
      usageCountField = TAG1_FIELDS.USAGE_COUNT;
      largeTenantCountField = TAG1_FIELDS.LARGE_TENANT_COUNT;
      largeTenantRatioField = TAG1_FIELDS.LARGE_TENANT_RATIO;
      tagIdPrefix = 'tag1';
    } else if (level === 'tag2') {
      tableName = TABLE_NAMES.TAG2;
      tagIdField = TAG2_FIELDS.TAG_ID;
      nameField = TAG2_FIELDS.NAME;
      usageCountField = TAG2_FIELDS.USAGE_COUNT;
      largeTenantCountField = TAG2_FIELDS.LARGE_TENANT_COUNT;
      largeTenantRatioField = TAG2_FIELDS.LARGE_TENANT_RATIO;
      tagIdPrefix = 'tag2';
    } else {
      tableName = TABLE_NAMES.TAG3;
      tagIdField = TAG3_FIELDS.TAG_ID;
      nameField = TAG3_FIELDS.NAME;
      usageCountField = TAG3_FIELDS.USAGE_COUNT;
      largeTenantCountField = TAG3_FIELDS.LARGE_TENANT_COUNT;
      largeTenantRatioField = TAG3_FIELDS.LARGE_TENANT_RATIO;
      tagIdPrefix = 'tag3';
    }

    // 查找标签是否已存在
    const found = existing.find(t => t.table === level && (
      (level === 'tag1' && t.tag1Name === tagName) ||
      (level === 'tag2' && t.tag2Name === tagName) ||
      (level === 'tag3' && t.tag3Name === tagName)
    ));

    if (!found) {
      // 创建新标签
      const tagId = `${tagIdPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await bitableClient.createRecord(tableName, {
        [tagIdField]: tagId,
        [nameField]: tagName,
        [usageCountField]: 1,
        [largeTenantCountField]: 0,
        [largeTenantRatioField]: 0,
      });
      console.log(`[Tagger] 创建新标签: ${level} - ${tagName}`);
      // 新标签创建后使缓存失效
      invalidateTagCache();
    } else {
      // 更新使用次数
      await bitableClient.updateRecord(tableName, found.recordId!, {
        [usageCountField]: found.usageCount + 1,
      });
      console.log(`[Tagger] 更新标签使用次数: ${level} - ${tagName} (${found.usageCount + 1})`);
    }
  } catch (error) {
    console.error(`[Tagger] 确保标签存在失败: ${level} - ${tagName}`, error);
    throw error;
  }
}

/**
 * 更新标签统计数据（大租户数、大租户占比）
 * 注意：标签表目前没有 avgScore 字段，暂不更新平均分
 * @param tagName 标签名称
 * @param level 标签级别（tag1/tag2/tag3）
 * @param tenantScale 租户规模（A1-A6）
 * @param npsScore NPS评分（1-5）（暂未使用，保留参数供未来使用）
 */
export async function updateTagStatistics(
  tagName: string,
  level: 'tag1' | 'tag2' | 'tag3',
  tenantScale: string,
  npsScore: number
): Promise<void> {
  // 大租户定义：A4/A5/A6
  const isLargeTenant = ['A4', 'A5', 'A6'].includes(tenantScale);

  // 根据级别选择表和字段定义
  let tableName: string;
  let nameField: string;
  let usageCountField: string;
  let largeTenantCountField: string;
  let largeTenantRatioField: string;

  if (level === 'tag1') {
    tableName = TABLE_NAMES.TAG1;
    nameField = TAG1_FIELDS.NAME;
    usageCountField = TAG1_FIELDS.USAGE_COUNT;
    largeTenantCountField = TAG1_FIELDS.LARGE_TENANT_COUNT;
    largeTenantRatioField = TAG1_FIELDS.LARGE_TENANT_RATIO;
  } else if (level === 'tag2') {
    tableName = TABLE_NAMES.TAG2;
    nameField = TAG2_FIELDS.NAME;
    usageCountField = TAG2_FIELDS.USAGE_COUNT;
    largeTenantCountField = TAG2_FIELDS.LARGE_TENANT_COUNT;
    largeTenantRatioField = TAG2_FIELDS.LARGE_TENANT_RATIO;
  } else {
    tableName = TABLE_NAMES.TAG3;
    nameField = TAG3_FIELDS.NAME;
    usageCountField = TAG3_FIELDS.USAGE_COUNT;
    largeTenantCountField = TAG3_FIELDS.LARGE_TENANT_COUNT;
    largeTenantRatioField = TAG3_FIELDS.LARGE_TENANT_RATIO;
  }

  try {
    // 查找标签记录
    const existingRecords = await bitableClient.listRecords(tableName, { pageSize: 500 });
    const found = existingRecords.find(r => String(r.fields[nameField] || '') === tagName);

    if (!found) {
      // 标签不存在，跳过统计更新（ensureTagExists 会创建）
      console.warn(`[Tagger] 标签 ${tagName} 不存在，跳过统计更新`);
      return;
    }

    // 获取当前统计数据
    const currentUsageCount = Number(found.fields[usageCountField] || 0);
    const currentLargeTenantCount = Number(found.fields[largeTenantCountField] || 0);

    // 计算新的统计数据
    // 大租户数：如果是大租户，则增加计数
    const newLargeTenantCount = isLargeTenant ? currentLargeTenantCount + 1 : currentLargeTenantCount;
    
    // 大租户占比：大租户数 / 使用次数（百分比）
    const newLargeTenantRatio = currentUsageCount > 0 ? Math.round((newLargeTenantCount / currentUsageCount) * 100) : 0;

    // 更新记录
    await bitableClient.updateRecord(tableName, found.record_id, {
      [largeTenantCountField]: newLargeTenantCount,
      [largeTenantRatioField]: newLargeTenantRatio,
    });

    console.log(`[Tagger] 更新标签 ${tagName} 统计: 大租户=${newLargeTenantCount}, 占比=${newLargeTenantRatio}%`);
  } catch (error) {
    console.error(`[Tagger] 更新标签统计失败 ${tagName}:`, error);
  }
}

// ============================================
// 标签管理
// ============================================

/**
 * 获取所有标签（分别从 TAG1、TAG2、TAG3 三张表读取）
 */
export async function getAllTags(): Promise<TagRecord[]> {
  try {
    const allTags: TagRecord[] = [];

    // 1. 从 TAG1 表读取一级标签
    const tag1Records = await bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: 500 });
    for (const record of tag1Records) {
      const name = String(record.fields[TAG1_FIELDS.NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG1_FIELDS.TAG_ID] || ''),
          tag1Name: name,
          tag2Name: '',
          tag3Name: '',
          usageCount: Number(record.fields[TAG1_FIELDS.USAGE_COUNT] || 0),
          recordId: record.record_id,
          table: 'tag1',
        });
      }
    }

    // 2. 从 TAG2 表读取二级标签
    const tag2Records = await bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: 500 });
    for (const record of tag2Records) {
      const name = String(record.fields[TAG2_FIELDS.NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG2_FIELDS.TAG_ID] || ''),
          tag1Name: '',
          tag2Name: name,
          tag3Name: '',
          usageCount: Number(record.fields[TAG2_FIELDS.USAGE_COUNT] || 0),
          recordId: record.record_id,
          table: 'tag2',
        });
      }
    }

    // 3. 从 TAG3 表读取三级标签
    const tag3Records = await bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: 500 });
    for (const record of tag3Records) {
      const name = String(record.fields[TAG3_FIELDS.NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG3_FIELDS.TAG_ID] || ''),
          tag1Name: '',
          tag2Name: '',
          tag3Name: name,
          usageCount: Number(record.fields[TAG3_FIELDS.USAGE_COUNT] || 0),
          recordId: record.record_id,
          table: 'tag3',
        });
      }
    }

    console.log(`[Tagger] 获取标签成功: Tag1=${tag1Records.length}, Tag2=${tag2Records.length}, Tag3=${tag3Records.length}`);
    return allTags;
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
  const tag1Arr = raw.tag1 || [];
  const tag2Arr = raw.tag2 || [];
  const tag3Arr = raw.tag3 || [];
  const reviewNeeded = confidence < confidenceThreshold || tag1Arr.length === 0 || tag2Arr.length === 0 || tag3Arr.length === 0;

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
  ensureTagExists,
  updateTagStatistics,
};
