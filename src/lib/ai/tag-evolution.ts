/**
 * 标签自进化核心类
 * 用于检测重复、可拆分、冷门标签，并执行拆分/合并操作
 */

import { StorageAdapter, TABLES } from '../storage/base-storage';
import { getDefaultStorage } from '../adapter-factory';
import { calculateSimilarity } from '../utils/similarity';
import { BitableRecord } from '@/lib/types';
import { TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS, FEEDBACK_FIELDS } from '../feishu/constants';

/**
 * 标签记录
 */
interface TagRecord {
  record_id: string;
  table: 'tag1' | 'tag2' | 'tag3';
  fields: {
    name: string;
    level: 'Tag1' | 'Tag2' | 'Tag3';
    definition?: string;
    status?: string;
    createdBy?: string;
    usageCount?: number;
    largeTenantCount?: number;
    largeTenantRatio?: number;
  };
}

/**
 * 重复标签报告
 */
export interface TagDuplicate {
  tags: [TagRecord, TagRecord];
  similarity: number;
  suggestion: '合并';
  affectedFeedbackCount: number;
}

/**
 * 可拆分标签报告
 */
export interface TagSplittable {
  tag: TagRecord;
  tag3Count: number;
  distribution: Array<{ name: string; count: number; percentage: number }>;
  suggestion: string;
  affectedFeedbackCount: number;
}

/**
 * 冷门标签报告
 */
export interface TagCold {
  tag: TagRecord;
  usageCount: number;
  lastUsedMonths: number;
}

/**
 * 自进化报告
 */
export interface EvolutionReport {
  timestamp: number;
  duplicates: TagDuplicate[];
  splittables: TagSplittable[];
  coldTags: TagCold[];
  hotTags: TagRecord[];
  actions: Array<{
    type: 'merge' | 'split';
    result: any;
  }>;
}

/**
 * 标签自进化类
 */
