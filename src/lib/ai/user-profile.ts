/**
 * 用户画像系统
 * 为每个用户建立"反馈特征签名"，用于更精准的打标和个性化建议
 * 
 * 画像包含：
 * - 基础信息：租户规模、数据源、使用时长
 * - 反馈特征：反馈总量、评分分布、Tag1/Tag2/Tag3 分布
 * - 标签模型特征：标签总数、自定义标签比例
 * - 行为特征：手动触发次数、审核参与度
 * - 洞察结果：主导问题类型、改进机会、风险信号
 */

import { getValue, setValue, getConfig } from '@/lib/storage/kv-storage';

const ADJUSTMENT_KEY = 'user_profile_adjustment';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE } from '@/constants/app-constants';
import { UserProfileJsonSchema } from './json-schemas';
import { chatCompletionJsonSchema } from './index';

export interface UserProfile {
  ownerId: string;
  version: number;
  createdAt: number;
  lastUpdatedAt: number;
  basic: {
    tenantScale: string;
    dataSource?: string;
    usageDays?: number;
    syncFrequency?: string;
  };
  feedbackSignature: {
    totalFeedbacks: number;
    weeklyAverage?: number;
    scoreDistribution?: Record<string, number>;
    tag1Distribution: Array<{ tag: string; count: number; percentage: number }>;
    topTag2?: Array<{ tag: string; count: number }>;
    topTag3?: Array<{ tag: string; count: number }>;
  };
  tagModelSignature: {
    totalTag1: number;
    totalTag2: number;
    totalTag3: number;
    customTagRatio?: number;
    evolutionHistory?: number[];
  };
  behaviorSignature?: {
    manualTriggerCount?: number;
    reviewRate?: number;
    reportDownloadCount?: number;
    averageResponseTimeHours?: number;
  };
  insights?: {
    dominantIssueType?: string;
    improvementOpportunities?: string[];
    riskSignals?: string[];
  };
}

const PROFILE_CACHE_TTL_SECONDS = 3600;

function getProfileKey(ownerId: string): string {
  return `user_profile:${ownerId}`;
}

function getAdjustmentKey(ownerId: string): string {
  return `${ADJUSTMENT_KEY}:${ownerId}`;
}

export interface UserProfileAdjustment {
  dominantIssueType?: string;
  focusTags?: string[];
  userNotes?: string;
  updatedAt?: number;
}

async function getUserAdjustment(ownerId: string): Promise<UserProfileAdjustment | null> {
  const raw = await getValue(getAdjustmentKey(ownerId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfileAdjustment;
  } catch {
    return null;
  }
}

async function getStoredProfile(ownerId: string): Promise<UserProfile | null> {
  const data = await getValue(getProfileKey(ownerId));
  if (!data) return null;
  
  try {
    return JSON.parse(data) as UserProfile;
  } catch {
    return null;
  }
}

async function saveProfile(profile: UserProfile): Promise<void> {
  await setValue(getProfileKey(profile.ownerId), JSON.stringify(profile));
}

async function getTenantScale(ownerId: string): Promise<string> {
  try {
    const config = await getConfig(ownerId) as Record<string, unknown>;
    const bitableConfig = config?.bitable as Record<string, unknown> | undefined;
    if (bitableConfig?.mode === 'link' && bitableConfig?.appToken) {
      const tenants = await bitableClient.listRecords(TABLE_NAMES.TENANTS, { pageSize: DEFAULT_PAGE_SIZE });
      if (tenants.length > 0) {
        const scales = tenants.map(t => String(t.fields[FEEDBACK_FIELDS.TENANT_SCALE] || '')).filter(Boolean);
        const scaleCounts: Record<string, number> = {};
        for (const s of scales) {
          scaleCounts[s] = (scaleCounts[s] || 0) + 1;
        }
        let maxScale = 'A1';
        let maxCount = 0;
        for (const [scale, count] of Object.entries(scaleCounts)) {
          if (count > maxCount) {
            maxCount = count;
            maxScale = scale;
          }
        }
        return maxScale;
      }
    }
  } catch {
    // ignore
  }
  return 'A3';
}

async function getFeedbackStatistics(): Promise<{
  totalFeedbacks: number;
  scoreDistribution: Record<string, number>;
  tag1Distribution: Record<string, number>;
  tag2Distribution: Record<string, number>;
  tag3Distribution: Record<string, number>;
}> {
  const feedbacks = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });
  
  const scoreDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const tag1Distribution: Record<string, number> = {};
  const tag2Distribution: Record<string, number> = {};
  const tag3Distribution: Record<string, number> = {};
  
  for (const record of feedbacks) {
    const score = String(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || '3');
    if (scoreDistribution[score] !== undefined) {
      scoreDistribution[score]++;
    }
    
    const tag1 = record.fields[FEEDBACK_FIELDS.TAG1] as string[] || [];
    for (const t of tag1) {
      tag1Distribution[t] = (tag1Distribution[t] || 0) + 1;
    }
    
    const tag2 = record.fields[FEEDBACK_FIELDS.TAG2] as string[] || [];
    for (const t of tag2) {
      tag2Distribution[t] = (tag2Distribution[t] || 0) + 1;
    }
    
    const tag3 = record.fields[FEEDBACK_FIELDS.TAG3] as string[] || [];
    for (const t of tag3) {
      tag3Distribution[t] = (tag3Distribution[t] || 0) + 1;
    }
  }
  
  return {
    totalFeedbacks: feedbacks.length,
    scoreDistribution,
    tag1Distribution,
    tag2Distribution,
    tag3Distribution,
  };
}

