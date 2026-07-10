/**
 * AI打标引擎（PRD v6.0）
 * 流程：语言检测 → Tag3 → Tag2 → Tag1 → 置信度 → needLogCheck
 * 支持标签缓存复用，避免每批重复查询
 * 
 * 打标方式：
 * 1. 新方式（推荐）：JSON Schema 结构化输出（AgnesAI 原生支持）
 * 2. 旧方式（fallback）：Zod + 重试（兼容其他 LLM）
 */

import { chatCompletionJSONSafe, chatCompletionJsonSchema } from './index';
import { sanitizeUserInput, CONSTITUTIONAL_REFUSAL } from './security';
import { BatchTaggingResultSchema } from './schemas';
import { BatchTaggingJsonSchema, BatchTaggingResult } from './json-schemas';
import { generateBatchTaggingPrompt, generateBatchTaggingPromptWithCandidates } from './prompts';
import { completeTaggingProcessWithTools } from './tagger-tool-based';
import { injectProfileToPrompt } from './user-profile';
import { embed, searchSimilarTags, type SimilarTag } from './embedding';
import { TagVectorStore } from './tag-vector-store';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE, FIVE_MINUTES_MS } from '@/constants/app-constants';

// AgnesAI 2.0 Flash 不支持 response_format: json_schema，直接用 json_object
const USE_JSON_SCHEMA = false;
const USE_TOOL_CALLING = process.env.AI_USE_TOOL_CALLING === 'true';
const USE_EMBEDDING = process.env.AI_USE_EMBEDDING !== 'false';
const EMBEDDING_TOP_K = Number(process.env.EMBEDDING_TOP_K || 8);
const EMBEDDING_MIN_SCORE = Number(process.env.EMBEDDING_MIN_SCORE || 0.6);

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
// Embedding 候选检索（Tag2/Tag3）
// ============================================

interface TagCandidates {
  tag1List: string[];
  tag2List: string[];
  tag3List: string[];
  tag2Candidates: SimilarTag[];
  tag3Candidates: SimilarTag[];
  usedEmbedding: boolean;
}

/**
 * 同步向量库：确保向量库中包含所有现有标签的向量
 * 只在标签缓存刷新时调用一次
 */
async function syncTagVectors(existingTags: TagRecord[], ownerId?: string): Promise<void> {
  if (!USE_EMBEDDING || !ownerId) return;

  const store = TagVectorStore.getInstance(ownerId);
  await store.ensureLoaded();

  const storedCount = await store.getTagCount();
  const totalTags = existingTags.length;

  // 如果向量库为空或数量差异大，全量同步
  if (storedCount === 0 || Math.abs(storedCount - totalTags) > 5) {
    console.log(`[Embedding] 同步标签向量: ${totalTags} 个标签（当前向量库: ${storedCount}）`);
    const tagsToEmbed: Array<{ tagId: string; tagName: string; vector: number[]; definition?: string }> = [];

    for (const tag of existingTags) {
      const tagName = tag.tag1Name || tag.tag2Name || tag.tag3Name;
      if (!tagName) continue;

      const existing = await store.getTag(tag.tagId);
      if (existing) continue; // 已有，跳过

      // 计算向量（逐条，避免并发太高）
      const vec = await embed(tagName);
      tagsToEmbed.push({ tagId: tag.tagId, tagName, vector: vec });
    }

    if (tagsToEmbed.length > 0) {
      await store.batchUpsertTags(tagsToEmbed);
      console.log(`[Embedding] 新增 ${tagsToEmbed.length} 个标签向量`);
    }
  }
}

/**
 * 为单条反馈检索相似标签候选（仅 Tag2/Tag3）
 * Tag1 数量少（~7个），不需要 embedding
 */
