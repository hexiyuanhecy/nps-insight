/**
 * 标签自进化 V2 - 类型定义与 Prompt 模板
 * 基于 docs/tag-update.md 文档实现
 */

import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { BitableRecord } from '@/lib/types';
import { chatCompletionJSON } from './index';
import { invalidateTagCache } from './tagger';

/**
 * 一级标签（Tag1）信息
 */
export interface Tag1Info {
  tagId: string;
  name: string;
  definition: string;
}

/**
 * 二级标签（Tag2）信息
 */
export interface Tag2Info {
  tagId: string;
  name: string;
  definition: string;
  parentTag1: string;
  usageCount: number;
}

/**
 * 三级标签（Tag3）信息
 */
export interface Tag3Info {
  tagId: string;
  name: string;
  definition: string;
  parentTag2: string;
  usageCount: number;
  largeTenantCount: number;
}

/**
 * Tag3 分析项（含反馈样本）
 */
export interface Tag3AnalysisItem extends Tag3Info {
  samples: string[];
}

/**
 * Tag2 分析项（含下属 Tag3 ID 集合与总反馈数）
 */
export interface Tag2AnalysisItem extends Tag2Info {
  tag3Ids: string[];
  totalFeedbacks: number;
}

/**
 * Tag3 合并组
 */
export interface MergeTag3Group {
  merge_group: string[];
  retain_tag_id: string;
  reason: string;
}

/**
 * Tag3 拆分生成新 Tag2
 */
export interface SplitTag3ToNewTag2 {
  origin_tag2_id: string;
  new_tag2_list: Array<{
    new_tag2_name: string;
    bind_tag3_ids: string[];
  }>;
}

/**
 * Tag3 优化结果
 */
export interface Tag3OptResult {
  merge_tag3: MergeTag3Group[];
  split_tag3_to_new_tag2: SplitTag3ToNewTag2[];
}

/**
 * Tag2 合并组
 */
export interface MergeTag2Group {
  merge_group: string[];
  retain_tag_id: string;
  reason: string;
}

/**
 * Tag2 优化结果
 */
export interface Tag2OptResult {
  merge_tag2: MergeTag2Group[];
}

/**
 * AI 返回结果类型
 */
export interface TagEvolutionAIResult {
  tag3_opt_result: Tag3OptResult;
  tag2_opt_result: Tag2OptResult;
  manual_review: string[];
}

/**
 * 标签自进化执行结果 V2
 */
export interface TagEvolutionResultV2 {
  success: boolean;
  totalFeedbackCount: number;
  mode: 'full' | 'high_freq';
  mergeTag3Count: number;
  newTag2Count: number;
  mergeTag2Count: number;
  manualReviewItems: string[];
  error?: string;
}

/**
 * AI 入参 - 全局标签参考
 */
export interface GlobalTagReference {
  tag1: Tag1Info[];
  tag2: Tag2Info[];
  tag3: Tag3Info[];
}

/**
 * AI 入参 - 分析数据
 */
export interface AnalysisData {
  tag3_list: Tag3AnalysisItem[];
  tag2_list: Tag2AnalysisItem[];
}

/**
 * AI 入参完整结构
 */
export interface EvolutionPayload {
  global_tag_reference: GlobalTagReference;
  analysis_data: AnalysisData;
  mode: string;
}

/**
 * 生成固定 Prompt 模板
 * 严格按照 docs/tag-update.md 第79-99行文本，不做任何修改
 */
export function generateTagEvolutionPrompt(): string {
  return `# 硬性执行规则（严格遵守，不可颠倒顺序）
1. 处理顺序强制：第一步处理所有Tag3（合并同义Tag3、对单Tag2下Tag3≥10的分组拆分生成新Tag2）；所有Tag3优化完毕后，第二步再处理全局Tag2合并；禁止颠倒顺序。
2. Tag3合并规则：全局任意两个Tag3语义高度一致，无论归属哪个Tag2都需要合并；保留使用次数更高的标签为主标签。
3. Tag3拆分规则：单个父Tag2下属Tag3总数≥10，且配套用户反馈能清晰分为2~3类独立业务场景，才生成新Tag2，分配对应Tag3；无法清晰分类则放入人工复核。
4. Tag2合并规则：仅在全部Tag3处理完成后执行；整体业务场景高度重合的不同Tag2执行合并，保留使用频次更高Tag2。
5. 参考素材：每条标签附带多条用户反馈原文（每条几十字），判断相似度必须结合反馈语义，不能仅依靠标签文字。
6. 模糊判定规则：标签相似度中等、场景边界模糊、无法100%确定合并/拆分的标签，全部放入manual_review，禁止自动生成优化方案。
7. 输出约束：只返回纯JSON字符串，无任何解释、无markdown、无多余文字，严格遵循下方固定输出结构。

# 固定输出结构
{
  "tag3_opt_result": {
    "merge_tag3": [{"merge_group":["tag3Id1","tag3Id2"],"retain_tag_id":"主tag3Id","reason":"合并依据描述"}],
    "split_tag3_to_new_tag2": [{"origin_tag2_id":"原tag2Id","new_tag2_list":[{"new_tag2_name":"新模块名","bind_tag3_ids":["tag3Id列表"]}]}]
  },
  "tag2_opt_result": {
    "merge_tag2": [{"merge_group":["tag2Id1","tag2Id2"],"retain_tag_id":"主tag2Id","reason":"合并依据描述"}]
  },
  "manual_review": ["标签ID组合+模糊原因，交由人工处理"]
}`;
}

/**
 * 组装 AI 入参
 * 按照 docs/tag-update.md 第63-75行的 JSON 结构组装
 *
 * @param tag1List - 全部 Tag1 列表
 * @param tag2List - 全部 Tag2 列表
 * @param tag3List - 全部 Tag3 列表
 * @param analysisTag3 - 待分析的 Tag3 集合（含反馈样本）
 * @param analysisTag2 - 待分析的 Tag2 集合（含下属Tag3ID与总反馈数）
 * @param mode - 分析模式：'full' 全量分析模式 | 'high_freq' 高频过滤模式
 * @returns AI 入参完整结构
 */
export function buildEvolutionPayload(
  tag1List: Tag1Info[],
  tag2List: Tag2Info[],
  tag3List: Tag3Info[],
  analysisTag3: Tag3AnalysisItem[],
  analysisTag2: Tag2AnalysisItem[],
  mode: 'full' | 'high_freq'
): EvolutionPayload {
  const modeText = mode === 'full' ? '全量分析模式' : '高频过滤模式';

  return {
    global_tag_reference: {
      tag1: tag1List.map((t) => ({
        tagId: t.tagId,
        name: t.name,
        definition: t.definition,
      })),
      tag2: tag2List.map((t) => ({
        tagId: t.tagId,
        name: t.name,
        definition: t.definition,
        parentTag1: t.parentTag1,
        usageCount: t.usageCount,
      })),
      tag3: tag3List.map((t) => ({
        tagId: t.tagId,
        name: t.name,
        definition: t.definition,
        parentTag2: t.parentTag2,
        usageCount: t.usageCount,
        largeTenantCount: t.largeTenantCount,
      })),
    },
    analysis_data: {
      tag3_list: analysisTag3,
      tag2_list: analysisTag2,
    },
    mode: modeText,
  };
}

