/**
 * Top问题生成器
 * 基于 Tag1+Tag2+Tag3 组合生成 Top 问题表
 */

import { StorageAdapter, TABLES } from '../storage/base-storage';
import { getDefaultStorage } from '../adapter-factory';
import { BitableRecord } from '@/lib/types';
import { TOP_ISSUES_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS, FEEDBACK_FIELDS } from '../feishu/constants';
import { DEFAULT_PAGE_SIZE } from '@/constants/app-constants';

/**
 * Top问题记录
 * 一个Top问题 = 一个 tag2 条目
 */
export interface TopIssue {
  index: string;
  tag2: string;
  /** 所属模块（Tag1 名称） */
  module: string;
  /** 该 Tag2 下最高频的 Tag3 名称 */
  tag3: string;
  /** 总反馈数 */
  totalCount: number;
  /** 大租户占比（0-1） */
  largeTenantRatio: number;
  /** 平均 NPS 评分 */
  avgScore: number;
  /** A4 租户反馈数 */
  a4Count: number;
  /** A5 租户反馈数 */
  a5Count: number;
  /** A6 租户反馈数 */
  a6Count: number;
  /** 大租户反馈数（A4+A5+A6） */
  largeTenantCount: number;
  /** 人工排序 */
  manualPriority: number;
  /** 负责人 */
  owner: string;
  /** 解决方案 */
  resolution: string;
  /** 状态 */
  status: string;
  /** 迭代周期 */
  iterationPeriod: string;
}

/**
 * 排序权重配置
 */
export interface SortWeights {
  count: number;
  largeTenant: number;
  quality: number;
}

/**
 * 标签映射类型
 */
interface TagMappings {
  tag1Map: Map<string, string>;
  tag2Map: Map<string, string>;
  tag3Map: Map<string, string>;
}

/**
 * Top问题分组统计
 */
interface IssueGroup {
  tag2: string;
  /** Tag3 出现次数统计，用于找最高频 Tag3 */
  tag3Counts: Map<string, number>;
  /** Tag1 出现次数统计，用于确定所属模块 */
  tag1Counts: Map<string, number>;
  totalCount: number;
  a4Count: number;
  a5Count: number;
  a6Count: number;
  largeTenantCount: number;
  totalScore: number;
}

/**
 * Top问题生成器类
 */
