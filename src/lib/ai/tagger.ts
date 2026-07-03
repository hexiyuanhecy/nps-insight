/**
 * AI打标引擎（PRD v6.0）
 * 流程：语言检测 → Tag3 → Tag2 → Tag1 → 置信度 → needLogCheck
 * 支持标签缓存复用，避免每批重复查询
 */

import { chatCompletionJSON } from './index';
import { generateBatchTaggingPrompt } from './prompts';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE, FIVE_MINUTES_MS } from '@/constants/app-constants';

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
const TAG_CACHE_TTL_MS = FIVE_MINUTES_MS;

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
  return normalizeTagResult(raw, confidenceThreshold, content);
}

// ============================================
// 批量反馈打标
// ============================================

/**
 * 批量对一组反馈进行AI打标
 * @param batch 反馈数组（每条含 record_id, content, score, source, unsatReason）
 * @param existingTags 已有标签（用于 prompt 注入）
 * @param confidenceThreshold 置信度阈值（必须显式传递，默认值由调用方控制）
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
  confidenceThreshold: number
): Promise<Array<{ success: boolean; result?: AITagResult; recordId: string }>> {
  const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
  const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
  const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);

  const inputs = batch
    .filter(f => f.content)
    .map((fb, idx) => ({
      id: fb.record_id,
      content: fb.content,
      score: fb.score,
      source: fb.source,
      unsatisfactoryReason: fb.unsatReason,
    }));

  if (inputs.length === 0) {
    return batch.map(fb => ({ success: false, recordId: fb.record_id }));
  }

  const prompt = generateBatchTaggingPrompt(inputs, tag1List, tag2List, tag3List, confidenceThreshold);

  // ========== 日志：打印提交给 AI 的数据和 Prompt ==========
  console.log('\n' + '='.repeat(60));
  console.log('【AI 打标 - 提交给 AI 的数据】');
  console.log('='.repeat(60));
  console.log(`📊 本次批次: ${inputs.length} 条反馈`);
  console.log(`🏷️  已有标签数量: Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`);
  console.log(`📏 置信度阈值: ${confidenceThreshold}`);
  console.log('\n--- 待分析反馈列表 ---');
  inputs.forEach((fb, idx) => {
    console.log(`  #${idx + 1} [${fb.source}] 评分:${fb.score} | ${fb.content.substring(0, 50)}${fb.content.length > 50 ? '...' : ''}`);
  });
  console.log('\n--- 完整 Prompt（前 1000 字）---');
  console.log(prompt.substring(0, 1000) + (prompt.length > 1000 ? '\n...(已截断)' : ''));
  console.log('='.repeat(60) + '\n');
  // ========================================================

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

    // ========== 日志：打印 AI 返回的数据 ==========
    console.log('\n' + '='.repeat(60));
    console.log('【AI 打标 - AI 返回结果】');
    console.log('='.repeat(60));
    const resultsArray = result?.results || [];
    console.log(`✅ 返回结果数: ${resultsArray.length} 条`);
    resultsArray.forEach((r, idx) => {
      const sourceFb = inputs[idx];
      console.log(`\n  #${idx + 1} ${sourceFb ? sourceFb.content.substring(0, 30) + '...' : '未知'}`);
      console.log(`     Tag1: ${r.tag1?.join(', ') || '空'}`);
      console.log(`     Tag2: ${r.tag2?.join(', ') || '空'}`);
      console.log(`     Tag3: ${r.tag3?.join(', ') || '空'}`);
      console.log(`     置信度: ${r.confidence}`);
      console.log(`     需查日志: ${r.needLogCheck ? '是' : '否'}`);
      if (r.translatedContent) {
        console.log(`     翻译: ${r.translatedContent.substring(0, 30)}...`);
      }
    });
    console.log('='.repeat(60) + '\n');
    // ========================================================

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
      const normalized = normalizeTagResult(raw || { tag1: [] as string[], tag2: [] as string[], tag3: [] as string[], confidence: 0, needLogCheck: false, translatedContent: '' } as any, confidenceThreshold, fb.content);
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
): Promise<string> {
  try {
    const existing = await getCachedTags();

    // 根据层级确定表名和字段定义
    let tableName: string;
    let tagIdField: string;
    let nameField: string;
    let tagIdPrefix: string;

    if (level === 'tag1') {
      tableName = TABLE_NAMES.TAG1;
      tagIdField = TAG1_FIELDS.TAG_ID;
      nameField = TAG1_FIELDS.TAG_NAME;
      tagIdPrefix = 'tag1';
    } else if (level === 'tag2') {
      tableName = TABLE_NAMES.TAG2;
      tagIdField = TAG2_FIELDS.TAG_ID;
      nameField = TAG2_FIELDS.TAG_NAME;
      tagIdPrefix = 'tag2';
    } else {
      tableName = TABLE_NAMES.TAG3;
      tagIdField = TAG3_FIELDS.TAG_ID;
      nameField = TAG3_FIELDS.TAG_NAME;
      tagIdPrefix = 'tag3';
    }

    // 查找标签是否已存在
    const found = existing.find(t => t.table === level && (
      (level === 'tag1' && t.tag1Name === tagName) ||
      (level === 'tag2' && t.tag2Name === tagName) ||
      (level === 'tag3' && t.tag3Name === tagName)
    ));

    if (found && found.recordId) {
      // 标签已存在，返回 record_id
      return found.recordId;
    }

    // 创建新标签（只写入基础字段：tagId 和 标签名称，公式字段由飞书自动计算）
    const tagId = `${tagIdPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newRecord = await bitableClient.createRecord(tableName, {
      [tagIdField]: tagId,
      [nameField]: tagName,
    });
    console.log(`[Tagger] 创建新标签: ${level} - ${tagName}`);
    // 新标签创建后使缓存失效
    invalidateTagCache();
    return newRecord.record_id;
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
  console.warn(`[Tagger] updateTagStatistics 已停用：标签表结构已更新，统计字段不再存在`);
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
    const tag1Records = await bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: DEFAULT_PAGE_SIZE });
    for (const record of tag1Records) {
      const name = String(record.fields[TAG1_FIELDS.TAG_NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG1_FIELDS.TAG_ID] || ''),
          tag1Name: name,
          tag2Name: '',
          tag3Name: '',
          usageCount: Number(record.fields[TAG1_FIELDS.COUNT] || 0),
          recordId: record.record_id,
          table: 'tag1',
        });
      }
    }

    // 2. 从 TAG2 表读取二级标签
    const tag2Records = await bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: DEFAULT_PAGE_SIZE });
    for (const record of tag2Records) {
      const name = String(record.fields[TAG2_FIELDS.TAG_NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG2_FIELDS.TAG_ID] || ''),
          tag1Name: '',
          tag2Name: name,
          tag3Name: '',
          usageCount: Number(record.fields[TAG2_FIELDS.COUNT] || 0),
          recordId: record.record_id,
          table: 'tag2',
        });
      }
    }

    // 3. 从 TAG3 表读取三级标签
    const tag3Records = await bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: DEFAULT_PAGE_SIZE });
    for (const record of tag3Records) {
      const name = String(record.fields[TAG3_FIELDS.TAG_NAME] || '');
      if (name) {
        allTags.push({
          tagId: String(record.fields[TAG3_FIELDS.TAG_ID] || ''),
          tag1Name: '',
          tag2Name: '',
          tag3Name: name,
          usageCount: Number(record.fields[TAG3_FIELDS.COUNT] || 0),
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

// 无效 Tag3 黑名单：AI 偶尔会把元描述（如"测试数据"）当作 Tag3 返回，污染标签库
// 命中黑名单时，用反馈原文前 20 字回退，并将置信度降为 0 触发人工审核
const INVALID_TAG3_PATTERNS = [
  /^测试数据$/,
  /^测试$/,
  /^test$/i,
  /^未知$/,
  /^无$/,
  /^未分类$/,
  /^暂无$/,
  /^其他$/,
];

/**
 * 过滤无效 Tag3，命中黑名单时用反馈内容前 20 字回退
 * @param tag3Arr AI 返回的 Tag3 数组
 * @param fallbackContent 反馈原文（用于回退）
 * @returns { tags: 修正后的 Tag3 数组, sanitized: 是否发生过修正 }
 */
