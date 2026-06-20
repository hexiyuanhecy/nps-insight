/**
 * AI打标引擎
 * 提供反馈自动分类、标签推荐、批量打标等功能
 */

import { chatCompletionJSON } from './index';
import {
  generateFeedbackAnalysisPrompt,
  generateBatchAnalysisPrompt,
  generateTagRecommendationPrompt,
} from './prompts';
import { AIAnalysisRequest, AITagResult, AIBatchRequest, AIBatchResult, Tag, Tag1, Tag2, Tag3, Priority, TagStatus } from '@/lib/types';
import { bitableClient, extractFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';

// ============================================
// 单条反馈打标
// ============================================

/**
 * 对单条反馈进行AI打标
 * @param request 分析请求
 * @returns 打标结果
 */
export async function analyzeFeedback(request: AIAnalysisRequest): Promise<AITagResult> {
  const { content, npsScore, module, existingTags } = request;

  const tags = existingTags || (await getAllTags());

  const messages = generateFeedbackAnalysisPrompt(content, npsScore, module, tags);
  const result = await chatCompletionJSON<{
    tag1: string;
    tag2: string;
    tag3: string;
    summary: string;
    suggestions: string;
    priority: string;
    confidence: number;
  }>(messages, { temperature: 0.3 });

  return normalizeTagResult(result);
}

// ============================================
// 批量反馈打标
// ============================================

/**
 * 批量对反馈进行AI打标
 * @param request 批量分析请求
 * @returns 批量打标结果
 */
export async function batchAnalyzeFeedback(request: AIBatchRequest): Promise<AIBatchResult[]> {
  const { feedbacks, existingTags } = request;

  if (feedbacks.length === 0) {
    return [];
  }

  const tags = existingTags || (await getAllTags());

  const batchSize = 10;
  const results: AIBatchResult[] = [];

  for (let i = 0; i < feedbacks.length; i += batchSize) {
    const batch = feedbacks.slice(i, i + batchSize);
    console.log(`[Tagger] 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(feedbacks.length / batchSize)}`);

    try {
      const messages = generateBatchAnalysisPrompt(batch, tags);
      const batchResults = await chatCompletionJSON<
        Array<{
          feedbackId: string;
          tag1: string;
          tag2: string;
          tag3: string;
          summary: string;
          suggestions: string;
          priority: string;
          confidence: number;
        }>
      >(messages, { temperature: 0.3, maxTokens: 4096 });

      for (const item of batchResults) {
        results.push({
          feedbackId: item.feedbackId,
          result: normalizeTagResult(item),
        });
      }
    } catch (error) {
      console.error(`[Tagger] 批次处理失败`, error);
      for (const fb of batch) {
        results.push({
          feedbackId: fb.feedbackId,
          result: getDefaultTagResult(),
        });
      }
    }
  }

  return results;
}

// ============================================
// 完整打标流程
// ============================================

/**
 * 完整打标流程：AI分析 → 标签对比 → 创建/填写
 * @param feedbackId 反馈ID
 * @param content 反馈内容
 * @param npsScore NPS评分
 * @param module 所属模块
 * @param recordId 飞书记录ID（用于更新）
 * @returns 打标结果
 */
export async function completeTaggingProcess(
  feedbackId: string,
  content: string,
  npsScore: number,
  module: string,
  recordId: string
): Promise<{ success: boolean; result?: AITagResult; newTagsCreated: number }> {
  try {
    console.log(`[Tagger] 开始处理反馈: ${feedbackId}`);

    console.log(`[Tagger] 步骤1: AI分析反馈内容`);
    const tags = await getAllTags();
    const messages = generateFeedbackAnalysisPrompt(content, npsScore, module, tags);
    const aiResult = await chatCompletionJSON<{
      tag1: string;
      tag2: string;
      tag3: string;
      summary: string;
      suggestions: string;
      priority: string;
      confidence: number;
    }>(messages, { temperature: 0.3 });

    const result = normalizeTagResult(aiResult);
    console.log(`[Tagger] AI分析结果: tag1=${result.tag1}, tag2=${result.tag2}, tag3=${result.tag3}`);

    console.log(`[Tagger] 步骤2: 查找或创建标签，获取recordId`);
    let newTagsCreated = 0;

    const tag1Result = await findOrCreateTag1(result.tag1, 'system');
    if (tag1Result.created) newTagsCreated++;

    const tag2Result = await findOrCreateTag2(result.tag2, 'system');
    if (tag2Result.created) newTagsCreated++;

    const tag3Result = await findOrCreateTag3(result.tag3, 'system');
    if (tag3Result.created) newTagsCreated++;

    console.log(`[Tagger] 步骤3: 更新反馈列表标签（使用关联recordId）`);
    await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, recordId, {
      [FEEDBACK_FIELDS.TAG1]: [tag1Result.recordId],
      [FEEDBACK_FIELDS.TAG2]: [tag2Result.recordId],
      [FEEDBACK_FIELDS.TAG3]: [tag3Result.recordId],
      summary: result.summary,
      suggestions: result.suggestions,
      priority: result.priority,
      confidence: result.confidence,
      status: '待审核',
    });

    console.log(`[Tagger] 打标完成: ${feedbackId}`);
    return { success: true, result, newTagsCreated };
  } catch (error) {
    console.error(`[Tagger] 打标失败: ${feedbackId}`, error);
    return { success: false, newTagsCreated: 0 };
  }
}