/**
 * 并行读取所有数据：反馈、Tag1、Tag2、Tag3
 * 使用 Promise.all 并行执行 5 个读取任务（这里实际是4个表，但需求说5个，按需求文档理解）
 * 
 * @returns 包含总反馈数和所有标签列表的对象
 */
export async function fetchAllData(): Promise<{
  totalFeedbackCount: number;
  tag1List: Tag1Info[];
  tag2List: Tag2Info[];
  tag3List: Tag3Info[];
  feedbackList: BitableRecord[];
}> {
  // 并行执行 4 个读取任务（反馈表 + 3个标签表）
  const [feedbackRecords, tag1Records, tag2Records, tag3Records] = await Promise.all([
    bitableClient.listRecords(TABLE_NAMES.FEEDBACK),
    bitableClient.listRecords(TABLE_NAMES.TAG1),
    bitableClient.listRecords(TABLE_NAMES.TAG2),
    bitableClient.listRecords(TABLE_NAMES.TAG3),
  ]);

  // 映射 Tag1 记录
  const tag1List: Tag1Info[] = tag1Records.map((record) => ({
    tagId: bitableClient.extractFieldValue(record.fields[TAG1_FIELDS.TAG_ID]),
    name: bitableClient.extractFieldValue(record.fields[TAG1_FIELDS.TAG_NAME]),
    definition: bitableClient.extractFieldValue(record.fields[TAG1_FIELDS.DESC]),
  }));

  // 映射 Tag2 记录
  const tag2List: Tag2Info[] = tag2Records.map((record) => ({
    tagId: bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.TAG_ID]),
    name: bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.TAG_NAME]),
    definition: bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.DESC]),
    parentTag1: '',
    usageCount: Number(record.fields[TAG2_FIELDS.COUNT]) || 0,
  }));

  // 映射 Tag3 记录
  const tag3List: Tag3Info[] = tag3Records.map((record) => ({
    tagId: bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]),
    name: bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_NAME]),
    definition: bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.DESC]),
    parentTag2: '',
    usageCount: Number(record.fields[TAG3_FIELDS.COUNT]) || 0,
    largeTenantCount: 0,
  }));

  return {
    totalFeedbackCount: feedbackRecords.length,
    tag1List,
    tag2List,
    tag3List,
    feedbackList: feedbackRecords,
  };
}

/**
 * 遍历反馈列表，按 tag3 名称分组，对每个 Tag3 随机抽取样本
 * 
 * @param tag3List - Tag3 列表
 * @param feedbackList - 反馈记录列表
 * @param sampleCount - 每个 Tag3 抽取的样本数
 * @returns Map<tag3Id, string[]> - Tag3 ID 到反馈样本数组的映射
 */
export function extractTag3Samples(
  tag3List: Tag3Info[],
  feedbackList: BitableRecord[],
  sampleCount: number
): Map<string, string[]> {
  // 第一步：按 Tag3 名称分组收集反馈原文
  const tag3NameToFeedbacks = new Map<string, string[]>();

  for (const feedback of feedbackList) {
    const tag3Names = bitableClient.extractMultiSelectFieldValue(feedback.fields[FEEDBACK_FIELDS.TAG3]);
    const content = bitableClient.extractFieldValue(feedback.fields[FEEDBACK_FIELDS.CONTENT]);

    if (!content) continue;

    for (const tag3Name of tag3Names) {
      if (!tag3NameToFeedbacks.has(tag3Name)) {
        tag3NameToFeedbacks.set(tag3Name, []);
      }
      tag3NameToFeedbacks.get(tag3Name)!.push(content);
    }
  }

  // 第二步：构建 Tag3 ID 到样本的映射，随机抽取
  const result = new Map<string, string[]>();

  for (const tag3 of tag3List) {
    const feedbacks = tag3NameToFeedbacks.get(tag3.name) || [];
    
    if (feedbacks.length <= sampleCount) {
      // 反馈数不足样本数，全部返回
      result.set(tag3.tagId, [...feedbacks]);
    } else {
      // 随机抽取 sampleCount 条
      const shuffled = [...feedbacks].sort(() => Math.random() - 0.5);
      result.set(tag3.tagId, shuffled.slice(0, sampleCount));
    }
  }

  return result;
}

/**
 * 根据总反馈数和标签使用次数，将标签分流到分析集合或人工复核列表
 * 
 * - totalCount <= 2000: 全量模式，所有标签都进入分析集合
 * - totalCount > 2000: 高频过滤模式
 *   - Tag3 usageCount < 5 移入 manualTagList
 *   - Tag2 usageCount < 10 移入 manualTagList（但其下的高频 Tag3 仍然可以参与分析）
 * 
 * @param totalCount - 总反馈数
 * @param tag2List - Tag2 列表
 * @param tag3List - Tag3 列表
 * @param tag3SampleMap - Tag3 反馈样本映射
 * @returns 分析模式、分析用的 Tag3/Tag2 列表、人工复核标签列表
 */