function sanitizeTag3(tag3Arr: string[], fallbackContent: string): { tags: string[]; sanitized: boolean } {
  if (tag3Arr.length === 0) return { tags: [], sanitized: false };

  let sanitized = false;
  const cleaned = tag3Arr
    .map(t => {
      const trimmed = String(t || '').trim();
      // 命中黑名单
      if (INVALID_TAG3_PATTERNS.some(p => p.test(trimmed))) {
        sanitized = true;
        // 回退到反馈原文前 20 字（避免 Tag3 为空导致 reviewNeeded）
        const fallback = (fallbackContent || '').trim().substring(0, 20);
        console.warn(`[Tagger] 检测到无效 Tag3 "${trimmed}"，回退为反馈原文前 20 字: "${fallback}"`);
        return fallback || '待人工审核';
      }
      return trimmed;
    })
    .filter(Boolean);

  return { tags: cleaned, sanitized };
}

function normalizeTagResult(
  raw: {
    tag1: string[];
    tag2: string[];
    tag3: string[];
    confidence: number;
    needLogCheck: boolean;
    translatedContent: string;
  },
  confidenceThreshold: number,
  fallbackContent: string = ''
): AITagResult {
  const confidence = Math.max(0, Math.min(1, raw.confidence || 0.5));
  const tag1Arr = raw.tag1 || [];
  const tag2Arr = raw.tag2 || [];
  const tag3Arr = raw.tag3 || [];

  // 过滤无效 Tag3（如"测试数据"等元描述）
  const { tags: sanitizedTag3, sanitized } = sanitizeTag3(tag3Arr, fallbackContent);

  // 如果发生过修正，说明 AI 返回了无效 Tag3，强制降为 0 触发人工审核
  const finalConfidence = sanitized ? 0 : confidence;
  const reviewNeeded = finalConfidence < confidenceThreshold || tag1Arr.length === 0 || tag2Arr.length === 0 || sanitizedTag3.length === 0;

  return {
    tag1: (raw.tag1 || ['未分类']).filter(Boolean),
    tag2: (raw.tag2 || ['未分类']).filter(Boolean),
    tag3: (sanitizedTag3.length > 0 ? sanitizedTag3 : ['未分类']),
    confidence: finalConfidence,
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