async function getTagCandidatesForFeedback(
  content: string,
  unsatisfactoryReason: string,
  existingTags: TagRecord[],
  ownerId?: string
): Promise<TagCandidates> {
  const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
  const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
  const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);

  // embedding 关闭或无 ownerId，返回全量
  if (!USE_EMBEDDING || !ownerId) {
    return { tag1List, tag2List, tag3List, tag2Candidates: [], tag3Candidates: [], usedEmbedding: false };
  }

  try {
    const store = TagVectorStore.getInstance(ownerId);
    const vectorMap = await store.getVectorMap();

    if (Object.keys(vectorMap).length === 0) {
      // 向量库为空，返回全量
      return { tag1List, tag2List, tag3List, tag2Candidates: [], tag3Candidates: [], usedEmbedding: false };
    }

    // 构造查询文本（反馈内容 + 不满意原因）
    const queryText = `${content} ${unsatisfactoryReason}`.trim();
    const queryVec = await embed(queryText, 'query');

    // 检索所有标签的 Top-K（后续按层级过滤）
    const allCandidates = searchSimilarTags(queryVec, vectorMap, EMBEDDING_TOP_K * 3, EMBEDDING_MIN_SCORE);

    // 按层级分类
    const tag2Set = new Set(tag2List);
    const tag3Set = new Set(tag3List);

    const tag2Candidates: SimilarTag[] = [];
    const tag3Candidates: SimilarTag[] = [];

    for (const cand of allCandidates) {
      if (tag2Set.has(cand.tagName) && tag2Candidates.length < EMBEDDING_TOP_K) {
        tag2Candidates.push(cand);
      } else if (tag3Set.has(cand.tagName) && tag3Candidates.length < EMBEDDING_TOP_K) {
        tag3Candidates.push(cand);
      }
    }

    // 如果候选太少（< 3），说明 embedding 可能不准，回退到全量
    if (tag2Candidates.length < 3 && tag2List.length > 10) {
      console.warn(`[Embedding] Tag2 候选不足 (${tag2Candidates.length})，回退全量`);
      return { tag1List, tag2List, tag3List, tag2Candidates: [], tag3Candidates: [], usedEmbedding: false };
    }

    return {
      tag1List,
      tag2List: tag2Candidates.length > 0 ? tag2Candidates.map(c => c.tagName) : tag2List,
      tag3List: tag3Candidates.length > 0 ? tag3Candidates.map(c => c.tagName) : tag3List,
      tag2Candidates,
      tag3Candidates,
      usedEmbedding: true,
    };
  } catch (error) {
    console.warn('[Embedding] 候选检索失败，回退全量:', error);
    return { tag1List, tag2List, tag3List, tag2Candidates: [], tag3Candidates: [], usedEmbedding: false };
  }
}

/**
 * 为一批反馈检索候选标签（批量优化）
 * 对每条反馈分别检索，返回与 batch 一一对应的候选
 */
async function batchGetTagCandidates(
  batch: Array<{ content: string; unsatisfactoryReason: string }>,
  existingTags: TagRecord[],
  ownerId?: string
): Promise<TagCandidates[]> {
  if (!USE_EMBEDDING || !ownerId) {
    const base = {
      tag1List: existingTags.filter(t => t.tag1Name).map(t => t.tag1Name),
      tag2List: existingTags.filter(t => t.tag2Name).map(t => t.tag2Name),
      tag3List: existingTags.filter(t => t.tag3Name).map(t => t.tag3Name),
      tag2Candidates: [] as SimilarTag[],
      tag3Candidates: [] as SimilarTag[],
      usedEmbedding: false,
    };
    return batch.map(() => base);
  }

  // 先同步向量库
  await syncTagVectors(existingTags, ownerId);

  const results: TagCandidates[] = [];
  for (const item of batch) {
    results.push(await getTagCandidatesForFeedback(item.content, item.unsatisfactoryReason, existingTags, ownerId));
  }
  return results;
}

// ============================================
// 单条反馈打标
// ============================================

/**
 * 对单条反馈进行AI打标
 * @param ownerId 用户ID，用于注入用户画像
 */