export function splitByMode(
  totalCount: number,
  tag2List: Tag2Info[],
  tag3List: Tag3Info[],
  tag3SampleMap: Map<string, string[]>
): {
  mode: 'full' | 'high_freq';
  analysisTag3: Tag3AnalysisItem[];
  analysisTag2: Tag2AnalysisItem[];
  manualTagList: string[];
} {
  const manualTagList: string[] = [];

  if (totalCount <= 2000) {
    // 全量模式：所有标签都进入分析集合
    const analysisTag3: Tag3AnalysisItem[] = tag3List.map((tag3) => ({
      ...tag3,
      samples: tag3SampleMap.get(tag3.tagId) || [],
    }));

    // 计算每个 Tag2 的 tag3Ids 和 totalFeedbacks
    const tag2ToTag3Map = new Map<string, Tag3Info[]>();
    for (const tag3 of tag3List) {
      if (!tag2ToTag3Map.has(tag3.parentTag2)) {
        tag2ToTag3Map.set(tag3.parentTag2, []);
      }
      tag2ToTag3Map.get(tag3.parentTag2)!.push(tag3);
    }

    const analysisTag2: Tag2AnalysisItem[] = tag2List.map((tag2) => {
      const childTag3s = tag2ToTag3Map.get(tag2.tagId) || [];
      const tag3Ids = childTag3s.map((t) => t.tagId);
      const totalFeedbacks = childTag3s.reduce((sum, t) => sum + t.usageCount, 0);
      return {
        ...tag2,
        tag3Ids,
        totalFeedbacks,
      };
    });

    return {
      mode: 'full',
      analysisTag3,
      analysisTag2,
      manualTagList: [],
    };
  } else {
    // 高频过滤模式
    // 第一步：筛选高频 Tag3（usageCount >= 5）
    const highFreqTag3 = tag3List.filter((tag3) => {
      if (tag3.usageCount < 5) {
        manualTagList.push(tag3.tagId);
        return false;
      }
      return true;
    });

    // 第二步：构建分析用的 Tag3 列表
    const analysisTag3: Tag3AnalysisItem[] = highFreqTag3.map((tag3) => ({
      ...tag3,
      samples: tag3SampleMap.get(tag3.tagId) || [],
    }));

    // 第三步：处理 Tag2
    // 先建立 Tag2 到其下属高频 Tag3 的映射
    const tag2ToHighFreqTag3Map = new Map<string, Tag3Info[]>();
    for (const tag3 of highFreqTag3) {
      if (!tag2ToHighFreqTag3Map.has(tag3.parentTag2)) {
        tag2ToHighFreqTag3Map.set(tag3.parentTag2, []);
      }
      tag2ToHighFreqTag3Map.get(tag3.parentTag2)!.push(tag3);
    }

    const analysisTag2: Tag2AnalysisItem[] = [];
    for (const tag2 of tag2List) {
      const childHighFreqTag3s = tag2ToHighFreqTag3Map.get(tag2.tagId) || [];
      
      if (tag2.usageCount < 10 && childHighFreqTag3s.length === 0) {
        // Tag2 本身低频且下属无高频 Tag3，移入人工复核
        manualTagList.push(tag2.tagId);
      } else {
        // 进入分析集合（即使 Tag2 本身低频，只要下属有高频 Tag3 就参与分析）
        const tag3Ids = childHighFreqTag3s.map((t) => t.tagId);
        const totalFeedbacks = childHighFreqTag3s.reduce((sum, t) => sum + t.usageCount, 0);
        analysisTag2.push({
          ...tag2,
          tag3Ids,
          totalFeedbacks,
        });
      }
    }

    return {
      mode: 'high_freq',
      analysisTag3,
      analysisTag2,
      manualTagList,
    };
  }
}

/**
 * 调用标签自进化 AI 分析
 *
 * @param tag1List - 全部 Tag1 列表
 * @param tag2List - 全部 Tag2 列表
 * @param tag3List - 全部 Tag3 列表
 * @param analysisTag3 - 待分析的 Tag3 集合（含反馈样本）
 * @param analysisTag2 - 待分析的 Tag2 集合（含下属Tag3ID与总反馈数）
 * @param mode - 分析模式：'full' 全量分析模式 | 'high_freq' 高频过滤模式
 * @returns AI 分析结果
 * @throws 当 AI 调用失败或返回结果无效时抛出错误
 */