export class TopIssuesGenerator {
  private storage: StorageAdapter;
  private weights: SortWeights;
  private tagMappings: TagMappings;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || getDefaultStorage();
    this.weights = { count: 0.5, largeTenant: 0.3, quality: 0.2 };
    this.tagMappings = {
      tag1Map: new Map(),
      tag2Map: new Map(),
      tag3Map: new Map(),
    };
  }

  /**
   * 设置排序权重
   */
  setWeights(weights: SortWeights): void {
    this.weights = weights;
  }

  /**
   * 生成 Top 问题表
   */
  async generate(): Promise<TopIssue[]> {
    console.log('[Top问题] 开始生成 Top 问题表');

    try {
      await this.loadTagMappings();
      console.log(`[Top问题] 加载标签映射完成: Tag1=${this.tagMappings.tag1Map.size}, Tag2=${this.tagMappings.tag2Map.size}, Tag3=${this.tagMappings.tag3Map.size}`);

      const allFeedbacks = await this.storage.listRecords(TABLES.FEEDBACK, {
        pageSize: DEFAULT_PAGE_SIZE,
      });

      console.log(`[Top问题] 共 ${allFeedbacks.length} 条反馈`);

      const groups = this.aggregateFeedbackData(allFeedbacks);
      console.log(`[Top问题] 共 ${groups.size} 个问题组合`);

      const issues = this.calculateScores(groups);

      const top30 = issues.slice(0, 30);

      console.log(`[Top问题] 生成 Top 30 问题`);

      return top30;
    } catch (error) {
      console.error('[Top问题] 生成失败:', error);
      throw error;
    }
  }

  /**
   * 写入 Top 问题表
   * PRD-FLOW-015: 已存在问题只更新"本期新增数"，绝不覆盖人工字段（负责人/解决方案/迭代周期）
   * 新问题新增一行，写入所有字段
   */
  async writeToTable(issues: TopIssue[]): Promise<void> {
    console.log('[Top问题] 写入 Top 问题表');

    const existingIssues = await this.storage.listRecords(TABLES.TOP_ISSUES, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    // 按所属模块+tag2 建立已有记录映射（兼容单选字段返回数组或文本）
    const existingMap = new Map<string, BitableRecord>();
    for (const issue of existingIssues) {
      const tag2Val = issue.fields[TOP_ISSUES_FIELDS.TAG2];
      let key = '';
      if (Array.isArray(tag2Val) && tag2Val.length > 0) {
        key = String(tag2Val[0]);
      } else {
        key = String(tag2Val || '');
      }
      if (key) {
        existingMap.set(key, issue);
      }
    }

    // 过滤掉"其他"分类
    const validIssues = issues.filter((issue) => issue.tag2 !== '其他');
    if (validIssues.length < issues.length) {
      console.log(`[Top问题] 过滤掉 ${issues.length - validIssues.length} 条"其他"分类问题`);
    }

    const recordsToCreate: Array<{ fields: Record<string, unknown> }> = [];
    const recordsToUpdate: Array<{ record_id: string; fields: Record<string, unknown> }> = [];

    for (const issue of validIssues) {
      const existing = existingMap.get(issue.tag2);

      if (existing) {
        // 更新：只更新排名和统计字段，绝不覆盖人工字段
        recordsToUpdate.push({
          record_id: existing.record_id,
          fields: {
            [TOP_ISSUES_FIELDS.INDEX]: issue.index,
            [TOP_ISSUES_FIELDS.TOTAL_COUNT]: issue.totalCount,
            [TOP_ISSUES_FIELDS.A4_COUNT]: issue.a4Count,
            [TOP_ISSUES_FIELDS.A5_COUNT]: issue.a5Count,
            [TOP_ISSUES_FIELDS.A6_COUNT]: issue.a6Count,
            [TOP_ISSUES_FIELDS.LARGE_TENANT_COUNT]: issue.largeTenantCount,
          },
        });
      } else {
        // 新建：写入所有字段
        recordsToCreate.push({
          fields: {
            [TOP_ISSUES_FIELDS.INDEX]: issue.index,
            [TOP_ISSUES_FIELDS.MODULE]: issue.module,
            [TOP_ISSUES_FIELDS.TAG2]: [issue.tag2],
            [TOP_ISSUES_FIELDS.TAG3]: issue.tag3 || '',
            [TOP_ISSUES_FIELDS.TOTAL_COUNT]: issue.totalCount,
            [TOP_ISSUES_FIELDS.A4_COUNT]: issue.a4Count,
            [TOP_ISSUES_FIELDS.A5_COUNT]: issue.a5Count,
            [TOP_ISSUES_FIELDS.A6_COUNT]: issue.a6Count,
            [TOP_ISSUES_FIELDS.LARGE_TENANT_COUNT]: issue.largeTenantCount,
            [TOP_ISSUES_FIELDS.MANUAL_PRIORITY]: issue.manualPriority,
            [TOP_ISSUES_FIELDS.OWNER]: issue.owner,
            [TOP_ISSUES_FIELDS.RESOLUTION]: issue.resolution,
            [TOP_ISSUES_FIELDS.STATUS]: issue.status,
            [TOP_ISSUES_FIELDS.ITERATION_PERIOD]: issue.iterationPeriod,
          },
        });
      }
    }

    if (recordsToCreate.length > 0) {
      await this.storage.batchCreateRecords(TABLES.TOP_ISSUES, recordsToCreate);
      console.log(`[Top问题] 新增 ${recordsToCreate.length} 条问题`);
    }

    if (recordsToUpdate.length > 0) {
      await this.storage.batchUpdateRecords(TABLES.TOP_ISSUES, recordsToUpdate);
      console.log(`[Top问题] 更新 ${recordsToUpdate.length} 条问题（仅排名和统计数据）`);
    }
  }

  /**
   * 加载标签映射
   * 从 Tag1/Tag2/Tag3 表读取所有标签，建立 recordId -> name 的映射
   */
  private async loadTagMappings(): Promise<void> {
    const tag1Records = await this.storage.listRecords(TABLES.TAG1, { pageSize: DEFAULT_PAGE_SIZE });
    this.tagMappings.tag1Map = new Map();
    for (const record of tag1Records) {
      const recordId = record.record_id;
      const name = String(record.fields[TAG1_FIELDS.TAG_NAME] || '');
      if (recordId && name) {
        this.tagMappings.tag1Map.set(recordId, name);
      }
    }

    const tag2Records = await this.storage.listRecords(TABLES.TAG2, { pageSize: DEFAULT_PAGE_SIZE });
    this.tagMappings.tag2Map = new Map();
    for (const record of tag2Records) {
      const recordId = record.record_id;
      const name = String(record.fields[TAG2_FIELDS.TAG_NAME] || '');
      if (recordId && name) {
        this.tagMappings.tag2Map.set(recordId, name);
      }
    }

    const tag3Records = await this.storage.listRecords(TABLES.TAG3, { pageSize: DEFAULT_PAGE_SIZE });
    this.tagMappings.tag3Map = new Map();
    for (const record of tag3Records) {
      const recordId = record.record_id;
      const name = String(record.fields[TAG3_FIELDS.TAG_NAME] || '');
      if (recordId && name) {
        this.tagMappings.tag3Map.set(recordId, name);
      }
    }
  }

  /**
   * 从反馈记录中获取标签名称
   * 支持两种格式：
   * 1. 直接存储标签名称（字符串/字符串数组）
   * 2. 存储关联 recordId（需要通过映射表查找名称）
   */
  private getTagNameFromRecordId(recordIds: unknown, tagType: 'tag1' | 'tag2' | 'tag3'): string {
    const recordIdMap = tagType === 'tag1' ? this.tagMappings.tag1Map
      : tagType === 'tag2' ? this.tagMappings.tag2Map
      : this.tagMappings.tag3Map;
    
    // 建立 名称 -> 名称 的映射（用于快速判断是否是已知标签）
    const nameSet = new Set(recordIdMap.values());

    if (Array.isArray(recordIds)) {
      if (recordIds.length === 0) return '其他';
      const firstVal = String(recordIds[0]);
      // 如果是已知名称，直接返回
      if (nameSet.has(firstVal)) return firstVal;
      // 如果是 recordId，查找名称
      const name = recordIdMap.get(firstVal);
      return name || firstVal || '其他';
    }

    const val = String(recordIds || '');
    if (!val) return '其他';
    
    // 如果是已知名称，直接返回
    if (nameSet.has(val)) return val;
    // 如果是 recordId，查找名称
    const name = recordIdMap.get(val);
    return name || val;
  }

  /**
   * 判断是否为大租户（A4/A5/A6）
   */
  private isLargeTenant(scale: unknown): boolean {
    const scaleStr = String(scale || '');
    return ['A4', 'A5', 'A6'].includes(scaleStr);
  }

  /**
   * 获取 NPS 评分
   */
  private getNpsScore(fields: Record<string, unknown>): number {
    return Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
  }

  /**
   * 按 Tag2 分组统计反馈数据，同时跟踪每个 Tag2 下的 Tag3 和 Tag1 分布
   */
  private aggregateFeedbackData(feedbacks: BitableRecord[]): Map<string, IssueGroup> {
    const groups = new Map<string, IssueGroup>();

    for (const feedback of feedbacks) {
      const tag2 = this.getTagNameFromRecordId(feedback.fields[FEEDBACK_FIELDS.TAG2], 'tag2');

      let group = groups.get(tag2);
      if (!group) {
        group = {
          tag2,
          tag3Counts: new Map(),
          tag1Counts: new Map(),
          totalCount: 0,
          a4Count: 0,
          a5Count: 0,
          a6Count: 0,
          largeTenantCount: 0,
          totalScore: 0,
        };
        groups.set(tag2, group);
      }

      group.totalCount++;

      // 统计 Tag3 分布（一条反馈可能有多个 Tag3）
      const tag3Val = feedback.fields[FEEDBACK_FIELDS.TAG3];
      if (Array.isArray(tag3Val)) {
        for (const t3 of tag3Val) {
          const tag3Name = this.getTagNameFromRecordId(t3, 'tag3');
          group.tag3Counts.set(tag3Name, (group.tag3Counts.get(tag3Name) || 0) + 1);
        }
      } else if (tag3Val) {
        const tag3Name = this.getTagNameFromRecordId(tag3Val, 'tag3');
        group.tag3Counts.set(tag3Name, (group.tag3Counts.get(tag3Name) || 0) + 1);
      }

      // 统计 Tag1 分布（用于确定所属模块）
      const tag1Val = feedback.fields[FEEDBACK_FIELDS.TAG1];
      if (Array.isArray(tag1Val)) {
        for (const t1 of tag1Val) {
          const tag1Name = this.getTagNameFromRecordId(t1, 'tag1');
          group.tag1Counts.set(tag1Name, (group.tag1Counts.get(tag1Name) || 0) + 1);
        }
      } else if (tag1Val) {
        const tag1Name = this.getTagNameFromRecordId(tag1Val, 'tag1');
        group.tag1Counts.set(tag1Name, (group.tag1Counts.get(tag1Name) || 0) + 1);
      }

      const scale = String(feedback.fields[FEEDBACK_FIELDS.TENANT_SCALE] || '');
      if (scale === 'A4') group.a4Count++;
      else if (scale === 'A5') group.a5Count++;
      else if (scale === 'A6') group.a6Count++;

      if (this.isLargeTenant(feedback.fields[FEEDBACK_FIELDS.TENANT_SCALE])) {
        group.largeTenantCount++;
      }

      group.totalScore += this.getNpsScore(feedback.fields);
    }

    return groups;
  }

  /**
   * 计算综合评分并排序
   * 评分公式：count权重 * 数量归一化 + largeTenant权重 * 大租户占比 + quality权重 * 质量分（低NPS=高质量问题）
   */
  private calculateScores(groups: Map<string, IssueGroup>): TopIssue[] {
    const issues: Array<TopIssue & { score: number }> = [];

    // 找出最大数量用于归一化
    let maxCount = 1;
    for (const group of Array.from(groups.values())) {
      if (group.totalCount > maxCount) maxCount = group.totalCount;
    }

    Array.from(groups.entries()).forEach(([_, group]) => {
      const largeTenantRatio = group.totalCount > 0 ? group.largeTenantCount / group.totalCount : 0;
      const avgScore = group.totalCount > 0 ? group.totalScore / group.totalCount : 0;

      // 数量归一化 (0-1)
      const countScore = group.totalCount / maxCount;
      // 大租户占比 (0-1)
      const largeTenantScore = largeTenantRatio;
      // 质量分：NPS越低问题越严重，质量分越高 (0-1)
      const qualityScore = Math.max(0, Math.min(1, (10 - avgScore) / 10));

      // 综合评分
      const score =
        this.weights.count * countScore +
        this.weights.largeTenant * largeTenantScore +
        this.weights.quality * qualityScore;

      // 从 Tag3 分布中找最高频的 Tag3
      let topTag3 = '';
      let maxTag3Count = 0;
      for (const [tag3Name, count] of Array.from(group.tag3Counts.entries())) {
        if (count > maxTag3Count) {
          maxTag3Count = count;
          topTag3 = tag3Name;
        }
      }

      // 从 Tag1 分布中找最高频的 Tag1 作为所属模块
      let topTag1 = '';
      let maxTag1Count = 0;
      for (const [tag1Name, count] of Array.from(group.tag1Counts.entries())) {
        if (count > maxTag1Count) {
          maxTag1Count = count;
          topTag1 = tag1Name;
        }
      }

      issues.push({
        index: '',
        tag2: group.tag2,
        module: topTag1,
        tag3: topTag3,
        totalCount: group.totalCount,
        largeTenantRatio,
        avgScore,
        a4Count: group.a4Count,
        a5Count: group.a5Count,
        a6Count: group.a6Count,
        largeTenantCount: group.largeTenantCount,
        manualPriority: 0,
        owner: '',
        resolution: '',
        status: '待讨论',
        iterationPeriod: '待定',
        score,
      });
    });

    // 按综合评分降序排序
    issues.sort((a, b) => b.score - a.score);

    // 填充排名 index
    issues.forEach((issue, idx) => {
      issue.index = String(idx + 1);
    });

    return issues;
  }
}