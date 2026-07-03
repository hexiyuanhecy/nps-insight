/**
 * AI Prompt 模板管理（PRD v6.0）
 * 统一使用 Handlebars 模板引擎管理所有 Prompt
 * 模板文件位于 src/lib/ai/templates/ 目录下
 */

import {
  renderPrompt,
  TEMPLATE_NAMES,
  BatchTaggingContext,
} from './prompt-engine';

// ============================================
// 批量反馈打标 Prompt
// ============================================

interface BatchFeedbackInput {
  id: string;
  content: string;
  score: number;
  source: string;
  unsatisfactoryReason: string;
}

/**
 * 生成批量反馈打标的 Prompt
 * 使用 Handlebars 模板渲染，自动对变量进行 HTML 实体转义
 */
export function generateBatchTaggingPrompt(
  feedbacks: BatchFeedbackInput[],
  tag1List: string[],
  tag2List: string[],
  tag3List: string[],
  confidenceThreshold: number
): string {
  const context: BatchTaggingContext = {
    feedbackCount: feedbacks.length,
    feedbacks: feedbacks.map(fb => ({
      id: fb.id,
      source: fb.source,
      score: fb.score,
      content: fb.content,
    })),
    tag1List,
    tag2List,
    tag3List,
    confidenceThreshold,
  };

  return renderPrompt(TEMPLATE_NAMES.BATCH_TAGGING, context);
}