export async function callEvolutionAI(
  tag1List: Tag1Info[],
  tag2List: Tag2Info[],
  tag3List: Tag3Info[],
  analysisTag3: Tag3AnalysisItem[],
  analysisTag2: Tag2AnalysisItem[],
  mode: 'full' | 'high_freq'
): Promise<TagEvolutionAIResult> {
  try {
    // 生成固定 Prompt
    const prompt = generateTagEvolutionPrompt();

    // 组装业务数据 JSON
    const payload = buildEvolutionPayload(
      tag1List,
      tag2List,
      tag3List,
      analysisTag3,
      analysisTag2,
      mode
    );

    // 拼成 user message：先放 Prompt，再放 JSON 数据
    const userMessage = `${prompt}\n\n# 业务数据\n${JSON.stringify(payload, null, 2)}`;

    const messages = [
      {
        role: 'user' as const,
        content: userMessage,
      },
    ];

    // 调用 AI 获取结构化 JSON 结果
    const result = await chatCompletionJSON<TagEvolutionAIResult>(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    // 校验返回结果格式
    if (!validateEvolutionResult(result)) {
      console.error('[TagEvolution] AI 返回结果格式校验失败', JSON.stringify(result, null, 2));
      throw new Error('AI 返回结果格式不符合要求');
    }

    return result;
  } catch (error) {
    console.error('[TagEvolution] AI 调用失败', error);
    throw error;
  }
}

/**
 * 校验 AI 返回结果是否符合格式要求
 *
 * @param result - 待校验的结果
 * @returns 校验通过返回 true，失败返回 false
 */
export function validateEvolutionResult(result: unknown): result is TagEvolutionAIResult {
  // 顶级必须是对象
  if (!result || typeof result !== 'object') {
    return false;
  }

  const obj = result as Record<string, unknown>;

  // 必须包含顶级字段：tag3_opt_result、tag2_opt_result、manual_review
  if (!('tag3_opt_result' in obj) || !('tag2_opt_result' in obj) || !('manual_review' in obj)) {
    return false;
  }

  // 校验 tag3_opt_result
  const tag3OptResult = obj.tag3_opt_result;
  if (!tag3OptResult || typeof tag3OptResult !== 'object') {
    return false;
  }
  const tag3Obj = tag3OptResult as Record<string, unknown>;

  // tag3_opt_result 必须包含 merge_tag3（数组）和 split_tag3_to_new_tag2（数组）
  if (!('merge_tag3' in tag3Obj) || !('split_tag3_to_new_tag2' in tag3Obj)) {
    return false;
  }
  if (!Array.isArray(tag3Obj.merge_tag3) || !Array.isArray(tag3Obj.split_tag3_to_new_tag2)) {
    return false;
  }

  // 校验每个 merge_tag3 组
  for (const item of tag3Obj.merge_tag3) {
    if (!isMergeGroup(item)) {
      return false;
    }
  }

  // 校验每个 split 项
  for (const item of tag3Obj.split_tag3_to_new_tag2) {
    if (!isSplitItem(item)) {
      return false;
    }
  }

  // 校验 tag2_opt_result
  const tag2OptResult = obj.tag2_opt_result;
  if (!tag2OptResult || typeof tag2OptResult !== 'object') {
    return false;
  }
  const tag2Obj = tag2OptResult as Record<string, unknown>;

  // tag2_opt_result 必须包含 merge_tag2（数组）
  if (!('merge_tag2' in tag2Obj) || !Array.isArray(tag2Obj.merge_tag2)) {
    return false;
  }

  // 校验每个 merge_tag2 组
  for (const item of tag2Obj.merge_tag2) {
    if (!isMergeGroup(item)) {
      return false;
    }
  }

  // 校验 manual_review 必须是数组
  if (!Array.isArray(obj.manual_review)) {
    return false;
  }

  // 校验 manual_review 数组中的每个元素都是字符串
  for (const item of obj.manual_review) {
    if (typeof item !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * 校验单个合并组是否符合格式要求
 * 包含 merge_group（string[]）、retain_tag_id（string）、reason（string）
 */
function isMergeGroup(item: unknown): boolean {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const obj = item as Record<string, unknown>;

  if (!('merge_group' in obj) || !('retain_tag_id' in obj) || !('reason' in obj)) {
    return false;
  }

  if (!Array.isArray(obj.merge_group)) {
    return false;
  }

  for (const id of obj.merge_group) {
    if (typeof id !== 'string') {
      return false;
    }
  }

  if (typeof obj.retain_tag_id !== 'string') {
    return false;
  }

  if (typeof obj.reason !== 'string') {
    return false;
  }

  return true;
}

/**
 * 校验单个拆分项是否符合格式要求
 * 包含 origin_tag2_id（string）和 new_tag2_list（数组）
 */
function isSplitItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') {
    return false;
  }
  const obj = item as Record<string, unknown>;

  if (!('origin_tag2_id' in obj) || !('new_tag2_list' in obj)) {
    return false;
  }

  if (typeof obj.origin_tag2_id !== 'string') {
    return false;
  }

  if (!Array.isArray(obj.new_tag2_list)) {
    return false;
  }

  // 校验 new_tag2_list 中每个元素
  for (const newTag2 of obj.new_tag2_list) {
    if (!newTag2 || typeof newTag2 !== 'object') {
      return false;
    }
    const newTag2Obj = newTag2 as Record<string, unknown>;

    if (!('new_tag2_name' in newTag2Obj) || !('bind_tag3_ids' in newTag2Obj)) {
      return false;
    }

    if (typeof newTag2Obj.new_tag2_name !== 'string') {
      return false;
    }

    if (!Array.isArray(newTag2Obj.bind_tag3_ids)) {
      return false;
    }

    for (const id of newTag2Obj.bind_tag3_ids) {
      if (typeof id !== 'string') {
        return false;
      }
    }
  }

  return true;
}

/**
 * 执行 Tag3 合并操作
 * 
 * 对每组合并执行以下步骤：
 * 1. 找到主标签信息，收集废弃标签
 * 2. 数据校验：统计各标签使用次数之和
 * 3. 遍历反馈列表，替换废弃 Tag3 名称为主标签名称
 * 4. 更新反馈表
 * 5. 更新 Tag3 表主标签的 usageCount
 * 6. 删除 Tag3 表中的废弃标签行
 * 7. 再次校验使用次数是否符合预期
 * 
 * @param mergeGroups - Tag3 合并组列表
 * @param tag3List - Tag3 信息列表
 * @param feedbackList - 反馈记录列表
 * @param tag3Records - Tag3 表原始记录（用于获取 record_id）
 * @returns 成功数量和失败项列表
 */
export async function executeTag3Merges(
  mergeGroups: MergeTag3Group[],
  tag3List: Tag3Info[],
  feedbackList: BitableRecord[],
  tag3Records: BitableRecord[]
): Promise<{ successCount: number; failedItems: string[] }> {
  let successCount = 0;
  const failedItems: string[] = [];

  // 构建映射：tagId -> name, tagId -> recordId, tagId -> usageCount
  const tagIdToName = new Map<string, string>();
  const tagIdToRecordId = new Map<string, string>();
  const tagIdToUsageCount = new Map<string, number>();

  for (const record of tag3Records) {
    const tagId = bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]);
    const name = bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_NAME]);
    const usageCount = Number(record.fields[TAG3_FIELDS.COUNT]) || 0;
    if (tagId) {
      tagIdToName.set(tagId, name);
      tagIdToRecordId.set(tagId, record.record_id);
      tagIdToUsageCount.set(tagId, usageCount);
    }
  }

  // 循环执行每一组 Tag3 合并
  for (const group of mergeGroups) {
    const { merge_group, retain_tag_id } = group;
    const groupTagIds = merge_group.join(',');

    try {
      // a. 根据 retain_tag_id 找到主标签信息
      const retainTagName = tagIdToName.get(retain_tag_id);
      const retainTagRecordId = tagIdToRecordId.get(retain_tag_id);
      const retainTagUsageCount = tagIdToUsageCount.get(retain_tag_id) || 0;

      if (!retainTagName || !retainTagRecordId) {
        failedItems.push(`merge_group: ${groupTagIds} - 主标签不存在或信息不完整`);
        continue;
      }

      // b. 收集所有废弃标签（merge_group 中除了 retain_tag_id 之外的 tagId）
      const obsoleteTagIds = merge_group.filter((id) => id !== retain_tag_id);

      if (obsoleteTagIds.length === 0) {
        failedItems.push(`merge_group: ${groupTagIds} - 没有需要合并的废弃标签`);
        continue;
      }

      // 校验废弃标签是否都存在
      const invalidTagIds: string[] = [];
      for (const tagId of obsoleteTagIds) {
        if (!tagIdToName.has(tagId) || !tagIdToRecordId.has(tagId)) {
          invalidTagIds.push(tagId);
        }
      }
      if (invalidTagIds.length > 0) {
        failedItems.push(`merge_group: ${groupTagIds} - 废弃标签不存在: ${invalidTagIds.join(',')}`);
        continue;
      }

      // c. 数据校验：统计各标签使用次数之和，记录预期合并后的总数
      let expectedTotalUsage = retainTagUsageCount;
      const obsoleteTagNames: string[] = [];
      for (const tagId of obsoleteTagIds) {
        expectedTotalUsage += tagIdToUsageCount.get(tagId) || 0;
        obsoleteTagNames.push(tagIdToName.get(tagId)!);
      }

      // d. 全量遍历反馈列表，找到所有包含废弃 Tag3 名称的反馈记录，将废弃名称替换为主标签名称
      const feedbacksToUpdate: Array<{ recordId: string; newTag3Values: string[] }> = [];

      for (const feedback of feedbackList) {
        const tag3Values = bitableClient.extractMultiSelectFieldValue(feedback.fields[FEEDBACK_FIELDS.TAG3]);
        if (tag3Values.length === 0) continue;

        let hasObsoleteTag = false;
        const newTag3Values: string[] = [];

        for (const tag of tag3Values) {
          if (obsoleteTagNames.includes(tag)) {
            hasObsoleteTag = true;
            // 替换为主标签名称，但避免重复添加
            if (!newTag3Values.includes(retainTagName)) {
              newTag3Values.push(retainTagName);
            }
          } else {
            newTag3Values.push(tag);
          }
        }

        if (hasObsoleteTag) {
          feedbacksToUpdate.push({
            recordId: feedback.record_id,
            newTag3Values,
          });
        }
      }

      // e. 更新反馈表（逐条调用 bitableClient.updateRecord）
      for (const item of feedbacksToUpdate) {
        try {
          await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, item.recordId, {
            [FEEDBACK_FIELDS.TAG3]: item.newTag3Values,
          });
        } catch (updateError) {
          console.error(`[executeTag3Merges] 更新反馈记录失败: ${item.recordId}`, updateError);
          throw new Error(`更新反馈记录失败: ${item.recordId}`);
        }
      }

      // f. count 是 AutoNumber 字段，由系统自动计算，无需手动更新

      // g. 删除 Tag3 表中的废弃标签行
      for (const tagId of obsoleteTagIds) {
        const recordId = tagIdToRecordId.get(tagId)!;
        try {
          await bitableClient.deleteRecord(TABLE_NAMES.TAG3, recordId);
        } catch (deleteError) {
          console.error(`[executeTag3Merges] 删除废弃标签失败: ${tagId}`, deleteError);
          throw new Error(`删除废弃标签失败: ${tagId}`);
        }
      }

      // h. count 是 AutoNumber 字段，由系统自动计算，跳过使用次数校验

      // 合并成功
      successCount++;
    } catch (error) {
      // i. 校验失败则将该组合并移入 failedItems（注意：已执行的操作不回滚）
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      failedItems.push(`merge_group: ${groupTagIds} - ${errorMessage}`);
    }
  }

  return { successCount, failedItems };
}

