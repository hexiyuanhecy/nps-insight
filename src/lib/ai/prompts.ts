/**
 * AI Prompt 模板管理（PRD v6.0）
 * 定义所有AI打标场景的Prompt模板
 */

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
    `#${fb.id} [来源:${fb.source}] [评分:${fb.score}分] | ${fb.content}`
  ).join('\n');

  return `你是NPS用户反馈分析专家。请批量分析以下${feedbacks.length}条用户反馈，为每条提取三级标签。

【核心概念：三级标签的职责与边界】

■ Tag3（具体问题·现象级描述）
  - 回答："用户实际遇到了什么？看到了什么？想做什么但做不成？"
  - 必须从用户原话中提取具体细节，像 Bug 标题一样精确。
  - ✅ 好的示例：
    "定位加载超时"、"审批按钮点击无反应"、"打卡后状态不更新"、"导出报表乱码"
  - ❌ 不好的示例：
    "性能问题"（这是 Tag1，太抽象）、"定位问题"（这是 Tag2，不是具体问题）、"体验不好"（无具体信息）

■ Tag2（功能模块·功能域归类）
  - 回答："这个问题出在哪个功能模块？"
  - 将 Tag3 映射到具体业务功能域，粒度比 Tag3 粗， 有可能是“极速打卡”，但‘极速打卡’下面还可能有“定位问题”，“蓝牙问题”等，所以颗粒度不要太粗。
  - ✅ 好的示例：
    "定位问题"、"休假表单"、"抄送问题"、"统计报表导出"、"消息通知问题"
  - 注意：如果反馈跨模块（如"审批之后打卡记录没更新"），可同时选多个 Tag2。

■ Tag1（问题性质·处理路径）
  - 回答："这是什么性质的问题？应该走什么处理流程？"
  - 必须且只能从下方【已有标签】Tag1 列表中选择，不可自创。

■ needLogCheck（是否需要查日志排查）
  只有同时满足以下 3 个条件，才设为 true：
  1. 明确描述了技术异常现象：卡顿/白屏/闪退/崩溃/加载超时/接口报错/数据丢失
  2. 不是用户配置问题（如"没开启某功能"、"权限不足"）或纯主观感受
  3. 仅从文字无法确定根本原因，需要日志辅助定位
  ✅ 正例（设为 true）：
    "点击打卡按钮后页面直接白屏"、"提交请假时APP闪退"、"打开统计页面一直转圈加载不出来"
  ❌ 反例（设为 false）：
    "不知道怎么导出报表"（用户教育问题）、"审批太慢了"（可能是流程设计或感受，非明确技术故障）、"希望打卡能快一点"（主观期望）

■ confidence（置信度：0.00-1.00）
  - 反映 Tag1/Tag2/Tag3 整体的匹配确定程度。
  - 以下情况应降低至 0.8 以下：
    1. 除了能够一眼看出反馈内容模糊、缺少上下文外，用户描述了问题但是没办法很好的打标
    2. 一条反馈同时涉及超过 2 个不相关的问题
    3. Tag1、Tag2、Tag3 均存在两种以上合理可能

■ translatedContent（翻译）
  - 若反馈原文不是中文，翻译为中文填入；若已是中文，保持为空字符串 ""。

【已有标签】
Tag1: ${tag1List.join(', ')}
Tag2: ${tag2List.join(', ')}
Tag3: ${tag3List.join(', ')}

【待分析反馈】
${feedbackList}

【输出格式】严格输出以下 JSON 对象，每项对应一条反馈，顺序不能乱，不要添加任何额外文字：
{
  "results": [
    {
      "id": "xxxx",
      "tag1": ["性能提升"],
      "tag2": ["打卡模块"],
      "tag3": ["定位加载超时"],
      "confidence": 0.85,
      "needLogCheck": true,
      "translatedContent": ""
    }
  ]
}`;
}
