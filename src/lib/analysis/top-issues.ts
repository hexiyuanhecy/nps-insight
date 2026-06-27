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

    const recordsToCreate: Array<{ fields: Record<string, unknown> }> = [];
    const recordsToUpdate: Array<{ record_id: string; fields: Record<string, unknown> }> = [];

    for (const issue of issues) {
      const existing = existingMap.get(issue.tag2);

      if (existing) {
        recordsToUpdate.push({
          record_id: existing.record_id,
          fields: {
            [TOP_ISSUES_FIELDS.MANUAL_PRIORITY]: issue.manualPriority,
            [TOP_ISSUES_FIELDS.OWNER]: issue.owner,
            [TOP_ISSUES_FIELDS.RESOLUTION]: issue.resolution,
            [TOP_ISSUES_FIELDS.STATUS]: issue.status,
            [TOP_ISSUES_FIELDS.ITERATION_PERIOD]: issue.iterationPeriod,
          },
        });
      } else {
        recordsToCreate.push({
          fields: {
            [TOP_ISSUES_FIELDS.INDEX]: issue.index,
            [TOP_ISSUES_FIELDS.TAG2]: issue.tag2,
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
   * 通过关联字段的 recordId 查找对应的标签名称
   */
  private getTagNameFromRecordId(recordIds: unknown, tagType: 'tag1' | 'tag2' | 'tag3'): string {
    const map = tagType === 'tag1' ? this.tagMappings.tag1Map
      : tagType === 'tag2' ? this.tagMappings.tag2Map
      : this.tagMappings.tag3Map;

    if (Array.isArray(recordIds)) {
      if (recordIds.length === 0) return '其他';
      const firstId = String(recordIds[0]);
      return map.get(firstId) || '其他';
    }

    const recordId = String(recordIds || '');
    if (!recordId) return '其他';

    return map.get(recordId) || '其他';
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
   * 计算综合评分
   */
  private calculateScores(groups: Map<string, IssueGroup>): TopIssue[] {
    const issues: TopIssue[] = [];

    Array.from(groups.entries()).forEach(([_, group]) => {
      issues.push({
        index: '',
        tag2: group.tag2,
        manualPriority: 0,
        owner: '',
        resolution: '',
        status: '待讨论',
        iterationPeriod: '待定',
      });
    });

    return issues;
  }
}