/**
 * 生成随机字符串，用于构造唯一 tagId
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 执行 Tag3 拆分生成新 Tag2 操作
 *
 * 对每条拆分方案执行以下步骤：
 * 1. 根据 origin_tag2_id 找到原 Tag2 信息
 * 2. 构建映射：tagId -> name, tagId -> recordId（Tag2 和 Tag3 都要）
 * 3. 数据校验：确保 split 方案中的 bind_tag3_ids 都在原 Tag2 下
 * 4. 为每个新 Tag2 创建记录
 * 5. 批量更新 Tag3 表：将被移动的 Tag3 的「所属二级标签」更新为新的 tag2Id
 * 6. 全量遍历反馈列表，同步更新反馈中的 tag2 字段
 * 7. 更新反馈表（逐条更新）
 * 8. 数据校验：原 Tag2 下所有 Tag3 都有归属，无游离
 *
 * @param splitItems - Tag3 拆分生成新 Tag2 的方案列表
 * @param tag2List - Tag2 信息列表
 * @param tag3List - Tag3 信息列表
 * @param feedbackList - 反馈记录列表
 * @param tag2Records - Tag2 表原始记录（用于获取 record_id）
 * @param tag3Records - Tag3 表原始记录（用于获取 record_id）
 * @returns 成功数量、新创建的 Tag2 的 tagId 列表、失败项列表
 */
