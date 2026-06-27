/**
 * 标签自进化 V2
 * 基于 docs/tag-update.md 文档实现
 * ponytail: 单文件扁平结构，需要拆模块时再拆
 */

import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { BitableRecord } from '@/lib/types';
import { chatCompletionJSON } from './index';
import { invalidateTagCache } from './tagger';

// ============================================
// 类型定义（只保留外部需要的，内部结构直接 inline）
// ============================================

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

interface MergeGroup {
  merge_group: string[];
  retain_tag_id: string;
  reason: string;
}

interface SplitItem {
  origin_tag2_id: string;
  new_tag2_list: Array<{ new_tag2_name: string; bind_tag3_ids: string[] }>;
}

interface AIResult {
  tag3_opt_result: { merge_tag3: MergeGroup[]; split_tag3_to_new_tag2: SplitItem[] };
  tag2_opt_result: { merge_tag2: MergeGroup[] };
  manual_review: string[];
}

// ============================================
// 固定 Prompt（一字不改，来自文档）
// ============================================

const EVOLUTION_PROMPT = `# 硬性执行规则（严格遵守，不可颠倒顺序）
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

// ============================================
// 数据读取
// ============================================

async function fetchAllData() {
  const [feedbacks, tag1Records, tag2Records, tag3Records] = await Promise.all([
    bitableClient.listRecords(TABLE_NAMES.FEEDBACK),
    bitableClient.listRecords(TABLE_NAMES.TAG1),
    bitableClient.listRecords(TABLE_NAMES.TAG2),
    bitableClient.listRecords(TABLE_NAMES.TAG3),
  ]);

  // ponytail: 简单映射，量小时 O(n) 扫一遍就行，不用抽函数
  const tag1List = tag1Records.map(r => ({
    tagId: bitableClient.extractFieldValue(r.fields[TAG1_FIELDS.TAG_ID]),
    name: bitableClient.extractFieldValue(r.fields[TAG1_FIELDS.TAG_NAME]),
    definition: bitableClient.extractFieldValue(r.fields[TAG1_FIELDS.DESC]),
  }));

  const tag2List = tag2Records.map(r => ({
    tagId: bitableClient.extractFieldValue(r.fields[TAG2_FIELDS.TAG_ID]),
    name: bitableClient.extractFieldValue(r.fields[TAG2_FIELDS.TAG_NAME]),
    definition: bitableClient.extractFieldValue(r.fields[TAG2_FIELDS.DESC]),
    usageCount: Number(r.fields[TAG2_FIELDS.COUNT]) || 0,
    recordId: r.record_id,
  }));

  // 从反馈表反推 Tag3 -> Tag2 的映射关系（取共现次数最多的 Tag2 作为父标签）
  const tag3ToTag2Count = new Map<string, Map<string, number>>();
  for (const fb of feedbacks) {
    const tag2Names = bitableClient.extractMultiSelectFieldValue(fb.fields[FEEDBACK_FIELDS.TAG2]);
    const tag3Names = bitableClient.extractMultiSelectFieldValue(fb.fields[FEEDBACK_FIELDS.TAG3]);
    for (const t3name of tag3Names) {
      if (!tag3ToTag2Count.has(t3name)) {
        tag3ToTag2Count.set(t3name, new Map());
      }
      const t2Map = tag3ToTag2Count.get(t3name)!;
      for (const t2name of tag2Names) {
        t2Map.set(t2name, (t2Map.get(t2name) || 0) + 1);
      }
    }
  }

  // tag2 名称到 ID 的映射
  const tag2NameToId = new Map(tag2List.map(t => [t.name, t.tagId]));

  const tag3List = tag3Records.map(r => {
    const name = bitableClient.extractFieldValue(r.fields[TAG3_FIELDS.TAG_NAME]);
    // 找共现次数最多的 Tag2 作为父标签
    const t2Map = tag3ToTag2Count.get(name);
    let parentTag2 = '';
    let maxCount = 0;
    if (t2Map) {
      for (const [t2name, count] of Array.from(t2Map.entries())) {
        if (count > maxCount) {
          maxCount = count;
          parentTag2 = tag2NameToId.get(t2name) || '';
        }
      }
    }
    return {
      tagId: bitableClient.extractFieldValue(r.fields[TAG3_FIELDS.TAG_ID]),
      name,
      definition: bitableClient.extractFieldValue(r.fields[TAG3_FIELDS.DESC]),
      parentTag2,
      usageCount: Number(r.fields[TAG3_FIELDS.COUNT]) || 0,
      recordId: r.record_id,
    };
  });

  return { totalFeedbackCount: feedbacks.length, feedbacks, tag1List, tag2List, tag3List, tag2Records, tag3Records };
}

// ============================================
// Tag3 样本抽取
// ============================================

function extractTag3Samples(
  tag3List: Array<{ tagId: string; name: string }>,
  feedbacks: BitableRecord[],
  sampleCount: number
): Map<string, string[]> {
  // 按 Tag3 名称分组收集反馈
  const byName = new Map<string, string[]>();
  for (const fb of feedbacks) {
    const tag3Names = bitableClient.extractMultiSelectFieldValue(fb.fields[FEEDBACK_FIELDS.TAG3]);
    const content = bitableClient.extractFieldValue(fb.fields[FEEDBACK_FIELDS.CONTENT]);
    if (!content) continue;
    for (const name of tag3Names) {
      const arr = byName.get(name);
      if (arr) arr.push(content); else byName.set(name, [content]);
    }
  }

  // 随机抽取
  const result = new Map<string, string[]>();
  for (const tag3 of tag3List) {
    const list = byName.get(tag3.name) || [];
    if (list.length <= sampleCount) {
      result.set(tag3.tagId, [...list]);
    } else {
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      result.set(tag3.tagId, shuffled.slice(0, sampleCount));
    }
  }
  return result;
}

// ============================================
// 模式分流
// ============================================

function splitByMode(
  totalCount: number,
  tag2List: Array<{ tagId: string; name: string; definition: string; usageCount: number }>,
  tag3List: Array<{ tagId: string; name: string; definition: string; parentTag2: string; usageCount: number; samples: string[] }>,
) {
  const manual: string[] = [];
  const mode: 'full' | 'high_freq' = totalCount <= 2000 ? 'full' : 'high_freq';

  let analysisTag3 = tag3List;

  if (mode === 'high_freq') {
    analysisTag3 = tag3List.filter(t => {
      if (t.usageCount < 5) { manual.push(t.tagId); return false; }
      return true;
    });
  }

  // Tag2：下属有高频 Tag3 就参与分析，否则入人工
  const tag2Map = new Map(tag2List.map(t => [t.tagId, { ...t, tag3Ids: [] as string[], totalFeedbacks: 0 }]));
  for (const t3 of analysisTag3) {
    const t2 = tag2Map.get(t3.parentTag2);
    if (t2) { t2.tag3Ids.push(t3.tagId); t2.totalFeedbacks += t3.usageCount; }
  }

  let analysisTag2 = Array.from(tag2Map.values());
  if (mode === 'high_freq') {
    analysisTag2 = analysisTag2.filter(t => {
      if (t.usageCount < 10 && t.tag3Ids.length === 0) { manual.push(t.tagId); return false; }
      return true;
    });
  }

  return { mode, analysisTag3, analysisTag2, manualTagList: manual };
}

// ============================================
// AI 调用
// ============================================

async function callEvolutionAI(
  tag1List: Array<{ tagId: string; name: string; definition: string }>,
  tag2List: Array<{ tagId: string; name: string; definition: string; usageCount: number }>,
  tag3List: Array<{ tagId: string; name: string; definition: string; usageCount: number }>,
  analysisTag3: Array<{ tagId: string; name: string; definition: string; parentTag2: string; usageCount: number; samples: string[] }>,
  analysisTag2: Array<{ tagId: string; name: string; definition: string; usageCount: number; tag3Ids: string[]; totalFeedbacks: number }>,
  mode: 'full' | 'high_freq'
): Promise<AIResult> {
  const payload = {
    global_tag_reference: { tag1: tag1List, tag2: tag2List, tag3: tag3List },
    analysis_data: { tag3_list: analysisTag3, tag2_list: analysisTag2 },
    mode: mode === 'full' ? '全量分析模式' : '高频过滤模式',
  };

  const messages = [{
    role: 'user' as const,
    content: `${EVOLUTION_PROMPT}\n\n# 业务数据\n${JSON.stringify(payload, null, 2)}`,
  }];

  // ponytail: chatCompletionJSON 内部已经做了 JSON.parse + error，格式错了直接抛，不用再手工逐字段校验
  return chatCompletionJSON<AIResult>(messages, { temperature: 0.1, maxTokens: 4096 });
}

