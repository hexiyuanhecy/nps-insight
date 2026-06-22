/**
 * AI Prompt 模板管理（PRD v6.0）
 * 定义所有AI打标场景的Prompt模板
 */

// ============================================
// 单条反馈打标 Prompt
// ============================================

/**
 * 生成单条反馈打标的Prompt
 */
export function generateTaggingPrompt(
  content: string,
  unsatisfactoryReason: string,
  source: string,
  tag1List: string[],
  tag2List: string[],
  tag3List: string[],
  confidenceThreshold: number
): string {
  return `你是NPS反馈分析专家。请分析以下用户反馈，按规则输出JSON。

【规则】
1. Tag1 必须从以下列表中选择（可多选）：[${tag1List.join(', ')}]
2. Tag2 是功能模块名（可多选）。优先从已有标签选择，若无匹配可创建新标签。
3. Tag3 是具体问题描述（可多选）。从用户原话中提炼，保留用户语言。
4. confidence 为确定性评分(0.00-1.00)。使用全新Tag2/Tag3时大概率会降低至0.8以下，但具体以 ai 实际分析结果为主。
5. needLogCheck 为true当且仅当：反馈描述卡顿/白屏/闪退/加载失败等技术现象，且无法仅从文本判断根因。

【已有标签】
Tag1: ${tag1List.join(', ')}
Tag2: ${tag2List.join(', ')}
Tag3: ${tag3List.join(', ')}

【输入】
反馈内容：${content}${unsatisfactoryReason ? `\n不满意原因：${unsatisfactoryReason}` : ''}${source ? `\n模块来源：${source}` : ''}

【输出格式】严格JSON，不添加任何额外文字：
{
  "tag1": ["性能提升"],
  "tag2": ["打卡模块"],
  "tag3": ["定位失败", "加载超时"],
  "confidence": 0.85,
  "needLogCheck": true,
  "translatedContent": ""
}`;
}

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
 * 生成批量反馈打标的Prompt
 * 一次请求分析多条反馈，返回带 id 索引的结果
 */
export function generateBatchTaggingPrompt(
  feedbacks: BatchFeedbackInput[],
  tag1List: string[],
  tag2List: string[],
  tag3List: string[],
  confidenceThreshold: number
): string {
  const feedbackList = feedbacks.map((fb, i) =>
    `#${i + 1} [${fb.source}] 评分:${fb.score} 分 | 不满意原因:${fb.unsatisfactoryReason || '无'} | ${fb.content}`
  ).join('\n');

  return `你是NPS反馈分析专家。请批量分析以下${feedbacks.length}条用户反馈，为每条提取三级标签。

【规则】
1. Tag1 必须从以下列表中选择（可多选）：[${tag1List.join(', ')}]
2. Tag2 是功能模块名（可多选）。优先从已有标签选择，若无匹配可创建新标签。
3. Tag3 是具体问题描述（可多选）。从用户原话中提炼，保留用户语言。
4. confidence 为确定性评分(0.00-1.00)。
5. needLogCheck 为true当且仅当：反馈描述卡顿/白屏/闪退/加载失败等技术现象。

【已有标签】
Tag1: ${tag1List.join(', ')}
Tag2: ${tag2List.join(', ')}
Tag3: ${tag3List.join(', ')}

【待分析反馈】
${feedbackList}

【输出格式】严格JSON数组，每项对应一条反馈，顺序不能乱：
[
  {
    "tag1": ["性能提升"],
    "tag2": ["打卡模块"],
    "tag3": ["定位失败"],
    "confidence": 0.85,
    "needLogCheck": false,
    "translatedContent": ""
  }
]`;
}