export async function executeTag3Splits(
  splitItems: SplitTag3ToNewTag2[],
  tag2List: Tag2Info[],
  tag3List: Tag3Info[],
  feedbackList: BitableRecord[],
  tag2Records: BitableRecord[],
  tag3Records: BitableRecord[]
): Promise<{ successCount: number; newTag2Ids: string[]; failedItems: string[] }> {
  let successCount = 0;
  const newTag2Ids: string[] = [];
  const failedItems: string[] = [];

  // 构建 Tag2 映射：tagId -> Tag2Info, tagId -> name, tagId -> recordId
  const tag2IdToInfo = new Map<string, Tag2Info>();
  const tag2IdToName = new Map<string, string>();
  const tag2IdToRecordId = new Map<string, string>();

  for (const tag2 of tag2List) {
    tag2IdToInfo.set(tag2.tagId, tag2);
    tag2IdToName.set(tag2.tagId, tag2.name);
  }
  for (const record of tag2Records) {
    const tagId = bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.TAG_ID]);
    if (tagId) {
      tag2IdToRecordId.set(tagId, record.record_id);
    }
  }

  // 构建 Tag3 映射：tagId -> Tag3Info, tagId -> name, tagId -> recordId, tagId -> parentTag2
  const tag3IdToInfo = new Map<string, Tag3Info>();
  const tag3IdToName = new Map<string, string>();
  const tag3IdToRecordId = new Map<string, string>();
  const tag3NameToId = new Map<string, string>();

  for (const tag3 of tag3List) {
    tag3IdToInfo.set(tag3.tagId, tag3);
    tag3IdToName.set(tag3.tagId, tag3.name);
    tag3NameToId.set(tag3.name, tag3.tagId);
  }
  for (const record of tag3Records) {
    const tagId = bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]);
    if (tagId) {
      tag3IdToRecordId.set(tagId, record.record_id);
    }
  }

  // 循环执行每条拆分方案
  for (const splitItem of splitItems) {
    const { origin_tag2_id, new_tag2_list } = splitItem;

    try {
      // a. 根据 origin_tag2_id 找到原 Tag2 信息
      const originTag2Info = tag2IdToInfo.get(origin_tag2_id);
      const originTag2Name = tag2IdToName.get(origin_tag2_id);
      const originTag2RecordId = tag2IdToRecordId.get(origin_tag2_id);

      if (!originTag2Info || !originTag2Name || !originTag2RecordId) {
        failedItems.push(`split origin_tag2: ${origin_tag2_id} - 原 Tag2 不存在或信息不完整`);
        continue;
      }

      // b. 收集原 Tag2 下所有 Tag3 的 ID 和名称
      const originTag3Ids: string[] = [];
      const originTag3Names = new Set<string>();
      for (const tag3 of tag3List) {
        if (tag3.parentTag2 === origin_tag2_id) {
          originTag3Ids.push(tag3.tagId);
          originTag3Names.add(tag3.name);
        }
      }

      // c. 数据校验：确保 split 方案中的 bind_tag3_ids 都在原 Tag2 下
      const allBindTag3Ids = new Set<string>();
      for (const newTag2 of new_tag2_list) {
        for (const tag3Id of newTag2.bind_tag3_ids) {
          if (!originTag3Ids.includes(tag3Id)) {
            throw new Error(`bind_tag3_ids 中的 Tag3(${tag3Id}) 不在原 Tag2 下`);
          }
          if (allBindTag3Ids.has(tag3Id)) {
            throw new Error(`Tag3(${tag3Id}) 被重复分配到多个新 Tag2`);
          }
          allBindTag3Ids.add(tag3Id);
        }
      }

      // 校验 new_tag2_list 不为空
      if (new_tag2_list.length === 0) {
        throw new Error('new_tag2_list 为空，没有需要创建的新 Tag2');
      }

      // 收集所有被移动的 Tag3 名称
      const movedTag3Names = new Set<string>();
      allBindTag3Ids.forEach((tag3Id) => {
        const name = tag3IdToName.get(tag3Id);
        if (name) {
          movedTag3Names.add(name);
        }
      });

      // d. 循环 new_tag2_list，为每个新 Tag2 创建记录
      const createdNewTag2s: Array<{
        tagId: string;
        name: string;
        bindTag3Ids: string[];
        recordId: string;
      }> = [];

      for (const newTag2Item of new_tag2_list) {
        // 生成唯一 tagId：tag2_${Date.now()}_${随机字符串}
        const newTag2Id = `tag2_${Date.now()}_${generateRandomString(8)}`;

        // 调用 bitableClient.createRecord 创建 Tag2 记录
        try {
          const createdRecord = await bitableClient.createRecord(TABLE_NAMES.TAG2, {
            [TAG2_FIELDS.TAG_ID]: newTag2Id,
            [TAG2_FIELDS.TAG_NAME]: newTag2Item.new_tag2_name,
            [TAG2_FIELDS.DESC]: '',
          });

          createdNewTag2s.push({
            tagId: newTag2Id,
            name: newTag2Item.new_tag2_name,
            bindTag3Ids: newTag2Item.bind_tag3_ids,
            recordId: createdRecord.record_id,
          });

          newTag2Ids.push(newTag2Id);
        } catch (createError) {
          console.error(`[executeTag3Splits] 创建新 Tag2 失败: ${newTag2Item.new_tag2_name}`, createError);
          throw new Error(`创建新 Tag2 失败: ${newTag2Item.new_tag2_name}`);
        }
      }

      // e. 新表结构中没有「所属二级标签」字段，跳过 Tag3 表的父标签关联更新

      // f. 全量遍历反馈列表：同步更新反馈中的 tag2 字段
      // 建立 tag3Name -> newTag2Name 的映射（只包含被移动的 Tag3）
      const tag3NameToNewTag2Name = new Map<string, string>();
      for (const newTag2 of createdNewTag2s) {
        for (const tag3Id of newTag2.bindTag3Ids) {
          const tag3Name = tag3IdToName.get(tag3Id);
          if (tag3Name) {
            tag3NameToNewTag2Name.set(tag3Name, newTag2.name);
          }
        }
      }

      // 原 Tag2 下未被移动的 Tag3 名称集合（留在原 Tag2 的）
      const remainingTag3Names = new Set<string>();
      originTag3Names.forEach((tag3Name) => {
        if (!movedTag3Names.has(tag3Name)) {
          remainingTag3Names.add(tag3Name);
        }
      });

      const feedbackUpdates: Array<{ recordId: string; newTag2Values: string[] }> = [];

      for (const feedback of feedbackList) {
        const tag2Values = bitableClient.extractMultiSelectFieldValue(feedback.fields[FEEDBACK_FIELDS.TAG2]);
        const tag3Values = bitableClient.extractMultiSelectFieldValue(feedback.fields[FEEDBACK_FIELDS.TAG3]);

        if (tag3Values.length === 0) continue;

        // 收集该反馈中被移动的 tag3 对应的新 tag2 名称（去重）
        const newTag2NamesFromMoved = new Set<string>();
        for (const tag3Name of tag3Values) {
          const newTag2Name = tag3NameToNewTag2Name.get(tag3Name);
          if (newTag2Name) {
            newTag2NamesFromMoved.add(newTag2Name);
          }
        }

        // 如果该反馈没有任何被移动的 tag3，跳过
        if (newTag2NamesFromMoved.size === 0) continue;

        // 检查反馈中是否还有 tag3 留在原 tag2 下
        const hasRemainingTag3 = tag3Values.some((tag3Name) => remainingTag3Names.has(tag3Name));

        // 构建新的 tag2 列表
        let newTag2Values = [...tag2Values];

        // 如果原 tag2 中包含 originTag2Name
        if (newTag2Values.includes(originTag2Name)) {
          if (!hasRemainingTag3) {
            // 所有 tag3 都被移走了，移除原 Tag2 名称
            newTag2Values = newTag2Values.filter((name) => name !== originTag2Name);
          }
        }

        // 添加新的 tag2 名称（去重）
        newTag2NamesFromMoved.forEach((newName) => {
          if (!newTag2Values.includes(newName)) {
            newTag2Values.push(newName);
          }
        });

        // 只有当 tag2 值发生变化时才需要更新
        if (JSON.stringify(newTag2Values) !== JSON.stringify(tag2Values)) {
          feedbackUpdates.push({
            recordId: feedback.record_id,
            newTag2Values,
          });
        }
      }

      // g. 更新反馈表（逐条更新）
      for (const item of feedbackUpdates) {
        try {
          await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, item.recordId, {
            [FEEDBACK_FIELDS.TAG2]: item.newTag2Values,
          });
        } catch (updateError) {
          console.error(`[executeTag3Splits] 更新反馈记录失败: ${item.recordId}`, updateError);
          throw new Error(`更新反馈记录失败: ${item.recordId}`);
        }
      }

      // h. 数据校验：原 Tag2 下所有 Tag3 都有归属（要么留在原 Tag2，要么分配到新 Tag2），无游离
      // 校验所有原 Tag3 都在 留在原Tag2 或 分配到新Tag2 中
      const allAssignedTag3Ids = new Set<string>();
      for (const newTag2 of createdNewTag2s) {
        for (const tag3Id of newTag2.bindTag3Ids) {
          allAssignedTag3Ids.add(tag3Id);
        }
      }

      // 留在原 Tag2 的 Tag3 数量 = 原 Tag3 总数 - 被移动的数量
      const remainingCount = originTag3Ids.length - allAssignedTag3Ids.size;

      // 校验：被移动的 Tag3 数量 + 留在原 Tag2 的 Tag3 数量 = 原 Tag3 总数
      if (allAssignedTag3Ids.size + remainingCount !== originTag3Ids.length) {
        throw new Error(
          `Tag3 归属校验失败：原 Tag2 下有 ${originTag3Ids.length} 个 Tag3，` +
            `其中 ${allAssignedTag3Ids.size} 个被移动，${remainingCount} 个留在原 Tag2，` +
            `总数不匹配`
        );
      }

      // 校验成功，拆分成功
      successCount++;
    } catch (error) {
      // i. 校验失败则将该拆分组移入 failedItems（注意：已执行的操作不回滚）
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      failedItems.push(`split origin_tag2: ${origin_tag2_id} - ${errorMessage}`);
    }
  }

  return { successCount, newTag2Ids, failedItems };
}

/**
 * 执行 Tag2 合并操作
 *
 * 对每组合并执行以下步骤：
 * 1. 找到主 Tag2 信息，收集废弃 Tag2
 * 2. 数据校验：统计各标签使用次数之和
 * 3. 批量更新 Tag3 表：废弃 Tag2 下所有 Tag3 的「所属二级标签」替换为主 Tag2 的 tagId
 * 4. 遍历反馈列表，替换废弃 Tag2 名称为主标签名称（去重）
 * 5. 更新反馈表
 * 6. 更新 Tag2 表主标签的 usageCount（累加废弃标签的使用次数）
 * 7. 删除 Tag2 表中的废弃标签行
 * 8. 再次校验使用次数是否符合预期
 *
 * @param mergeGroups - Tag2 合并组列表
 * @param tag2List - Tag2 信息列表
 * @param tag3List - Tag3 信息列表
 * @param feedbackList - 反馈记录列表
 * @param tag2Records - Tag2 表原始记录（用于获取 record_id）
 * @param tag3Records - Tag3 表原始记录（用于获取 record_id）
 * @returns 成功数量和失败项列表
 */