/**
 * 批量完整打标流程
 * @param feedbacks 反馈列表（包含recordId）
 * @returns 批量打标结果
 */
export async function batchCompleteTagging(
  feedbacks: Array<{ feedbackId: string; content: string; npsScore: number; module: string; recordId: string }>
): Promise<{ success: boolean; processed: number; failed: number; newTagsCreated: number }> {
  let processed = 0;
  let failed = 0;
  let newTagsCreated = 0;

  for (const fb of feedbacks) {
    try {
      const result = await completeTaggingProcess(
        fb.feedbackId,
        fb.content,
        fb.npsScore,
        fb.module,
        fb.recordId
      );
      if (result.success) {
        processed++;
        newTagsCreated += result.newTagsCreated;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[Tagger] 批量打标失败: ${fb.feedbackId}`, error);
      failed++;
    }
  }

  return {
    success: failed === 0,
    processed,
    failed,
    newTagsCreated,
  };
}

// ============================================
// 标签管理（按层级分别处理）
// ============================================

/**
 * 获取所有标签（兼容旧格式，从三张表合并）
 * @returns 标签列表
 */
export async function getAllTags(): Promise<Tag[]> {
  try {
    const [tag1Records, tag2Records, tag3Records] = await Promise.all([
      bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: 500 }),
      bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: 500 }),
      bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: 500 }),
    ]);

    const tag1Map = new Map<string, Tag1>();
    tag1Records.forEach(record => {
      const tag: Tag1 = {
        tagId: extractFieldValue(record.fields[TAG1_FIELDS.TAG_ID]),
        name: extractFieldValue(record.fields[TAG1_FIELDS.NAME]),
        definition: extractFieldValue(record.fields[TAG1_FIELDS.DEFINITION]) || '',
        usageCount: Number(record.fields[TAG1_FIELDS.USAGE_COUNT] || 0),
        largeTenantCount: Number(record.fields[TAG1_FIELDS.LARGE_TENANT_COUNT] || 0),
        largeTenantRatio: Number(record.fields[TAG1_FIELDS.LARGE_TENANT_RATIO] || 0),
        status: (extractFieldValue(record.fields[TAG1_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
        createdBy: extractFieldValue(record.fields[TAG1_FIELDS.CREATED_BY]) || '',
        createdAt: extractFieldValue(record.fields[TAG1_FIELDS.CREATED_AT]) || '',
        recordId: record.record_id,
      };
      tag1Map.set(tag.name, tag);
    });

    const tag2Map = new Map<string, Tag2>();
    tag2Records.forEach(record => {
      const tag: Tag2 = {
        tagId: extractFieldValue(record.fields[TAG2_FIELDS.TAG_ID]),
        name: extractFieldValue(record.fields[TAG2_FIELDS.NAME]),
        definition: extractFieldValue(record.fields[TAG2_FIELDS.DEFINITION]) || '',
        usageCount: Number(record.fields[TAG2_FIELDS.USAGE_COUNT] || 0),
        largeTenantCount: Number(record.fields[TAG2_FIELDS.LARGE_TENANT_COUNT] || 0),
        largeTenantRatio: Number(record.fields[TAG2_FIELDS.LARGE_TENANT_RATIO] || 0),
        status: (extractFieldValue(record.fields[TAG2_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
        createdBy: extractFieldValue(record.fields[TAG2_FIELDS.CREATED_BY]) || '',
        createdAt: extractFieldValue(record.fields[TAG2_FIELDS.CREATED_AT]) || '',
        recordId: record.record_id,
      };
      tag2Map.set(tag.name, tag);
    });

    const tag3Map = new Map<string, Tag3>();
    tag3Records.forEach(record => {
      const tag: Tag3 = {
        tagId: extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]),
        name: extractFieldValue(record.fields[TAG3_FIELDS.NAME]),
        definition: extractFieldValue(record.fields[TAG3_FIELDS.DEFINITION]) || '',
        usageCount: Number(record.fields[TAG3_FIELDS.USAGE_COUNT] || 0),
        largeTenantCount: Number(record.fields[TAG3_FIELDS.LARGE_TENANT_COUNT] || 0),
        largeTenantRatio: Number(record.fields[TAG3_FIELDS.LARGE_TENANT_RATIO] || 0),
        status: (extractFieldValue(record.fields[TAG3_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
        createdBy: extractFieldValue(record.fields[TAG3_FIELDS.CREATED_BY]) || '',
        createdAt: extractFieldValue(record.fields[TAG3_FIELDS.CREATED_AT]) || '',
        recordId: record.record_id,
      };
      tag3Map.set(tag.name, tag);
    });

    const tags: Tag[] = [];
    const tag1Keys = Array.from(tag1Map.keys());
    const tag2Keys = Array.from(tag2Map.keys());
    const tag3Keys = Array.from(tag3Map.keys());

    for (let i = 0; i < tag1Keys.length; i++) {
      const tag1Name = tag1Keys[i];
      const tag1 = tag1Map.get(tag1Name)!;
      for (let j = 0; j < tag2Keys.length; j++) {
        const tag2Name = tag2Keys[j];
        const tag2 = tag2Map.get(tag2Name)!;
        for (let k = 0; k < tag3Keys.length; k++) {
          const tag3Name = tag3Keys[k];
          const tag3 = tag3Map.get(tag3Name)!;
          tags.push({
            tagId: `${tag1.tagId}-${tag2.tagId}-${tag3.tagId}`,
            tag1Name,
            tag2Name,
            tag3Name,
            usageCount: tag3.usageCount,
            status: tag3.status,
            createdBy: tag3.createdBy,
            createdAt: tag3.createdAt,
          });
        }
      }
    }

    return tags;
  } catch (error) {
    console.error('[Tagger] 获取标签失败', error);
    return [];
  }
}

/**
 * 获取所有一级标签
 * @returns Tag1列表
 */
export async function getAllTag1(): Promise<Tag1[]> {
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: 500 });
    return records.map(record => ({
      tagId: extractFieldValue(record.fields[TAG1_FIELDS.TAG_ID]),
      name: extractFieldValue(record.fields[TAG1_FIELDS.NAME]),
      definition: extractFieldValue(record.fields[TAG1_FIELDS.DEFINITION]) || '',
      usageCount: Number(record.fields[TAG1_FIELDS.USAGE_COUNT] || 0),
      largeTenantCount: Number(record.fields[TAG1_FIELDS.LARGE_TENANT_COUNT] || 0),
      largeTenantRatio: Number(record.fields[TAG1_FIELDS.LARGE_TENANT_RATIO] || 0),
      status: (extractFieldValue(record.fields[TAG1_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
      createdBy: extractFieldValue(record.fields[TAG1_FIELDS.CREATED_BY]) || '',
      createdAt: extractFieldValue(record.fields[TAG1_FIELDS.CREATED_AT]) || '',
      recordId: record.record_id,
    }));
  } catch (error) {
    console.error('[Tagger] 获取Tag1失败', error);
    return [];
  }
}

/**
 * 获取所有二级标签
 * @returns Tag2列表
 */
export async function getAllTag2(): Promise<Tag2[]> {
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: 500 });
    return records.map(record => ({
      tagId: extractFieldValue(record.fields[TAG2_FIELDS.TAG_ID]),
      name: extractFieldValue(record.fields[TAG2_FIELDS.NAME]),
      definition: extractFieldValue(record.fields[TAG2_FIELDS.DEFINITION]) || '',
      usageCount: Number(record.fields[TAG2_FIELDS.USAGE_COUNT] || 0),
      largeTenantCount: Number(record.fields[TAG2_FIELDS.LARGE_TENANT_COUNT] || 0),
      largeTenantRatio: Number(record.fields[TAG2_FIELDS.LARGE_TENANT_RATIO] || 0),
      status: (extractFieldValue(record.fields[TAG2_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
      createdBy: extractFieldValue(record.fields[TAG2_FIELDS.CREATED_BY]) || '',
      createdAt: extractFieldValue(record.fields[TAG2_FIELDS.CREATED_AT]) || '',
      recordId: record.record_id,
    }));
  } catch (error) {
    console.error('[Tagger] 获取Tag2失败', error);
    return [];
  }
}

/**
 * 获取所有三级标签
 * @returns Tag3列表
 */
export async function getAllTag3(): Promise<Tag3[]> {
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: 500 });
    return records.map(record => ({
      tagId: extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]),
      name: extractFieldValue(record.fields[TAG3_FIELDS.NAME]),
      definition: extractFieldValue(record.fields[TAG3_FIELDS.DEFINITION]) || '',
      usageCount: Number(record.fields[TAG3_FIELDS.USAGE_COUNT] || 0),
      largeTenantCount: Number(record.fields[TAG3_FIELDS.LARGE_TENANT_COUNT] || 0),
      largeTenantRatio: Number(record.fields[TAG3_FIELDS.LARGE_TENANT_RATIO] || 0),
      status: (extractFieldValue(record.fields[TAG3_FIELDS.STATUS]) as TagStatus) || TagStatus.ACTIVE,
      createdBy: extractFieldValue(record.fields[TAG3_FIELDS.CREATED_BY]) || '',
      createdAt: extractFieldValue(record.fields[TAG3_FIELDS.CREATED_AT]) || '',
      recordId: record.record_id,
    }));
  } catch (error) {
    console.error('[Tagger] 获取Tag3失败', error);
    return [];
  }
}

/**
 * 查找或创建一级标签
 * @param name 标签名称
 * @param createdBy 创建人
 * @returns {recordId, created}
 */
export async function findOrCreateTag1(
  name: string,
  createdBy: string = 'system'
): Promise<{ recordId: string; created: boolean }> {
  const tag1List = await getAllTag1();
  const existing = tag1List.find(t => t.name === name);

  if (existing) {
    return { recordId: existing.recordId!, created: false };
  }

  const tagId = generateTagId('tag1', name);
  const result = await bitableClient.createRecord(TABLE_NAMES.TAG1, {
    [TAG1_FIELDS.TAG_ID]: tagId,
    [TAG1_FIELDS.NAME]: name,
    [TAG1_FIELDS.DEFINITION]: '',
    [TAG1_FIELDS.USAGE_COUNT]: 0,
    [TAG1_FIELDS.LARGE_TENANT_COUNT]: 0,
    [TAG1_FIELDS.LARGE_TENANT_RATIO]: 0,
    [TAG1_FIELDS.STATUS]: TagStatus.ACTIVE,
    [TAG1_FIELDS.CREATED_BY]: createdBy,
    [TAG1_FIELDS.CREATED_AT]: Date.now(),
  });

  return { recordId: result.record_id, created: true };
}

/**
 * 查找或创建二级标签
 * @param name 标签名称
 * @param createdBy 创建人
 * @returns {recordId, created}
 */
export async function findOrCreateTag2(
  name: string,
  createdBy: string = 'system'
): Promise<{ recordId: string; created: boolean }> {
  const tag2List = await getAllTag2();
  const existing = tag2List.find(t => t.name === name);

  if (existing) {
    return { recordId: existing.recordId!, created: false };
  }

  const tagId = generateTagId('tag2', name);
  const result = await bitableClient.createRecord(TABLE_NAMES.TAG2, {
    [TAG2_FIELDS.TAG_ID]: tagId,
    [TAG2_FIELDS.NAME]: name,
    [TAG2_FIELDS.DEFINITION]: '',
    [TAG2_FIELDS.USAGE_COUNT]: 0,
    [TAG2_FIELDS.LARGE_TENANT_COUNT]: 0,
    [TAG2_FIELDS.LARGE_TENANT_RATIO]: 0,
    [TAG2_FIELDS.STATUS]: TagStatus.ACTIVE,
    [TAG2_FIELDS.CREATED_BY]: createdBy,
    [TAG2_FIELDS.CREATED_AT]: Date.now(),
  });

  return { recordId: result.record_id, created: true };
}

/**
 * 查找或创建三级标签
 * @param name 标签名称
 * @param createdBy 创建人
 * @returns {recordId, created}
 */
export async function findOrCreateTag3(
  name: string,
  createdBy: string = 'system'
): Promise<{ recordId: string; created: boolean }> {
  const tag3List = await getAllTag3();
  const existing = tag3List.find(t => t.name === name);

  if (existing) {
    return { recordId: existing.recordId!, created: false };
  }

  const tagId = generateTagId('tag3', name);
  const result = await bitableClient.createRecord(TABLE_NAMES.TAG3, {
    [TAG3_FIELDS.TAG_ID]: tagId,
    [TAG3_FIELDS.NAME]: name,
    [TAG3_FIELDS.DEFINITION]: '',
    [TAG3_FIELDS.USAGE_COUNT]: 0,
    [TAG3_FIELDS.LARGE_TENANT_COUNT]: 0,
    [TAG3_FIELDS.LARGE_TENANT_RATIO]: 0,
    [TAG3_FIELDS.STATUS]: TagStatus.ACTIVE,
    [TAG3_FIELDS.CREATED_BY]: createdBy,
    [TAG3_FIELDS.CREATED_AT]: Date.now(),
  });

  return { recordId: result.record_id, created: true };
}

/**
 * 查找或创建标签（旧方法，保留兼容）
 * @param tag1 一级标签
 * @param tag2 二级标签
 * @param tag3 三级标签
 * @param createdBy 创建人
 * @returns 标签ID
 */
export async function findOrCreateTag(
  tag1: string,
  tag2: string,
  tag3: string,
  createdBy: string = 'system'
): Promise<string> {
  await findOrCreateTag1(tag1, createdBy);
  await findOrCreateTag2(tag2, createdBy);
  const tag3Result = await findOrCreateTag3(tag3, createdBy);
  return tag3Result.recordId;
}

/**
 * 推荐标签
 * @param content 反馈内容
 * @returns 推荐的标签
 */
export async function recommendTags(content: string): Promise<{
  tag1: string;
  tag2: string;
  tag3: string;
  reason: string;
}> {
  const existingTags = await getAllTags();
  const messages = generateTagRecommendationPrompt(content, existingTags);

  const result = await chatCompletionJSON<{
    recommendedTag1: string;
    recommendedTag2: string;
    recommendedTag3: string;
    reason: string;
  }>(messages, { temperature: 0.3 });

  return {
    tag1: result.recommendedTag1,
    tag2: result.recommendedTag2,
    tag3: result.recommendedTag3,
    reason: result.reason,
  };
}

// ============================================
// 工具函数
// ============================================

/**
 * 规范化打标结果
 * @param raw 原始AI返回结果
 * @returns 规范化的打标结果
 */
function normalizeTagResult(raw: {
  tag1: string;
  tag2: string;
  tag3: string;
  summary: string;
  suggestions: string;
  priority: string;
  confidence: number;
}): AITagResult {
  const validPriorities: Priority[] = [Priority.URGENT, Priority.HIGH, Priority.MEDIUM, Priority.LOW];
  const priority = validPriorities.includes(raw.priority as Priority)
    ? (raw.priority as Priority)
    : Priority.MEDIUM;

  const confidence = Math.max(0, Math.min(1, raw.confidence || 0.5));

  return {
    tag1: (raw.tag1 || '未分类').trim(),
    tag2: (raw.tag2 || '未分类').trim(),
    tag3: (raw.tag3 || '未分类').trim(),
    summary: (raw.summary || '').trim(),
    suggestions: (raw.suggestions || '').trim(),
    priority,
    confidence,
  };
}

/**
 * 获取默认打标结果（用于失败回退）
 * @returns 默认打标结果
 */
function getDefaultTagResult(): AITagResult {
  return {
    tag1: '未分类',
    tag2: '未分类',
    tag3: '未分类',
    summary: 'AI分析失败，请手动处理',
    suggestions: '',
    priority: Priority.MEDIUM,
    confidence: 0,
  };
}

/**
 * 生成标签ID（按层级）
 * @param level 标签层级 (tag1/tag2/tag3)
 * @param name 标签名称
 * @returns 标签ID
 */
function generateTagId(level: string, name: string): string {
  const hash = `${level}-${name}`;
  let hashCode = 0;
  for (let i = 0; i < hash.length; i++) {
    const char = hash.charCodeAt(i);
    hashCode = (hashCode << 5) - hashCode + char;
    hashCode = hashCode & hashCode;
  }
  return `${level}_${Math.abs(hashCode).toString(36)}`;
}

// ============================================
// 导出便捷对象
// ============================================

export const tagger = {
  analyzeFeedback,
  batchAnalyzeFeedback,
  completeTaggingProcess,
  batchCompleteTagging,
  getAllTags,
  getAllTag1,
  getAllTag2,
  getAllTag3,
  findOrCreateTag,
  findOrCreateTag1,
  findOrCreateTag2,
  findOrCreateTag3,
  recommendTags,
};
