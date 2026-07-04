/**
 * 基于工具调用的 AI 打标引擎
 * 使用 AgnesAI 的 Function Calling 能力，让 AI 在打标时：
 * 1. 查询已有的标签库（get_tags）
 * 2. 创建新标签（create_tag）
 * 
 * 优势：
 * - 标签一致性提高：AI 不再凭空生成标签，而是查询已有标签
 * - 避免重复创建相似标签
 * - 支持动态扩展标签库
 */

import { chatCompletionWithTools, chatCompletionJsonSchema } from './index';
import { ToolDefinition } from '@/lib/llm/agnesai-provider';
import { sanitizeUserInput, CONSTITUTIONAL_REFUSAL } from './security';
import { BatchTaggingJsonSchema, BatchTaggingResult, TaggingItem } from './json-schemas';
import { getCachedTags, ensureTagExists, invalidateTagCache } from './tagger';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TAG1_FIELDS, TAG2_FIELDS, TAG3_FIELDS } from '@/lib/feishu/constants';

export interface ToolBasedTagResult {
  tag1: string[];
  tag2: string[];
  tag3: string[];
  confidence: number;
  needLogCheck: boolean;
  reviewNeeded: boolean;
  translatedContent: string;
  newTagsCreated: number;
}

const TAG_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_tags',
      description: '查询已有的标签库，获取 Tag1、Tag2、Tag3 的完整列表。用于打标时匹配已有标签，避免重复创建。',
      parameters: {
        type: 'object',
        properties: {
          tagLevel: {
            type: 'string',
            enum: ['tag1', 'tag2', 'tag3', 'all'],
            description: '要查询的标签层级：tag1（一级标签）、tag2（二级标签）、tag3（三级标签）、all（全部）',
          },
        },
        required: ['tagLevel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_tag',
      description: '创建新标签。当已有的标签库中没有合适的标签时使用。注意：Tag1 只能从预设列表中选择，不能创建新的 Tag1。',
      parameters: {
        type: 'object',
        properties: {
          tagName: {
            type: 'string',
            description: '标签名称，简短清晰，不超过 20 个字',
          },
          tagLevel: {
            type: 'string',
            enum: ['tag2', 'tag3'],
            description: '标签层级：tag2（二级标签，功能模块）、tag3（三级标签，具体问题）',
          },
          parentTag: {
            type: 'string',
            description: '父标签名称（仅 Tag3 需要，指定所属的 Tag2）',
          },
        },
        required: ['tagName', 'tagLevel'],
      },
    },
  },
];

const TAG1_PRESET = ['疑似Bug', '功能优化', '界面改进', '性能提升', '用户教育', '安全合规', '无效反馈'];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_tags': {
      const tagLevel = args.tagLevel as string;
      const tags = await getCachedTags();
      
      if (tagLevel === 'tag1') {
        return JSON.stringify({
          level: 'tag1',
          tags: tags.filter(t => t.tag1Name).map(t => ({ name: t.tag1Name, usageCount: t.usageCount })),
          preset: TAG1_PRESET,
        });
      }
      
      if (tagLevel === 'tag2') {
        return JSON.stringify({
          level: 'tag2',
          tags: tags.filter(t => t.tag2Name).map(t => ({ name: t.tag2Name, usageCount: t.usageCount })),
        });
      }
      
      if (tagLevel === 'tag3') {
        return JSON.stringify({
          level: 'tag3',
          tags: tags.filter(t => t.tag3Name).map(t => ({ name: t.tag3Name, usageCount: t.usageCount })),
        });
      }
      
      return JSON.stringify({
        tag1: tags.filter(t => t.tag1Name).map(t => ({ name: t.tag1Name, usageCount: t.usageCount })),
        tag2: tags.filter(t => t.tag2Name).map(t => ({ name: t.tag2Name, usageCount: t.usageCount })),
        tag3: tags.filter(t => t.tag3Name).map(t => ({ name: t.tag3Name, usageCount: t.usageCount })),
        tag1Preset: TAG1_PRESET,
      });
    }
    
    case 'create_tag': {
      const tagName = args.tagName as string;
      const tagLevel = args.tagLevel as 'tag2' | 'tag3';
      
      if (!tagName) {
        return JSON.stringify({ success: false, error: '标签名称不能为空' });
      }
      
      if (!['tag2', 'tag3'].includes(tagLevel)) {
        return JSON.stringify({ success: false, error: '只能创建 Tag2 或 Tag3，Tag1 只能从预设列表选择' });
      }
      
      try {
        await ensureTagExists(tagName, tagLevel);
        return JSON.stringify({ success: true, tagName, tagLevel });
      } catch (error) {
        return JSON.stringify({ success: false, error: error instanceof Error ? error.message : '创建失败' });
      }
    }
    
    default:
      return JSON.stringify({ success: false, error: `未知工具: ${name}` });
  }
}