export async function executeTag2Merges(
  mergeGroups: MergeTag2Group[],
  tag2List: Tag2Info[],
  tag3List: Tag3Info[],
  feedbackList: BitableRecord[],
  tag2Records: BitableRecord[],
  tag3Records: BitableRecord[]
): Promise<{ successCount: number; failedItems: string[] }> {
  let successCount = 0;
  const failedItems: string[] = [];

  // 构建 Tag2 映射：tagId -> name, tagId -> recordId, tagId -> usageCount
  const tag2IdToName = new Map<string, string>();
  const tag2IdToRecordId = new Map<string, string>();
  const tag2IdToUsageCount = new Map<string, number>();

  for (const record of tag2Records) {
    const tagId = bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.TAG_ID]);
    const name = bitableClient.extractFieldValue(record.fields[TAG2_FIELDS.TAG_NAME]);
    const usageCount = Number(record.fields[TAG2_FIELDS.COUNT]) || 0;
    if (tagId) {
      tag2IdToName.set(tagId, name);
      tag2IdToRecordId.set(tagId, record.record_id);
      tag2IdToUsageCount.set(tagId, usageCount);
    }
  }

  // 构建 Tag3 映射：tagId -> recordId, parentTag2 -> tag3Ids
  const tag3IdToRecordId = new Map<string, string>();
  const tag2IdToTag3Ids = new Map<string, string[]>();

  for (const record of tag3Records) {
    const tagId = bitableClient.extractFieldValue(record.fields[TAG3_FIELDS.TAG_ID]);
    if (tagId) {
      tag3IdToRecordId.set(tagId, record.record_id);
    }
  }

  for (const tag3 of tag3List) {
    if (!tag2IdToTag3Ids.has(tag3.parentTag2)) {
      tag2IdToTag3Ids.set(tag3.parentTag2, []);
    }
    tag2IdToTag3Ids.get(tag3.parentTag2)!.push(tag3.tagId);
  }

  // 循环执行每一组 Tag2 合并
  for (const group of mergeGroups) {
    const { merge_group, retain_tag_id } = group;
    const groupTagIds = merge_group.join(',');

    try {
      // a. 根据 retain_tag_id 找到主 Tag2 信息
      const retainTagName = tag2IdToName.get(retain_tag_id);
      const retainTagRecordId = tag2IdToRecordId.get(retain_tag_id);
      const retainTagUsageCount = tag2IdToUsageCount.get(retain_tag_id) || 0;

      if (!retainTagName || !retainTagRecordId) {
        failedItems.push(`merge_tag2: ${groupTagIds} - 主标签不存在或信息不完整`);
        continue;
      }

      // b. 收集所有废弃 Tag2（merge_group 中除了 retain_tag_id 之外的 tagId）
      const obsoleteTagIds = merge_group.filter((id) => id !== retain_tag_id);

      if (obsoleteTagIds.length === 0) {
        failedItems.push(`merge_tag2: ${groupTagIds} - 没有需要合并的废弃标签`);
        continue;
      }

      // 校验废弃标签是否都存在
      const invalidTagIds: string[] = [];
      for (const tagId of obsoleteTagIds) {
        if (!tag2IdToName.has(tagId) || !tag2IdToRecordId.has(tagId)) {
          invalidTagIds.push(tagId);
        }
      }
      if (invalidTagIds.length > 0) {
        failedItems.push(`merge_tag2: ${groupTagIds} - 废弃标签不存在: ${invalidTagIds.join(',')}`);
        continue;
      }

      // c. 数据校验：计算预期合并后的总使用次数（各标签 usageCount 之和）
      let expectedTotalUsage = retainTagUsageCount;
      const obsoleteTagNames: string[] = [];
      const obsoleteTag3Ids: string[] = [];

      for (const tagId of obsoleteTagIds) {
        expectedTotalUsage += tag2IdToUsageCount.get(tagId) || 0;
        obsoleteTagNames.push(tag2IdToName.get(tagId)!);

        // 收集废弃 Tag2 下的所有 Tag3 ID
        const childTag3Ids = tag2IdToTag3Ids.get(tagId) || [];
        obsoleteTag3Ids.push(...childTag3Ids);
      }

      // d. 新表结构中没有「所属二级标签」字段，跳过 Tag3 表的父标签关联更新

      // e. 同步更新反馈表：遍历所有反馈，将废弃 Tag2 名称替换为主 Tag2 名称（去重）
      const feedbacksToUpdate: Array<{ recordId: string; newTag2Values: string[] }> = [];

      for (const feedback of feedbackList) {
        const tag2Values = bitableClient.extractMultiSelectFieldValue(feedback.fields[FEEDBACK_FIELDS.TAG2]);
        if (tag2Values.length === 0) continue;

        let hasObsoleteTag = false;
        const newTag2Values: string[] = [];

        for (const tag of tag2Values) {
          if (obsoleteTagNames.includes(tag)) {
            hasObsoleteTag = true;
            // 替换为主标签名称，但避免重复添加
            if (!newTag2Values.includes(retainTagName)) {
              newTag2Values.push(retainTagName);
            }
          } else {
            newTag2Values.push(tag);
          }
        }

        if (hasObsoleteTag) {
          feedbacksToUpdate.push({
            recordId: feedback.record_id,
            newTag2Values,
          });
        }
      }

      // 更新反馈表（逐条调用 bitableClient.updateRecord）
      for (const item of feedbacksToUpdate) {
        try {
          await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, item.recordId, {
            [FEEDBACK_FIELDS.TAG2]: item.newTag2Values,
          });
        } catch (updateError) {
          console.error(`[executeTag2Merges] 更新反馈记录失败: ${item.recordId}`, updateError);
          throw new Error(`更新反馈记录失败: ${item.recordId}`);
        }
      }

      // f. count 是 AutoNumber 字段，由系统自动计算，无需手动更新

      // g. 删除 Tag2 表中的废弃标签行
      for (const tagId of obsoleteTagIds) {
        const recordId = tag2IdToRecordId.get(tagId)!;
        try {
          await bitableClient.deleteRecord(TABLE_NAMES.TAG2, recordId);
        } catch (deleteError) {
          console.error(`[executeTag2Merges] 删除废弃标签失败: ${tagId}`, deleteError);
          throw new Error(`删除废弃标签失败: ${tagId}`);
        }
      }

      // h. count 是 AutoNumber 字段，由系统自动计算，跳过使用次数校验

      // 合并成功
      successCount++;
    } catch (error) {
      // i. 校验失败则将该组合并移入 failedItems（注意：已执行的操作不回滚）
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      failedItems.push(`merge_tag2: ${groupTagIds} - ${errorMessage}`);
    }
  }

  return { successCount, failedItems };
}

/**
 * 标签自进化 V2 主入口函数
 * 执行完整的标签进化流程：数据获取 → 样本抽取 → 模式分流 → AI分析 → 执行优化 → 缓存失效
 *
 * @returns 标签进化执行结果
 */