async function getTagStatistics(): Promise<{ totalTag1: number; totalTag2: number; totalTag3: number }> {
  const tag1Records = await bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: DEFAULT_PAGE_SIZE });
  const tag2Records = await bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: DEFAULT_PAGE_SIZE });
  const tag3Records = await bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: DEFAULT_PAGE_SIZE });
  
  return {
    totalTag1: tag1Records.length,
    totalTag2: tag2Records.length,
    totalTag3: tag3Records.length,
  };
}

async function generateAIInsights(profile: Omit<UserProfile, 'insights'>): Promise<UserProfile['insights']> {
  const systemPrompt = `你是一名专业的 NPS 数据分析助手。根据以下用户画像数据，生成深度洞察：

用户画像数据：
${JSON.stringify(profile, null, 2)}

请分析：
1. 该用户产品的主要问题类型是什么？（dominantIssueType）
2. 有哪些改进机会？（improvementOpportunities）
3. 有哪些风险信号需要关注？（riskSignals）

请以 JSON 格式输出，只包含上述三个字段。`;

  try {
    const result = await chatCompletionJsonSchema<{
      dominantIssueType?: string;
      improvementOpportunities?: string[];
      riskSignals?: string[];
    }>(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: '请生成用户洞察' }],
      {
        type: 'object',
        properties: {
          dominantIssueType: { type: 'string' },
          improvementOpportunities: { type: 'array', items: { type: 'string' } },
          riskSignals: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
      { temperature: 0.3, maxTokens: 1024, taskType: 'generateInsights' }
    );
    
    return result;
  } catch (error) {
    console.warn('[UserProfile] AI 洞察生成失败:', error);
    return {};
  }
}