export async function analyzeFeedbackWithTools(
  content: string,
  unsatisfactoryReason: string,
  source: string,
  confidenceThreshold: number
): Promise<ToolBasedTagResult> {
  const sanitizedContent = sanitizeUserInput(content);
  const sanitizedReason = sanitizeUserInput(unsatisfactoryReason);
  
  const systemPrompt = `你是一名专业的 NPS 用户反馈分析助手。请按照以下步骤分析用户反馈：

步骤 1：理解反馈内容
- 阅读用户反馈：${sanitizedContent.cleaned}
- 不满意原因：${sanitizedReason.cleaned || '无'}
- 反馈来源：${source}

步骤 2：查询标签库
- 必须先调用 get_tags 工具查询现有的标签库
- Tag1 只能从预设列表中选择：${TAG1_PRESET.join('、')}
- Tag2 和 Tag3 优先匹配已有标签，如果没有合适的再创建新标签

步骤 3：分析并打标
- Tag1：选择最符合的一级标签（只能选一个）
- Tag2：选择相关的功能模块（可多选，最多 3 个）
- Tag3：提取具体问题（可多选，最多 3 个）
- 需要创建新标签时，调用 create_tag 工具

步骤 4：输出结果
- 必须返回 JSON 格式
- 包含：tag1、tag2、tag3、confidence、needLogCheck、translatedContent

${CONSTITUTIONAL_REFUSAL}`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请分析这条反馈并打标。首先调用 get_tags 查询标签库。' },
  ];

  let newTagsCreated = 0;
  const maxToolCalls = 5;
  
  for (let i = 0; i < maxToolCalls; i++) {
    const response = await chatCompletionWithTools(
      messages,
      TAG_TOOLS,
      { temperature: 0.3, maxTokens: 4096, taskType: 'analyzeFeedbackWithTools' }
    );
    
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(toolCall.function.name, args);
          
          messages.push({
            role: 'assistant',
            content: JSON.stringify({ tool_calls: [toolCall] }),
          });
          
          messages.push({
            role: 'tool',
            content: result,
          });
          
          if (toolCall.function.name === 'create_tag') {
            const resultData = JSON.parse(result);
            if (resultData.success) {
              newTagsCreated++;
              await invalidateTagCache();
            }
          }
        } catch (error) {
          console.error('[Tagger] 执行工具调用失败:', error);
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: '执行失败' }),
          });
        }
      }
    } else {
      try {
        const result = await chatCompletionJsonSchema<BatchTaggingResult>(
          messages,
          BatchTaggingJsonSchema,
          { temperature: 0.3, maxTokens: 2048, taskType: 'analyzeFeedbackFinal' }
        );
        
        const raw = result.results[0] || {
          tag1: [],
          tag2: [],
          tag3: [],
          confidence: 0,
          needLogCheck: false,
          translatedContent: '',
        };
        
        const confidence = Math.max(0, Math.min(1, raw.confidence || 0.5));
        const reviewNeeded = confidence < confidenceThreshold || 
          raw.tag1.length === 0 || 
          raw.tag2.length === 0 || 
          raw.tag3.length === 0;
        
        return {
          tag1: raw.tag1.length > 0 ? raw.tag1 : ['未分类'],
          tag2: raw.tag2.length > 0 ? raw.tag2 : ['未分类'],
          tag3: raw.tag3.length > 0 ? raw.tag3 : ['未分类'],
          confidence,
          needLogCheck: !!raw.needLogCheck,
          reviewNeeded,
          translatedContent: raw.translatedContent || '',
          newTagsCreated,
        };
      } catch (error) {
        console.error('[Tagger] 最终分析失败:', error);
        return {
          tag1: ['未分类'],
          tag2: ['未分类'],
          tag3: ['未分类'],
          confidence: 0,
          needLogCheck: false,
          reviewNeeded: true,
          translatedContent: '',
          newTagsCreated,
        };
      }
    }
  }
  
  return {
    tag1: ['未分类'],
    tag2: ['未分类'],
    tag3: ['未分类'],
    confidence: 0,
    needLogCheck: false,
    reviewNeeded: true,
    translatedContent: '',
    newTagsCreated,
  };
}

export async function completeTaggingProcessWithTools(
  feedbackId: string,
  content: string,
  score: number,
  module: string,
  unsatisfactoryReason: string,
  source: string,
  recordId: string,
  confidenceThreshold: number = 0.8
): Promise<{ success: boolean; result?: ToolBasedTagResult }> {
  try {
    console.log(`[Tagger] 开始处理反馈（工具调用模式）: ${feedbackId}`);
    
    const aiResult = await analyzeFeedbackWithTools(content, unsatisfactoryReason, source, confidenceThreshold);
    console.log(`[Tagger] AI分析结果: tag1=${aiResult.tag1}, tag2=${aiResult.tag2}, tag3=${aiResult.tag3}, confidence=${aiResult.confidence}`);
    
    for (const tag1 of aiResult.tag1) {
      await ensureTagExists(tag1, 'tag1');
    }
    for (const tag2 of aiResult.tag2) {
      await ensureTagExists(tag2, 'tag2');
    }
    for (const tag3 of aiResult.tag3) {
      await ensureTagExists(tag3, 'tag3');
    }
    
    await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, recordId, {
      [FEEDBACK_FIELDS.TAG1]: aiResult.tag1.filter(t => t),
      [FEEDBACK_FIELDS.TAG2]: aiResult.tag2.filter(t => t),
      [FEEDBACK_FIELDS.TAG3]: aiResult.tag3.filter(t => t),
      [FEEDBACK_FIELDS.CONFIDENCE]: aiResult.confidence,
      [FEEDBACK_FIELDS.NEED_LOG_CHECK]: aiResult.needLogCheck ? '是' : '否',
      [FEEDBACK_FIELDS.REVIEW_NEEDED]: aiResult.reviewNeeded ? '是' : '否',
      [FEEDBACK_FIELDS.TRANSLATED_CONTENT]: aiResult.translatedContent || '',
      [FEEDBACK_FIELDS.STATUS]: '已打标',
    });
    
    console.log(`[Tagger] 打标完成（工具调用模式）: ${feedbackId}`);
    return { success: true, result: aiResult };
  } catch (error) {
    console.error(`[Tagger] 打标失败（工具调用模式）: ${feedbackId}`, error);
    return { success: false };
  }
}