// ============================================
// 工具：批量更新反馈表的某个 tag 字段
// ============================================

async function replaceTagInFeedbacks(
  feedbacks: BitableRecord[],
  field: string,
  oldNames: string[],
  newName: string
): Promise<number> {
  let count = 0;
  for (const fb of feedbacks) {
    const values = bitableClient.extractMultiSelectFieldValue(fb.fields[field]);
    if (!values.some(v => oldNames.includes(v))) continue;

    const newValues: string[] = [];
    let changed = false;
    for (const v of values) {
      if (oldNames.includes(v)) {
        if (!newValues.includes(newName)) { newValues.push(newName); changed = true; }
      } else {
        newValues.push(v);
      }
    }
    if (changed) {
      await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, fb.record_id, { [field]: newValues });
      count++;
    }
  }
  return count;
}

// ============================================
// Tag3 合并
// ============================================

async function executeTag3Merges(
  groups: MergeGroup[],
  tag3List: Array<{ tagId: string; name: string; recordId: string }>,
  feedbacks: BitableRecord[]
): Promise<{ successCount: number; failedItems: string[] }> {
  const byId = new Map(tag3List.map(t => [t.tagId, t]));
  let successCount = 0;
  const failedItems: string[] = [];

  for (const group of groups) {
    const { merge_group, retain_tag_id } = group;
    const retain = byId.get(retain_tag_id);
    const obsoleteIds = merge_group.filter(id => id !== retain_tag_id);
    const obsoleteNames: string[] = [];

    try {
      if (!retain) throw new Error('主标签不存在');
      if (obsoleteIds.length === 0) throw new Error('无废弃标签');

      for (const id of obsoleteIds) {
        const t = byId.get(id);
        if (!t) throw new Error(`废弃标签不存在: ${id}`);
        obsoleteNames.push(t.name);
      }

      // 更新反馈表
      await replaceTagInFeedbacks(feedbacks, FEEDBACK_FIELDS.TAG3, obsoleteNames, retain.name);

      // 删除废弃标签
      for (const id of obsoleteIds) {
        await bitableClient.deleteRecord(TABLE_NAMES.TAG3, byId.get(id)!.recordId);
      }

      successCount++;
    } catch (e) {
      failedItems.push(`merge_tag3: ${merge_group.join(',')} - ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }
  return { successCount, failedItems };
}

// ============================================
// Tag3 拆分生成新 Tag2
// ============================================

async function executeTag3Splits(
  items: SplitItem[],
  tag2List: Array<{ tagId: string; name: string; recordId: string }>,
  tag3List: Array<{ tagId: string; name: string; parentTag2: string; recordId: string }>,
  feedbacks: BitableRecord[]
): Promise<{ successCount: number; newTag2Ids: string[]; failedItems: string[] }> {
  const tag2ById = new Map(tag2List.map(t => [t.tagId, t]));
  const tag3ById = new Map(tag3List.map(t => [t.tagId, t]));
  let successCount = 0;
  const newTag2Ids: string[] = [];
  const failedItems: string[] = [];

  for (const item of items) {
    const { origin_tag2_id, new_tag2_list } = item;
    const origin = tag2ById.get(origin_tag2_id);

    try {
      if (!origin) throw new Error('原 Tag2 不存在');
      if (new_tag2_list.length === 0) throw new Error('无新 Tag2');

      // 原 Tag2 下所有 Tag3
      const originTag3s = tag3List.filter(t => t.parentTag2 === origin_tag2_id);
      const originTag3Ids = new Set(originTag3s.map(t => t.tagId));
      const originTag3Names = new Set(originTag3s.map(t => t.name));

      // 校验：所有 bind_tag3_ids 都在原 Tag2 下，且不重复分配
      const allMoved = new Set<string>();
      for (const nt of new_tag2_list) {
        for (const id of nt.bind_tag3_ids) {
          if (!originTag3Ids.has(id)) throw new Error(`Tag3(${id}) 不在原 Tag2 下`);
          if (allMoved.has(id)) throw new Error(`Tag3(${id}) 重复分配`);
          allMoved.add(id);
        }
      }

      // 被移动的 Tag3 名称集合
      const movedNames = new Set<string>();
      allMoved.forEach(id => { const n = tag3ById.get(id)?.name; if (n) movedNames.add(n); });

      // 留在原 Tag2 的 Tag3 名称
      const remainingNames = new Set<string>();
      originTag3Names.forEach(n => { if (!movedNames.has(n)) remainingNames.add(n); });

      // 创建新 Tag2
      const created: Array<{ tagId: string; name: string; bindTag3Ids: string[] }> = [];
      for (const nt of new_tag2_list) {
        // ponytail: 一行生成随机ID，够唯一了
        const tagId = `tag2_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await bitableClient.createRecord(TABLE_NAMES.TAG2, {
          [TAG2_FIELDS.TAG_ID]: tagId,
          [TAG2_FIELDS.TAG_NAME]: nt.new_tag2_name,
          [TAG2_FIELDS.DESC]: '',
        });
        created.push({ tagId, name: nt.new_tag2_name, bindTag3Ids: nt.bind_tag3_ids });
        newTag2Ids.push(tagId);
      }

      // 建立 tag3Name -> newTag2Name 映射
      const tag3ToNewTag2 = new Map<string, string>();
      for (const c of created) {
        for (const id of c.bindTag3Ids) {
          const name = tag3ById.get(id)?.name;
          if (name) tag3ToNewTag2.set(name, c.name);
        }
      }

      // 更新反馈表 tag2 字段
      for (const fb of feedbacks) {
        const tag2Values = bitableClient.extractMultiSelectFieldValue(fb.fields[FEEDBACK_FIELDS.TAG2]);
        const tag3Values = bitableClient.extractMultiSelectFieldValue(fb.fields[FEEDBACK_FIELDS.TAG3]);
        if (tag3Values.length === 0) continue;

        // 该反馈涉及的新 Tag2 名称
        const newTag2Names = new Set<string>();
        for (const t3n of tag3Values) {
          const nt2n = tag3ToNewTag2.get(t3n);
          if (nt2n) newTag2Names.add(nt2n);
        }
        if (newTag2Names.size === 0) continue;

        // 是否还有 Tag3 留在原 Tag2
        const hasRemaining = tag3Values.some(n => remainingNames.has(n));

        let newValues = [...tag2Values];
        if (newValues.includes(origin.name) && !hasRemaining) {
          newValues = newValues.filter(n => n !== origin.name);
        }
        newTag2Names.forEach(n => { if (!newValues.includes(n)) newValues.push(n); });

        if (JSON.stringify(newValues) !== JSON.stringify(tag2Values)) {
          await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, fb.record_id, { [FEEDBACK_FIELDS.TAG2]: newValues });
        }
      }

      successCount++;
    } catch (e) {
      failedItems.push(`split origin_tag2: ${origin_tag2_id} - ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }
  return { successCount, newTag2Ids, failedItems };
}

// ============================================
// Tag2 合并
// ============================================

async function executeTag2Merges(
  groups: MergeGroup[],
  tag2List: Array<{ tagId: string; name: string; recordId: string }>,
  feedbacks: BitableRecord[]
): Promise<{ successCount: number; failedItems: string[] }> {
  const byId = new Map(tag2List.map(t => [t.tagId, t]));
  let successCount = 0;
  const failedItems: string[] = [];

  for (const group of groups) {
    const { merge_group, retain_tag_id } = group;
    const retain = byId.get(retain_tag_id);
    const obsoleteIds = merge_group.filter(id => id !== retain_tag_id);
    const obsoleteNames: string[] = [];

    try {
      if (!retain) throw new Error('主标签不存在');
      if (obsoleteIds.length === 0) throw new Error('无废弃标签');

      for (const id of obsoleteIds) {
        const t = byId.get(id);
        if (!t) throw new Error(`废弃标签不存在: ${id}`);
        obsoleteNames.push(t.name);
      }

      // 更新反馈表
      await replaceTagInFeedbacks(feedbacks, FEEDBACK_FIELDS.TAG2, obsoleteNames, retain.name);

      // 删除废弃标签
      for (const id of obsoleteIds) {
        await bitableClient.deleteRecord(TABLE_NAMES.TAG2, byId.get(id)!.recordId);
      }

      successCount++;
    } catch (e) {
      failedItems.push(`merge_tag2: ${merge_group.join(',')} - ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }
  return { successCount, failedItems };
}

// ============================================
// 主入口
// ============================================

export async function runTagEvolutionV2(): Promise<TagEvolutionResultV2> {
  const result: TagEvolutionResultV2 = {
    success: true,
    totalFeedbackCount: 0,
    mode: 'full',
    mergeTag3Count: 0,
    newTag2Count: 0,
    mergeTag2Count: 0,
    manualReviewItems: [],
  };
  const manualSet = new Set<string>();

  try {
    // 1. 读数据
    const allData = await fetchAllData();
    const { totalFeedbackCount, feedbacks, tag1List, tag2List, tag3List } = allData;
    result.totalFeedbackCount = totalFeedbackCount;

    // 2. 抽样本 + 分流
    const sampleCount = totalFeedbackCount <= 2000 ? 5 : 3;
    const sampleMap = extractTag3Samples(tag3List, feedbacks, sampleCount);
    const tag3WithSamples = tag3List.map(t => ({ ...t, samples: sampleMap.get(t.tagId) || [] }));
    const split = splitByMode(totalFeedbackCount, tag2List, tag3WithSamples);
    result.mode = split.mode;
    split.manualTagList.forEach(m => manualSet.add(m));

    // 3. AI 分析
    let aiResult: AIResult;
    try {
      aiResult = await callEvolutionAI(
        tag1List, tag2List, tag3List,
        split.analysisTag3, split.analysisTag2, split.mode
      );
    } catch (aiErr) {
      result.success = false;
      result.error = aiErr instanceof Error ? aiErr.message : 'AI 调用失败';
      result.manualReviewItems = Array.from(manualSet);
      return result;
    }
    aiResult.manual_review.forEach(m => manualSet.add(m));

    // 4. 执行 Tag3 合并
    const m3 = await executeTag3Merges(aiResult.tag3_opt_result.merge_tag3, tag3List, feedbacks);
    result.mergeTag3Count = m3.successCount;
    m3.failedItems.forEach(m => manualSet.add(m));
    if (m3.failedItems.length > 0) result.success = false;

    // 5. 执行 Tag3 拆分
    const s3 = await executeTag3Splits(aiResult.tag3_opt_result.split_tag3_to_new_tag2, tag2List, tag3List, feedbacks);
    result.newTag2Count = s3.newTag2Ids.length;
    s3.failedItems.forEach(m => manualSet.add(m));
    if (s3.failedItems.length > 0) result.success = false;

    // 6. 执行 Tag2 合并
    const m2 = await executeTag2Merges(aiResult.tag2_opt_result.merge_tag2, tag2List, feedbacks);
    result.mergeTag2Count = m2.successCount;
    m2.failedItems.forEach(m => manualSet.add(m));
    if (m2.failedItems.length > 0) result.success = false;

    // 7. 缓存失效
    try { invalidateTagCache(); } catch (_) { /* 清缓存失败不影响主流程 */ }

    result.manualReviewItems = Array.from(manualSet);
    return result;

  } catch (e) {
    result.success = false;
    result.error = e instanceof Error ? e.message : '未知错误';
    result.manualReviewItems = Array.from(manualSet);
    return result;
  }
}