export async function analyzeFeedback(
  content: string,
  unsatisfactoryReason: string,
  source: string,
  existingTags: TagRecord[],
  confidenceThreshold: number,
  ownerId?: string
): Promise<AITagResult> {
  const sanitizedContent = sanitizeUserInput(content);
  const sanitizedReason = sanitizeUserInput(unsatisfactoryReason);

  // Embedding 候选检索
  const candidates = await getTagCandidatesForFeedback(
    sanitizedContent.cleaned,
    sanitizedReason.cleaned,
    existingTags,
    ownerId
  );

  let prompt: string;
  if (candidates.usedEmbedding) {
    prompt = generateBatchTaggingPromptWithCandidates(
      [{ id: '0', content: sanitizedContent.cleaned, score: 0, source, unsatisfactoryReason: sanitizedReason.cleaned }],
      candidates.tag1List,
      candidates.tag2List,
      candidates.tag3List,
      candidates.tag2Candidates,
      candidates.tag3Candidates,
      confidenceThreshold
    );
    console.log(`[Embedding] 单条打标使用候选: Tag2=${candidates.tag2Candidates.length}, Tag3=${candidates.tag3Candidates.length}`);
  } else {
    prompt = generateBatchTaggingPrompt(
      [{ id: '0', content: sanitizedContent.cleaned, score: 0, source, unsatisfactoryReason: sanitizedReason.cleaned }],
      candidates.tag1List, candidates.tag2List, candidates.tag3List, confidenceThreshold
    );
  }

  if (ownerId) {
    prompt = await injectProfileToPrompt(prompt, ownerId);
  }

  const securePrompt = `${prompt}\n\n${CONSTITUTIONAL_REFUSAL}`;

  let result: BatchTaggingResult;
  if (USE_JSON_SCHEMA) {
    try {
      result = await chatCompletionJsonSchema<BatchTaggingResult>(
        [{ role: 'user', content: securePrompt }],
        BatchTaggingJsonSchema,
        { temperature: 0.3, maxTokens: 2048, taskType: 'analyzeFeedback' }
      );
      console.log('[Tagger] 使用 JSON Schema 打标成功');
    } catch (error) {
      console.warn('[Tagger] JSON Schema 打标失败，降级到 Zod + 重试:', error);
      result = await chatCompletionJSONSafe(
        [{ role: 'user', content: securePrompt }],
        BatchTaggingResultSchema,
        { temperature: 0.3, taskType: 'analyzeFeedback' }
      );
    }
  } else {
    result = await chatCompletionJSONSafe(
      [{ role: 'user', content: securePrompt }],
      BatchTaggingResultSchema,
      { temperature: 0.3, taskType: 'analyzeFeedback' }
    );
  }

  const raw = result.results[0] || {
    tag1: [],
    tag2: [],
    tag3: [],
    confidence: 0,
    needLogCheck: false,
    translatedContent: '',
  };
  return normalizeTagResult(raw, confidenceThreshold, sanitizedContent.cleaned);
}

// ============================================
// 批量反馈打标
// ============================================

