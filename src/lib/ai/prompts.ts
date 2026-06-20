/**
 * AI Prompt 模板管理
 * 定义所有AI分析、打标、摘要等场景的Prompt模板
 */

import { Tag, Priority } from '@/lib/types';

// ============================================
// 系统角色定义
// ============================================

/** NPS分析专家角色定义 */
export const NPS_ANALYST_ROLE = `你是一位专业的NPS（净推荐值）分析专家，擅长分析用户反馈、识别问题模式、提取关键洞察。
你的任务包括：
1. 分析用户反馈的情感倾向和核心诉求
2. 对反馈进行精准分类和打标
3. 生成简洁明了的摘要
4. 提供可执行的建议

请始终保持客观、专业，用中文输出。`;

// ============================================
// 单条反馈分析 Prompt
// ============================================

/**
 * 生成单条反馈分析的Prompt
 * @param content 反馈内容
 * @param npsScore NPS评分
 * @param module 所属模块
 * @param existingTags 已有标签列表
 * @returns Prompt消息列表
 */
export function generateFeedbackAnalysisPrompt(
  content: string,
  npsScore: number,
  module: string,
  existingTags?: Tag[]
): Array<{ role: 'system' | 'user'; content: string }> {
  const tagContext = existingTags
    ? `\n\n已有标签体系（请尽量使用已有标签，如没有合适的再创建新标签）：\n${existingTags
        .map((t) => `- ${t.tag1Name} > ${t.tag2Name} > ${t.tag3Name}`)
        .join('\n')}`
    : '';

  return [
    {
      role: 'system',
      content: `${NPS_ANALYST_ROLE}\n\n请以JSON格式输出分析结果，格式如下：\n{\n  "tag1": "一级分类（如：产品功能、用户体验、性能问题等）",\n  "tag2": "二级分类（更具体的维度）",\n  "tag3": "三级分类（最细粒度的分类）",\n  "summary": "一句话摘要，不超过50字",\n  "suggestions": "给产品团队的具体建议，不超过100字",\n  "priority": "优先级（urgent/high/medium/low）",\n  "confidence": 0.95\n}`,
    },
    {
      role: 'user',
      content: `请分析以下NPS反馈：\n\n所属模块：${module}\nNPS评分：${npsScore}/10\n反馈内容：${content}${tagContext}`,
    },
  ];
}

// ============================================
// 批量反馈分析 Prompt
// ============================================

/**
 * 生成批量反馈分析的Prompt
 * @param feedbacks 反馈列表
 * @param existingTags 已有标签列表
 * @returns Prompt消息列表
 */
export function generateBatchAnalysisPrompt(
  feedbacks: Array<{ feedbackId: string; content: string; npsScore: number; module: string }>,
  existingTags?: Tag[]
): Array<{ role: 'system' | 'user'; content: string }> {
  const tagContext = existingTags
    ? `\n\n已有标签体系（请尽量使用已有标签）：\n${existingTags
        .map((t) => `- ${t.tag1Name} > ${t.tag2Name} > ${t.tag3Name}`)
        .join('\n')}`
    : '';

  const feedbacksText = feedbacks
    .map(
      (f, i) =>
        `[${i + 1}] ID: ${f.feedbackId}\n模块: ${f.module}\n评分: ${f.npsScore}\n内容: ${f.content}`
    )
    .join('\n\n');

  return [
    {
      role: 'system',
      content: `${NPS_ANALYST_ROLE}\n\n请批量分析以下NPS反馈，以JSON数组格式输出，每个元素包含feedbackId和分析结果：\n[\n  {\n    "feedbackId": "原始ID",\n    "tag1": "一级分类",\n    "tag2": "二级分类",\n    "tag3": "三级分类",\n    "summary": "摘要",\n    "suggestions": "建议",\n    "priority": "urgent/high/medium/low",\n    "confidence": 0.95\n  }\n]`,
    },
    {
      role: 'user',
      content: `请分析以下 ${feedbacks.length} 条反馈：\n\n${feedbacksText}${tagContext}`,
    },
  ];
}

// ============================================
// 周期分析 Prompt
// ============================================

