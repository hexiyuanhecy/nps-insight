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
  manualPriority: number;
  owner: string;
  resolution: string;
  status: string;
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
   * 新建时写入所有字段，更新时只更新非统计字段（统计字段由公式/自动计算）
   */
  async writeToTable(issues: TopIssue[]): Promise<void> {
    console.log('[Top问题] 写入 Top 问题表');

    const existingIssues = await this.storage.listRecords(TABLES.TOP_ISSUES, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    const existingMap = new Map<string, BitableRecord>();
    for (const issue of existingIssues) {
      const key = String(issue.fields[TOP_ISSUES_FIELDS.TAG2] || '');
      if (key) {
        existingMap.set(key, issue);
      }
    }

    // 过滤掉"其他"分类（不是具体问题分类，且多选字段可能无此选项）
    const validIssues = issues.filter((issue) => issue.tag2 !== '其他');
    if (validIssues.length < issues.length) {
      console.log(`[Top问题] 过滤掉 ${issues.length - validIssues.length} 条"其他"分类问题`);
    }

    const recordsToCreate: Array<{ fields: Record<string, unknown> }> = [];
    const recordsToUpdate: Array<{ record_id: string; fields: Record<string, unknown> }> = [];

    for (const issue of validIssues) {
      const existing = existingMap.get(issue.tag2);
      const issueAny = issue as any;

      if (existing) {
        // 更新：只更新手动维护的字段，统计字段由公式/自动计算
        recordsToUpdate.push({
          record_id: existing.record_id,
          fields: {
            [TOP_ISSUES_FIELDS.INDEX]: issue.index,
            [TOP_ISSUES_FIELDS.MANUAL_PRIORITY]: issue.manualPriority,
            [TOP_ISSUES_FIELDS.OWNER]: issue.owner,
            [TOP_ISSUES_FIELDS.RESOLUTION]: issue.resolution,
            [TOP_ISSUES_FIELDS.STATUS]: issue.status,
            [TOP_ISSUES_FIELDS.ITERATION_PERIOD]: issue.iterationPeriod,
          },
        });
      } else {
        // 新建：写入所有字段
        const fields: Record<string, unknown> = {
          [TOP_ISSUES_FIELDS.INDEX]: issue.index,
          [TOP_ISSUES_FIELDS.TAG2]: [issue.tag2],
          [TOP_ISSUES_FIELDS.MANUAL_PRIORITY]: issue.manualPriority,
          [TOP_ISSUES_FIELDS.OWNER]: issue.owner,
          [TOP_ISSUES_FIELDS.RESOLUTION]: issue.resolution,
          [TOP_ISSUES_FIELDS.STATUS]: issue.status,
          [TOP_ISSUES_FIELDS.ITERATION_PERIOD]: issue.iterationPeriod,
        };
        
        // 如果有统计数据也一并写入（如果表格支持的话）
        if (issueAny.totalCount !== undefined) {
          fields[TOP_ISSUES_FIELDS.TOTAL_COUNT] = issueAny.totalCount;
        }
        if (issueAny.a4Count !== undefined) {
          fields[TOP_ISSUES_FIELDS.A4_COUNT] = issueAny.a4Count;
        }
        if (issueAny.a5Count !== undefined) {
          fields[TOP_ISSUES_FIELDS.A5_COUNT] = issueAny.a5Count;
        }
        if (issueAny.a6Count !== undefined) {
          fields[TOP_ISSUES_FIELDS.A6_COUNT] = issueAny.a6Count;
        }
        if (issueAny.largeTenantCount !== undefined) {
          fields[TOP_ISSUES_FIELDS.LARGE_TENANT_COUNT] = issueAny.largeTenantCount;
        }

        recordsToCreate.push({ fields });
      }
    }

    if (recordsToCreate.length > 0) {
      await this.storage.batchCreateRecords(TABLES.TOP_ISSUES, recordsToCreate);
      console.log(`[Top问题] 新增 ${recordsToCreate.length} 条问题`);
    }

    if (recordsToUpdate.length > 0) {
      await this.storage.batchUpdateRecords(TABLES.TOP_ISSUES, recordsToUpdate);
      console.log(`[Top问题] 更新 ${recordsToUpdate.length} 条问题`);
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
   * 按 Tag2 分组统计反馈数据
   */
  private aggregateFeedbackData(feedbacks: BitableRecord[]): Map<string, IssueGroup> {
    const groups = new Map<string, IssueGroup>();

    for (const feedback of feedbacks) {
      const tag2 = this.getTagNameFromRecordId(feedback.fields[FEEDBACK_FIELDS.TAG2], 'tag2');

      let group = groups.get(tag2);
      if (!group) {
        group = {
          tag2,
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
    const issues: Array<TopIssue & { totalCount: number; largeTenantRatio: number; avgScore: number; score: number }> = [];

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

      issues.push({
        index: '',
        tag2: group.tag2,
        manualPriority: 0,
        owner: '',
        resolution: '',
        status: '待讨论',
        iterationPeriod: '待定',
        totalCount: group.totalCount,
        largeTenantRatio,
        avgScore,
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