/**
 * 批量对一组反馈进行AI打标
 * @param batch 反馈数组（每条含 record_id, content, score, source, unsatReason）
 * @param existingTags 已有标签（用于 prompt 注入）
 * @param confidenceThreshold 置信度阈值（必须显式传递，默认值由调用方控制）
 * @param ownerId 用户ID，用于注入用户画像
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
  confidenceThreshold: number,
  ownerId?: string
): Promise<Array<{ success: boolean; result?: AITagResult; recordId: string }>> {
  const inputs = batch
    .filter(f => f.content)
    .map((fb) => {
      // 清洗反馈内容与不满意原因，防止 Prompt 注入
      const sanitizedContent = sanitizeUserInput(fb.content);
      const sanitizedReason = sanitizeUserInput(fb.unsatReason);
      return {
        id: fb.record_id,
        content: sanitizedContent.cleaned,
        score: fb.score,
        source: fb.source,
        unsatisfactoryReason: sanitizedReason.cleaned,
      };
    });

  if (inputs.length === 0) {
    return batch.map(fb => ({ success: false, recordId: fb.record_id }));
  }

  // Embedding 候选检索（批量，取并集）
  const allCandidates = await batchGetTagCandidates(
    inputs.map(i => ({ content: i.content, unsatisfactoryReason: i.unsatisfactoryReason })),
    existingTags,
    ownerId
  );

  // 取所有反馈候选的并集作为 Prompt 中的标签列表
  const tag1List = allCandidates[0]?.tag1List || [];
  const usedEmbedding = allCandidates.some(c => c.usedEmbedding);

  let tag2List: string[];
  let tag3List: string[];
  let tag2Candidates: SimilarTag[] = [];
  let tag3Candidates: SimilarTag[] = [];

  if (usedEmbedding) {
    const tag2Set = new Set<string>();
    const tag3Set = new Set<string>();
    const tag2ScoreMap = new Map<string, number>();
    const tag3ScoreMap = new Map<string, number>();

    for (const c of allCandidates) {
      for (const cand of c.tag2Candidates) {
        tag2Set.add(cand.tagName);
        tag2ScoreMap.set(cand.tagName, Math.max(tag2ScoreMap.get(cand.tagName) || 0, cand.score));
      }
      for (const cand of c.tag3Candidates) {
        tag3Set.add(cand.tagName);
        tag3ScoreMap.set(cand.tagName, Math.max(tag3ScoreMap.get(cand.tagName) || 0, cand.score));
      }
    }

    tag2List = Array.from(tag2Set);
    tag3List = Array.from(tag3Set);

    tag2Candidates = tag2List.map(name => ({
      tagId: name,
      tagName: name,
      score: tag2ScoreMap.get(name) || 0,
    })).sort((a, b) => b.score - a.score);

    tag3Candidates = tag3List.map(name => ({
      tagId: name,
      tagName: name,
      score: tag3ScoreMap.get(name) || 0,
    })).sort((a, b) => b.score - a.score);

    console.log(`[Embedding] 批量打标候选并集: Tag2=${tag2List.length}/${existingTags.filter(t=>t.tag2Name).length}, Tag3=${tag3List.length}/${existingTags.filter(t=>t.tag3Name).length}`);
  } else {
    tag2List = allCandidates[0]?.tag2List || [];
    tag3List = allCandidates[0]?.tag3List || [];
  }

  let prompt: string;
  if (usedEmbedding && tag2Candidates.length > 0 && tag3Candidates.length > 0) {
    prompt = generateBatchTaggingPromptWithCandidates(
      inputs,
      tag1List,
      tag2List,
      tag3List,
      tag2Candidates,
      tag3Candidates,
      confidenceThreshold
    );
  } else {
    prompt = generateBatchTaggingPrompt(inputs, tag1List, tag2List, tag3List, confidenceThreshold);
  }
  
  if (ownerId) {
    prompt = await injectProfileToPrompt(prompt, ownerId);
  }
  
  const securePrompt = `${prompt}\n\n${CONSTITUTIONAL_REFUSAL}`;

  // ========== 日志：打印提交给 AI 的数据和 Prompt ==========
  console.log('\n' + '='.repeat(60));
  console.log('【AI 打标 - 提交给 AI 的数据】');
  console.log('='.repeat(60));
  console.log(`📊 本次批次: ${inputs.length} 条反馈`);
  console.log(`🏷️  已有标签数量: Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`);
  console.log(`🧠  Embedding 候选: ${usedEmbedding ? '已启用' : '未启用'}`);
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
    let result: BatchTaggingResult;
    if (USE_JSON_SCHEMA) {
      try {
        result = await chatCompletionJsonSchema<BatchTaggingResult>(
          [{ role: 'user', content: securePrompt }],
          BatchTaggingJsonSchema,
          { temperature: 0.1, maxTokens: 4096, taskType: 'batchAnalyzeFeedbacks' }
        );
        console.log('[Tagger] 批量打标使用 JSON Schema 成功');
      } catch (error) {
        console.warn('[Tagger] JSON Schema 批量打标失败，降级到 Zod + 重试:', error);
        result = await chatCompletionJSONSafe(
          [{ role: 'user', content: securePrompt }],
          BatchTaggingResultSchema,
          { temperature: 0.1, maxTokens: 4096, taskType: 'batchAnalyzeFeedbacks' }
        );
      }
    } else {
      result = await chatCompletionJSONSafe(
        [{ role: 'user', content: securePrompt }],
        BatchTaggingResultSchema,
        { temperature: 0.1, maxTokens: 4096, taskType: 'batchAnalyzeFeedbacks' }
      );
    }

    // ========== 日志：打印 AI 返回的数据 ==========
    console.log('\n' + '='.repeat(60));
    console.log('【AI 打标 - AI 返回结果】');
    console.log('='.repeat(60));
    const resultsArray = result.results;
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
      const normalized = normalizeTagResult(
        raw || { tag1: [], tag2: [], tag3: [], confidence: 0, needLogCheck: false, translatedContent: '' },
        confidenceThreshold,
        fb.content
      );
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
 * 
 * 打标模式：
 * - 工具调用模式（USE_TOOL_CALLING=true）：AI 通过工具调用查询/创建标签，标签一致性更高
 * - 标准模式：使用 JSON Schema 或 Zod + 重试进行打标
 */