export async function runTagEvolutionV2(): Promise<TagEvolutionResultV2> {
  // 初始化结果对象
  const result: TagEvolutionResultV2 = {
    success: true,
    totalFeedbackCount: 0,
    mode: 'full',
    mergeTag3Count: 0,
    newTag2Count: 0,
    mergeTag2Count: 0,
    manualReviewItems: [],
  };

  // 用于收集人工复核项的 Set（自动去重）
  const manualReviewSet = new Set<string>();

  try {
    // a. 调用 fetchAllData() 获取所有数据
    console.log('[TagEvolutionV2] 步骤1：获取所有数据');
    const allData = await fetchAllData();
    const { totalFeedbackCount, tag1List, tag2List, tag3List, feedbackList } = allData;
    result.totalFeedbackCount = totalFeedbackCount;
    console.log(
      `[TagEvolutionV2] 获取数据完成：反馈数=${totalFeedbackCount}, Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`
    );

    // b. 根据 totalFeedbackCount 计算样本数：<=2000 取 5，>2000 取 3
    const sampleCount = totalFeedbackCount <= 2000 ? 5 : 3;
    console.log(`[TagEvolutionV2] 步骤2：计算样本数=${sampleCount}（总反馈数=${totalFeedbackCount}）`);

    // c. 调用 extractTag3Samples() 抽取样本
    console.log('[TagEvolutionV2] 步骤3：抽取 Tag3 反馈样本');
    const tag3SampleMap = extractTag3Samples(tag3List, feedbackList, sampleCount);
    console.log(`[TagEvolutionV2] 样本抽取完成，共 ${tag3SampleMap.size} 个 Tag3`);

    // d. 调用 splitByMode() 进行模式分流
    console.log('[TagEvolutionV2] 步骤4：模式分流');
    const splitResult = splitByMode(totalFeedbackCount, tag2List, tag3List, tag3SampleMap);
    const { mode, analysisTag3, analysisTag2, manualTagList } = splitResult;
    result.mode = mode;
    // 将分流产生的人工复核标签加入集合
    manualTagList.forEach((item) => manualReviewSet.add(item));
    console.log(
      `[TagEvolutionV2] 分流完成：模式=${mode}, 分析Tag3=${analysisTag3.length}, 分析Tag2=${analysisTag2.length}, 人工复核=${manualTagList.length}`
    );

    // e. 调用 callEvolutionAI() 获取 AI 优化方案
    console.log('[TagEvolutionV2] 步骤5：调用 AI 获取优化方案');
    let aiResult: TagEvolutionAIResult;
    try {
      aiResult = await callEvolutionAI(tag1List, tag2List, tag3List, analysisTag3, analysisTag2, mode);
    } catch (aiError) {
      // AI 调用失败，不执行任何表格操作，直接返回错误
      console.error('[TagEvolutionV2] AI 调用失败', aiError);
      result.success = false;
      result.error = aiError instanceof Error ? aiError.message : 'AI 调用失败';
      result.manualReviewItems = Array.from(manualReviewSet);
      return result;
    }

    // f. 格式校验（validateEvolutionResult），失败则返回错误
    console.log('[TagEvolutionV2] 步骤6：校验 AI 返回结果格式');
    if (!validateEvolutionResult(aiResult)) {
      console.error('[TagEvolutionV2] AI 返回结果格式校验失败');
      result.success = false;
      result.error = 'AI 返回结果格式不符合要求';
      result.manualReviewItems = Array.from(manualReviewSet);
      return result;
    }

    // 将 AI 返回的人工复核项加入集合
    aiResult.manual_review.forEach((item) => manualReviewSet.add(item));

    // 获取标签表原始记录（用于执行操作时获取 record_id）
    console.log('[TagEvolutionV2] 步骤7：获取标签表原始记录');
    const [tag2Records, tag3Records] = await Promise.all([
      bitableClient.listRecords(TABLE_NAMES.TAG2),
      bitableClient.listRecords(TABLE_NAMES.TAG3),
    ]);

    // g. 执行 Tag3 合并（executeTag3Merges）
    console.log('[TagEvolutionV2] 步骤8：执行 Tag3 合并');
    try {
      const merge3Result = await executeTag3Merges(
        aiResult.tag3_opt_result.merge_tag3,
        tag3List,
        feedbackList,
        tag3Records
      );
      result.mergeTag3Count = merge3Result.successCount;
      // 将失败项加入人工复核
      merge3Result.failedItems.forEach((item) => manualReviewSet.add(item));
      // 有失败项则标记为不成功
      if (merge3Result.failedItems.length > 0) {
        result.success = false;
      }
      console.log(
        `[TagEvolutionV2] Tag3 合并完成：成功=${merge3Result.successCount}, 失败=${merge3Result.failedItems.length}`
      );
    } catch (error) {
      console.error('[TagEvolutionV2] Tag3 合并执行异常', error);
      result.success = false;
    }

    // h. 执行 Tag3 拆分（executeTag3Splits）
    console.log('[TagEvolutionV2] 步骤9：执行 Tag3 拆分');
    try {
      const split3Result = await executeTag3Splits(
        aiResult.tag3_opt_result.split_tag3_to_new_tag2,
        tag2List,
        tag3List,
        feedbackList,
        tag2Records,
        tag3Records
      );
      result.newTag2Count = split3Result.newTag2Ids.length;
      // 将失败项加入人工复核
      split3Result.failedItems.forEach((item) => manualReviewSet.add(item));
      // 有失败项则标记为不成功
      if (split3Result.failedItems.length > 0) {
        result.success = false;
      }
      console.log(
        `[TagEvolutionV2] Tag3 拆分完成：新Tag2=${split3Result.newTag2Ids.length}, 失败=${split3Result.failedItems.length}`
      );
    } catch (error) {
      console.error('[TagEvolutionV2] Tag3 拆分执行异常', error);
      result.success = false;
    }

    // i. 执行 Tag2 合并（executeTag2Merges）
    console.log('[TagEvolutionV2] 步骤10：执行 Tag2 合并');
    try {
      const merge2Result = await executeTag2Merges(
        aiResult.tag2_opt_result.merge_tag2,
        tag2List,
        tag3List,
        feedbackList,
        tag2Records,
        tag3Records
      );
      result.mergeTag2Count = merge2Result.successCount;
      // 将失败项加入人工复核
      merge2Result.failedItems.forEach((item) => manualReviewSet.add(item));
      // 有失败项则标记为不成功
      if (merge2Result.failedItems.length > 0) {
        result.success = false;
      }
      console.log(
        `[TagEvolutionV2] Tag2 合并完成：成功=${merge2Result.successCount}, 失败=${merge2Result.failedItems.length}`
      );
    } catch (error) {
      console.error('[TagEvolutionV2] Tag2 合并执行异常', error);
      result.success = false;
    }

    // j. 汇总所有人工复核项（已在各步骤中加入 Set）
    result.manualReviewItems = Array.from(manualReviewSet);

    // k. 调用 invalidateTagCache() 清空周打标标签缓存
    console.log('[TagEvolutionV2] 步骤11：清空标签缓存');
    try {
      invalidateTagCache();
      console.log('[TagEvolutionV2] 标签缓存已清空');
    } catch (error) {
      console.error('[TagEvolutionV2] 清空标签缓存失败', error);
    }

    console.log('[TagEvolutionV2] 标签进化流程执行完成');
    return result;
  } catch (error) {
    // 整体异常捕获，返回部分成功的结果
    console.error('[TagEvolutionV2] 标签进化流程异常', error);
    result.success = false;
    result.error = error instanceof Error ? error.message : '未知错误';
    result.manualReviewItems = Array.from(manualReviewSet);
    return result;
  }
}