export class TagEvolution {
  private storage: StorageAdapter;
  private similarityThreshold: number;
  private splitThreshold: number;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || getDefaultStorage();
    this.similarityThreshold = 0.9;
    this.splitThreshold = 10;
  }

  /**
   * 执行标签自进化分析
   */
  async execute(): Promise<EvolutionReport> {
    console.log('[自进化] 开始标签自进化分析');

    const report: EvolutionReport = {
      timestamp: Date.now(),
      duplicates: [],
      splittables: [],
      coldTags: [],
      hotTags: [],
      actions: [],
    };

    try {
      const [tag1Records, tag2Records, tag3Records] = await Promise.all([
        this.storage.listRecords(TABLES.TAG1),
        this.storage.listRecords(TABLES.TAG2),
        this.storage.listRecords(TABLES.TAG3),
      ]);

      const tag1List = tag1Records.map(r => this.toTagRecord(r, 'tag1', 'Tag1'));
      const tag2List = tag2Records.map(r => this.toTagRecord(r, 'tag2', 'Tag2'));
      const tag3List = tag3Records.map(r => this.toTagRecord(r, 'tag3', 'Tag3'));

      console.log(`[自进化] Tag1: ${tag1List.length} 个, Tag2: ${tag2List.length} 个, Tag3: ${tag3List.length} 个`);

      report.duplicates = await this.detectDuplicates(tag2List, tag3List);
      console.log(`[自进化] 检测到 ${report.duplicates.length} 组重复标签`);

      report.splittables = await this.detectSplittables(tag2List, tag3List);
      console.log(`[自进化] 检测到 ${report.splittables.length} 个可拆分标签`);

      // 自动执行拆分
      for (const splittable of report.splittables) {
        const newTagNames = splittable.distribution
          .filter(d => d.percentage > 60)
          .slice(0, 3)
          .map(d => d.name);
        if (newTagNames.length > 0) {
          await this.executeSplit(splittable.tag, newTagNames);
          report.actions.push({ type: 'split', result: { tag: splittable.tag.fields.name, newTags: newTagNames } });
        }
      }

      report.coldTags = this.detectColdTags(tag1List, tag2List, tag3List);
      console.log(`[自进化] 检测到 ${report.coldTags.length} 个冷门标签（保留不处理）`);

      report.hotTags = this.detectHotTags(tag1List, tag2List, tag3List);
      console.log(`[自进化] 检测到 ${report.hotTags.length} 个热门标签`);

      return report;
    } catch (error) {
      console.error('[自进化] 执行失败:', error);
      throw error;
    }
  }

  /**
   * 检测重复标签
   */
  private async detectDuplicates(tag2List: TagRecord[], tag3List: TagRecord[]): Promise<TagDuplicate[]> {
    const duplicates: TagDuplicate[] = [];

    const detectInList = async (list: TagRecord[]): Promise<TagDuplicate[]> => {
      const result: TagDuplicate[] = [];

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const similarity = calculateSimilarity(list[i].fields.name, list[j].fields.name);

          if (similarity > this.similarityThreshold) {
            const affectedCount = await this.getAffectedFeedbackCount(
              [list[i].fields.name, list[j].fields.name],
              list[i].fields.level
            );

            result.push({
              tags: [list[i], list[j]],
              similarity,
              suggestion: '合并',
              affectedFeedbackCount: affectedCount,
            });
          }
        }
      }
      return result;
    };

    duplicates.push(...await detectInList(tag2List));
    duplicates.push(...await detectInList(tag3List));

    return duplicates;
  }

  /**
   * 检测可拆分标签
   */
  private async detectSplittables(tag2List: TagRecord[], tag3List: TagRecord[]): Promise<TagSplittable[]> {
    const splittables: TagSplittable[] = [];

    const activeTag2 = tag2List;
    const activeTag3 = tag3List;

    for (const tag2 of activeTag2) {
      const tag3UnderTag2 = activeTag3.filter(t =>
        t.fields.definition?.includes(tag2.fields.name)
      );

      if (tag3UnderTag2.length > this.splitThreshold) {
        const distribution = this.analyzeTag3Distribution(tag3UnderTag2);

        const dominantTag3 = distribution.filter(d => d.percentage > 60);

        if (dominantTag3.length > 0) {
          const affectedCount = await this.getAffectedFeedbackCount([tag2.fields.name], 'Tag2');

          splittables.push({
            tag: tag2,
            tag3Count: tag3UnderTag2.length,
            distribution,
            suggestion: `建议拆分：${tag2.fields.name} → ${dominantTag3.map(d => d.name).join(', ')}`,
            affectedFeedbackCount: affectedCount,
          });
        }
      }
    }

    return splittables;
  }

  /**
   * 检测冷门标签
   */
  private detectColdTags(tag1List: TagRecord[], tag2List: TagRecord[], tag3List: TagRecord[]): TagCold[] {
    const coldTags: TagCold[] = [];

    const detectInList = (list: TagRecord[]): TagCold[] => {
      return list
        .filter(t => (t.fields.usageCount || 0) < 5)
        .map(t => ({
          tag: t,
          usageCount: t.fields.usageCount || 0,
          lastUsedMonths: 6,
        }));
    };

    coldTags.push(...detectInList(tag1List));
    coldTags.push(...detectInList(tag2List));
    coldTags.push(...detectInList(tag3List));

    return coldTags;
  }

  /**
   * 检测热门标签
   */
  private detectHotTags(tag1List: TagRecord[], tag2List: TagRecord[], tag3List: TagRecord[]): TagRecord[] {
    const hotTags: TagRecord[] = [];

    const detectInList = (list: TagRecord[]): TagRecord[] => {
      return list
        .filter(t => (t.fields.usageCount || 0) > 20);
    };

    hotTags.push(...detectInList(tag1List));
    hotTags.push(...detectInList(tag2List));
    hotTags.push(...detectInList(tag3List));

    return hotTags;
  }

  /**
   * 分析 Tag3 分布
   */
  private analyzeTag3Distribution(tag3List: TagRecord[]): Array<{ name: string; count: number; percentage: number }> {
    const total = tag3List.reduce((sum, t) => sum + (t.fields.usageCount || 0), 0);

    return tag3List
      .map(t => ({
        name: t.fields.name,
        count: t.fields.usageCount || 0,
        percentage: total > 0 ? ((t.fields.usageCount || 0) / total) * 100 : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * 获取受影响的反馈数量
   */
  private async getAffectedFeedbackCount(tagNames: string[], level: 'Tag1' | 'Tag2' | 'Tag3'): Promise<number> {
    try {
      const feedbacks = await this.storage.listRecords(TABLES.FEEDBACK, {
        pageSize: 500,
      });

      let count = 0;
      for (const feedback of feedbacks) {
        const tagField = level === 'Tag1' ? FEEDBACK_FIELDS.TAG1 :
                         level === 'Tag2' ? FEEDBACK_FIELDS.TAG2 :
                         FEEDBACK_FIELDS.TAG3;
        const tagValue = String(feedback.fields[tagField] || '');

        if (tagNames.some(name => tagValue.includes(name))) {
          count++;
        }
      }

      return count;
    } catch (error) {
      console.error('[自进化] 获取受影响反馈数量失败:', error);
      return 0;
    }
  }

  /**
   * 执行标签合并
   * PRD v2: 反馈列表的标签字段是关联引用类型，合并后需更新 record_id
   */
  async executeMerge(tag1: TagRecord, tag2: TagRecord, mergedName: string): Promise<void> {
    console.log(`[自进化] 执行合并：${tag1.fields.name} + ${tag2.fields.name} → ${mergedName}`);

    const table = tag1.table;
    const fields = table === 'tag1' ? TAG1_FIELDS : table === 'tag2' ? TAG2_FIELDS : TAG3_FIELDS;

    // 1. 创建合并后的新标签
    const mergedTag = await this.storage.createRecord(table, {
      [fields.TAG_ID]: `${Date.now()}`,
      [fields.TAG_NAME]: mergedName,
    });

    const mergedRecordId = mergedTag.record_id;

    // 2. 查找所有引用旧标签的反馈记录
    const feedbacks = await this.storage.listRecords(TABLES.FEEDBACK, { pageSize: 500 });
    const level = tag1.fields.level;
    const fbField = level === 'Tag1' ? FEEDBACK_FIELDS.TAG1 :
                    level === 'Tag2' ? FEEDBACK_FIELDS.TAG2 :
                    FEEDBACK_FIELDS.TAG3;

    // 3. 更新反馈记录的关联引用（将旧标签的 record_id 替换为新标签的 record_id）
    const affectedFeedbacks = feedbacks.filter(f => {
      const tagValue = f.fields[fbField];
      // 关联引用字段是数组类型，包含 record_id
      if (Array.isArray(tagValue)) {
        return tagValue.includes(tag1.record_id) || tagValue.includes(tag2.record_id);
      }
      return false;
    });

    for (const feedback of affectedFeedbacks) {
      const oldTagIds = feedback.fields[fbField] as string[] || [];
      // 移除旧标签的 record_id，添加新标签的 record_id
      const newTagIds = oldTagIds
        .filter(id => id !== tag1.record_id && id !== tag2.record_id)
        .concat([mergedRecordId]);

      await this.storage.updateRecord(TABLES.FEEDBACK, feedback.record_id, {
        [fbField]: newTagIds,
      });
    }

    // 4. 删除旧标签
    await this.storage.deleteRecord(table, tag1.record_id);
    await this.storage.deleteRecord(table, tag2.record_id);

    console.log(`[自进化] 合并完成，已更新 ${affectedFeedbacks.length} 条反馈的关联引用`);
  }

  /**
   * 执行标签拆分
   */
  async executeSplit(originalTag: TagRecord, newTagNames: string[]): Promise<void> {
    console.log(`[自进化] 执行拆分：${originalTag.fields.name} → ${newTagNames.join(', ')}`);

    const table = originalTag.table;
    const fields = table === 'tag1' ? TAG1_FIELDS : table === 'tag2' ? TAG2_FIELDS : TAG3_FIELDS;

    const newTagRecords = await this.storage.batchCreateRecords(table,
      newTagNames.map(name => ({
        fields: {
          [fields.TAG_ID]: `${Date.now()}-${name}`,
          [fields.TAG_NAME]: name,
        },
      }))
    );

    const feedbacks = await this.storage.listRecords(TABLES.FEEDBACK, { pageSize: 500 });
    const level = originalTag.fields.level;
    const fbField = level === 'Tag1' ? FEEDBACK_FIELDS.TAG1 :
                    level === 'Tag2' ? FEEDBACK_FIELDS.TAG2 :
                    FEEDBACK_FIELDS.TAG3;

    const affectedFeedbacks = feedbacks.filter(f => {
      const tagValue = String(f.fields[fbField] || '');
      return tagValue === originalTag.fields.name;
    });

    console.log(`[自进化] 拆分完成，已创建 ${newTagRecords.length} 个新标签`);
  }

  /**
   * 转换为 TagRecord
   */
  private toTagRecord(record: BitableRecord, table: 'tag1' | 'tag2' | 'tag3', level: 'Tag1' | 'Tag2' | 'Tag3'): TagRecord {
    const fields = table === 'tag1' ? TAG1_FIELDS : table === 'tag2' ? TAG2_FIELDS : TAG3_FIELDS;

    const baseFields: Record<string, unknown> = {
      name: String(record.fields[fields.TAG_NAME] || ''),
      level,
      usageCount: Number(record.fields[fields.COUNT] || 0),
      largeTenantCount: 0,
      largeTenantRatio: 0,
    };

    if (table === 'tag1') {
      baseFields.definition = String(record.fields[(fields as typeof TAG1_FIELDS).DESC] || '');
      baseFields.status = 'active';
      baseFields.createdBy = 'AI';
    }

    return {
      record_id: record.record_id,
      table,
      fields: baseFields as TagRecord['fields'],
    };
  }
}