/**
 * 生成周期分析报告的Prompt
 * @param periodName 周期名称
 * @param feedbacks 该周期内的反馈列表
 * @returns Prompt消息列表
 */
export function generatePeriodAnalysisPrompt(
  periodName: string,
  feedbacks: Array<{ content: string; npsScore: number; module: string; tag1?: string }>
): Array<{ role: 'system' | 'user'; content: string }> {
  const stats = {
    total: feedbacks.length,
    promoter: feedbacks.filter((f) => f.npsScore >= 9).length,
    passive: feedbacks.filter((f) => f.npsScore >= 7 && f.npsScore <= 8).length,
    detractor: feedbacks.filter((f) => f.npsScore <= 6).length,
  };
  const npsScore = Math.round(
    ((stats.promoter - stats.detractor) / stats.total) * 100
  );

  const feedbacksText = feedbacks
    .slice(0, 50) // 限制数量避免超出token限制
    .map((f, i) => `[${i + 1}] 评分:${f.npsScore} 模块:${f.module} 标签:${f.tag1 || '未分类'} 内容:${f.content}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `${NPS_ANALYST_ROLE}\n\n请基于提供的反馈数据生成周期分析报告，以JSON格式输出：\n{\n  "npsScore": ${npsScore},\n  "topIssues": ["问题1", "问题2", "问题3"],\n  "insights": "核心洞察，不超过200字",\n  "recommendations": "改进建议，不超过200字"\n}`,
    },
    {
      role: 'user',
      content: `请生成 ${periodName} 的NPS分析报告。\n\n基础数据：\n- 总反馈数：${stats.total}\n- 推荐者(9-10分)：${stats.promoter}\n- 被动者(7-8分)：${stats.passive}\n- 贬损者(0-6分)：${stats.detractor}\n- NPS得分：${npsScore}\n\n反馈明细（前50条）：\n${feedbacksText}`,
    },
  ];
}

// ============================================
// 标签推荐 Prompt
// ============================================

/**
 * 生成标签推荐Prompt
 * @param content 反馈内容
 * @param existingTags 已有标签
 * @returns Prompt消息列表
 */
export function generateTagRecommendationPrompt(
  content: string,
  existingTags: Tag[]
): Array<{ role: 'system' | 'user'; content: string }> {
  const tagsText = existingTags
    .map((t) => `- ${t.tag1Name} > ${t.tag2Name} > ${t.tag3Name}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: `你是一位专业的反馈分类专家。请根据反馈内容，从已有标签中选择最合适的标签，或建议新的标签分类。\n\n以JSON格式输出：\n{\n  "recommendedTag1": "推荐的一级标签",\n  "recommendedTag2": "推荐的二级标签",\n  "recommendedTag3": "推荐的三级标签",\n  "isNewTag": false,\n  "reason": "推荐理由"\n}`,
    },
    {
      role: 'user',
      content: `反馈内容：${content}\n\n已有标签体系：\n${tagsText}`,
    },
  ];
}

// ============================================
// 情感分析 Prompt
// ============================================

/**
 * 生成情感分析Prompt
 * @param content 反馈内容
 * @returns Prompt消息列表
 */
export function generateSentimentPrompt(
  content: string
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: `请分析以下用户反馈的情感倾向，以JSON格式输出：\n{\n  "sentiment": "positive/negative/neutral",\n  "score": 0.8,\n  "keywords": ["关键词1", "关键词2"],\n  "emotions": ["情绪1", "情绪2"]\n}`,
    },
    {
      role: 'user',
      content: `反馈内容：${content}`,
    },
  ];
}

// ============================================
// Prompt工具函数
// ============================================

/**
 * 估算token数量（粗略估算：1个中文字符约1.5个token）
 * @param text 文本内容
 * @returns 估算的token数量
 */
export function estimateTokens(text: string): number {
  // 中文字符按1.5token计算，英文按1token计算
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.5);
}

/**
 * 截断文本以适应token限制
 * @param text 原始文本
 * @param maxTokens 最大token数
 * @returns 截断后的文本
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }

  // 粗略截断（保留中文字符）
  const ratio = maxTokens / estimateTokens(text);
  const targetLength = Math.floor(text.length * ratio);
  return text.substring(0, targetLength) + '...';
}