export async function generateUserProfile(ownerId: string): Promise<UserProfile> {
  const existing = await getStoredProfile(ownerId);
  
  const tenantScale = await getTenantScale(ownerId);
  const feedbackStats = await getFeedbackStatistics();
  const tagStats = await getTagStatistics();
  
  const tag1Sorted = Object.entries(feedbackStats.tag1Distribution)
    .sort((a, b) => b[1] - a[1]);
  const tag1Total = tag1Sorted.reduce((sum, [, count]) => sum + count, 0);
  
  const tag2Sorted = Object.entries(feedbackStats.tag2Distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const tag3Sorted = Object.entries(feedbackStats.tag3Distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  
  const profile: UserProfile = {
    ownerId,
    version: existing?.version ? existing.version + 1 : 1,
    createdAt: existing?.createdAt || Date.now(),
    lastUpdatedAt: Date.now(),
    basic: {
      tenantScale,
      usageDays: existing?.basic?.usageDays || 0,
    },
    feedbackSignature: {
      totalFeedbacks: feedbackStats.totalFeedbacks,
      weeklyAverage: feedbackStats.totalFeedbacks > 0 ? feedbackStats.totalFeedbacks / 7 : 0,
      scoreDistribution: feedbackStats.scoreDistribution,
      tag1Distribution: tag1Sorted.map(([tag, count]) => ({
        tag,
        count,
        percentage: tag1Total > 0 ? (count / tag1Total) * 100 : 0,
      })),
      topTag2: tag2Sorted.map(([tag, count]) => ({ tag, count })),
      topTag3: tag3Sorted.map(([tag, count]) => ({ tag, count })),
    },
    tagModelSignature: {
      totalTag1: tagStats.totalTag1,
      totalTag2: tagStats.totalTag2,
      totalTag3: tagStats.totalTag3,
    },
    behaviorSignature: existing?.behaviorSignature,
    insights: existing?.insights,
  };
  
  if (feedbackStats.totalFeedbacks > 10) {
    profile.insights = await generateAIInsights(profile);
  }
  
  await saveProfile(profile);
  console.log(`[UserProfile] 用户画像已更新: ${ownerId}`);
  
  return profile;
}

export async function getUserProfile(ownerId: string): Promise<UserProfile | null> {
  const profile = await getStoredProfile(ownerId);
  if (!profile) {
    return null;
  }
  
  const ageSeconds = Date.now() / 1000 - profile.lastUpdatedAt / 1000;
  if (ageSeconds > PROFILE_CACHE_TTL_SECONDS) {
    await generateUserProfile(ownerId);
    return getStoredProfile(ownerId);
  }
  
  return profile;
}

export function buildProfilePrompt(profile: UserProfile, adjustment?: UserProfileAdjustment | null): string {
  if (!profile.feedbackSignature.tag1Distribution.length) {
    return '';
  }
  
  const dominantTag1 = profile.feedbackSignature.tag1Distribution[0];
  const topTag2 = profile.feedbackSignature.topTag2?.slice(0, 5).map(t => t.tag).join('、') || '';
  const topTag3 = profile.feedbackSignature.topTag3?.slice(0, 5).map(t => t.tag).join('、') || '';
  const dominantIssue = adjustment?.dominantIssueType || profile.insights?.dominantIssueType || '';
  const focusTags = adjustment?.focusTags?.length ? adjustment.focusTags.join('、') : '';
  
  let prompt = `\n\n【用户画像参考】\n`;
  prompt += `- 租户规模：${profile.basic.tenantScale}\n`;
  prompt += `- 累计反馈：${profile.feedbackSignature.totalFeedbacks} 条\n`;
  prompt += `- 主导问题类型：${dominantTag1.tag}（占比 ${dominantTag1.percentage.toFixed(1)}%）\n`;
  
  if (topTag2) {
    prompt += `- 高频功能模块：${topTag2}\n`;
  }
  
  if (topTag3) {
    prompt += `- 高频具体问题：${topTag3}\n`;
  }
  
  if (dominantIssue) {
    prompt += `- 深度洞察：${dominantIssue}\n`;
  }
  
  if (focusTags) {
    prompt += `- 用户重点关注：${focusTags}\n`;
  }
  
  if (adjustment?.userNotes) {
    prompt += `- 用户备注：${adjustment.userNotes}\n`;
  }
  
  prompt += `\n请结合以上用户画像，更精准地进行打标分析。`;
  
  return prompt;
}

export async function injectProfileToPrompt(prompt: string, ownerId: string): Promise<string> {
  try {
    const profile = await getUserProfile(ownerId);
    const adjustment = await getUserAdjustment(ownerId);
    if (profile) {
      return prompt + buildProfilePrompt(profile, adjustment);
    }
  } catch (error) {
    console.warn('[UserProfile] 注入画像到 Prompt 失败:', error);
  }
  return prompt;
}