export async function completeTaggingProcess(
  feedbackId: string,
  content: string,
  score: number,
  module: string,
  unsatisfactoryReason: string,
  source: string,
  recordId: string,
  confidenceThreshold: number = 0.8,
  ownerId?: string
): Promise<{ success: boolean; result?: AITagResult; newTagsCreated: number }> {
  try {
    console.log(`[Tagger] 开始处理反馈: ${feedbackId}`);

    if (USE_TOOL_CALLING) {
      console.log('[Tagger] 使用工具调用模式打标');
      const toolResult = await completeTaggingProcessWithTools(
        feedbackId, content, score, module, unsatisfactoryReason, source, recordId, confidenceThreshold
      );
      if (toolResult.success && toolResult.result) {
        const result: AITagResult = {
          tag1: toolResult.result.tag1,
          tag2: toolResult.result.tag2,
          tag3: toolResult.result.tag3,
          confidence: toolResult.result.confidence,
          needLogCheck: toolResult.result.needLogCheck,
          reviewNeeded: toolResult.result.reviewNeeded,
          translatedContent: toolResult.result.translatedContent,
        };
        return { success: true, result, newTagsCreated: toolResult.result.newTagsCreated };
      }
      console.warn('[Tagger] 工具调用模式失败，降级到标准模式');
    }

    // 1. 获取已有标签
    const existingTags = await getCachedTags();

    // 2. AI打标
    console.log(`[Tagger] 步骤1: AI分析反馈内容`);
    const aiResult = await analyzeFeedback(content, unsatisfactoryReason, source, existingTags, confidenceThreshold, ownerId);
    console.log(`[Tagger] AI分析结果: tag1=${aiResult.tag1}, tag2=${aiResult.tag2}, tag3=${aiResult.tag3}, confidence=${aiResult.confidence}`);

    // 3. 创建/更新标签
    console.log(`[Tagger] 步骤2: 创建/更新标签`);
    let newTagsCreated = 0;
    for (const tag1 of aiResult.tag1) {
      await ensureTagExists(tag1, 'tag1', ownerId);
      newTagsCreated++;
    }
    for (const tag2 of aiResult.tag2) {
      await ensureTagExists(tag2, 'tag2', ownerId);
      newTagsCreated++;
    }
    for (const tag3 of aiResult.tag3) {
      await ensureTagExists(tag3, 'tag3', ownerId);
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

    // 5. 更新向量质心（Embedding 模式下）
    if (USE_EMBEDDING && ownerId && !aiResult.reviewNeeded) {
      try {
        const store = TagVectorStore.getInstance(ownerId);
        const queryText = `${content} ${unsatisfactoryReason}`.trim();
        const feedbackVec = await embed(queryText, 'passage');

        // 收集所有需要更新质心的标签（只更新 tag2 和 tag3，tag1 数量少不需要）
        const tagNames = [...aiResult.tag2, ...aiResult.tag3];
        const allTags = await getCachedTags();

        let updatedCount = 0;
        for (const tagName of tagNames) {
          const tagRecord = allTags.find(t =>
            (t.table === 'tag2' && t.tag2Name === tagName) ||
            (t.table === 'tag3' && t.tag3Name === tagName)
          );
          if (tagRecord) {
            await store.updateCentroid(tagRecord.tagId, feedbackVec);
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          console.log(`[Embedding] 更新质心: ${updatedCount} 个标签`);
        }
      } catch (err) {
        console.warn('[Embedding] 质心更新失败（不影响打标结果）:', err);
      }
    }

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
 * @param ownerId 用户ID（可选，传入时会同步新标签到向量库）
 */
export async function ensureTagExists(
  tagName: string,
  level: 'tag1' | 'tag2' | 'tag3',
  ownerId?: string
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

    // 同步到向量库（Embedding 模式下）
    if (USE_EMBEDDING && ownerId) {
      try {
        const store = TagVectorStore.getInstance(ownerId);
        const vec = await embed(tagName);
        await store.upsertTag(tagId, tagName, vec);
        console.log(`[Embedding] 新标签已加入向量库: ${tagName}`);
      } catch (err) {
        console.warn('[Embedding] 新标签向量同步失败（不影响打标结果）:', err);
      }
    }

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
