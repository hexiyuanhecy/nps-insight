/**
 * Prompt 模板引擎
 * 基于 Handlebars 集中管理所有 AI Prompt 模板
 * 支持模板编译缓存、版本追踪、自动 HTML 实体转义
 */

import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// ============================================
// 常量与类型
// ============================================

/** 模板文件根目录 */
const TEMPLATE_DIR = path.join(process.cwd(), 'src/lib/ai/templates');

/** 模板编译缓存 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

/** 已注册的模板名称（用于类型提示和校验） */
export const TEMPLATE_NAMES = {
  BATCH_TAGGING: 'tagging/batch-tagging',
  TAG_EVOLUTION: 'evolution/tag-evolution',
  INTENT_RECOGNITION: 'chat/intent-recognition',
  ANSWER_GENERATION: 'chat/answer-generation',
} as const;

/** 模板名称类型 */
export type TemplateName = (typeof TEMPLATE_NAMES)[keyof typeof TEMPLATE_NAMES];

/** 批量打标模板上下文 */
export interface BatchTaggingContext {
  /** 本次批次反馈数量 */
  feedbackCount: number;
  /** 反馈列表 */
  feedbacks: Array<{
    id: string;
    source: string;
    score: number;
    content: string;
  }>;
  /** Tag1 列表 */
  tag1List: string[];
  /** Tag2 列表 */
  tag2List: string[];
  /** Tag3 列表 */
  tag3List: string[];
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 模板版本号 */
  version?: string;
}

/** 标签进化模板上下文 */
export interface TagEvolutionContext {
  /** 分析模式 */
  mode: string;
  /** 全局标签参考 */
  globalTagReference: {
    tag1: Array<{ tagId: string; name: string; definition: string }>;
    tag2: Array<{ tagId: string; name: string; definition: string }>;
    tag3: Array<{ tagId: string; name: string; definition: string }>;
  };
  /** 分析数据 */
  analysisData: {
    tag3List: Array<{
      tagId: string;
      name: string;
      definition: string;
      parentTag2: string;
      usageCount: number;
      samples: string[];
    }>;
    tag2List: Array<{
      tagId: string;
      name: string;
      definition: string;
      usageCount: number;
      tag3Ids: string[];
      totalFeedbacks: number;
    }>;
  };
  /** 模板版本号 */
  version?: string;
}

/** 意图识别模板上下文 */
export interface IntentRecognitionContext {
  /** 用户问题 */
  question: string;
  /** 模板版本号 */
  version?: string;
}

/** 回答生成模板上下文 */
export interface AnswerGenerationContext {
  /** 用户问题 */
  question: string;
  /** 查询结果摘要 */
  summary: string;
  /** 详细数据 JSON */
  dataJson: string;
  /** 模板版本号 */
  version?: string;
}

/** 模板上下文联合类型 */
export type TemplateContext =
  | BatchTaggingContext
  | TagEvolutionContext
  | IntentRecognitionContext
  | AnswerGenerationContext;

// ============================================
// Handlebars 辅助函数
// ============================================

/**
 * JSON 序列化辅助函数
 * 用于在模板中将对象序列化为格式化 JSON
 * 返回 SafeString，避免 JSON 中的引号被 HTML 实体转义
 */
Handlebars.registerHelper('json', function (context: unknown, options?: { hash: { indent?: number } }) {
  const indent = options?.hash?.indent ?? 2;
  return new Handlebars.SafeString(JSON.stringify(context, null, indent));
});

/**
 * 列表拼接辅助函数
 * 将数组用指定分隔符连接成字符串
 */
Handlebars.registerHelper('join', function (arr: unknown[], separator: string) {
  if (!Array.isArray(arr)) return '';
  return arr.join(separator || ', ');
});

// ============================================
// 核心方法
// ============================================

/**
 * 加载并编译模板（带缓存）
 * @param name 模板名称（相对 templates 目录的路径，不含 .hbs 后缀）
 * @returns 编译后的模板函数
 */
function loadTemplate(name: string): HandlebarsTemplateDelegate {
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  const filePath = path.join(TEMPLATE_DIR, `${name}.hbs`);

  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const compiled = Handlebars.compile(source, {
      // 保留默认 HTML 实体转义，防止 Prompt 注入
      noEscape: false,
      // 严格模式：访问未定义变量时抛出异常，便于排查
      strict: false,
    });

    templateCache.set(name, compiled);
    return compiled;
  } catch (error) {
    console.error(`[PromptEngine] 加载模板失败: ${name}`, error);
    throw new Error(`模板加载失败: ${name}`);
  }
}

/**
 * 渲染 Prompt 模板
 * @param name 模板名称
 * @param context 模板上下文数据
 * @returns 渲染后的 Prompt 字符串
 */
export function renderPrompt(name: TemplateName, context: TemplateContext): string {
  const template = loadTemplate(name);
  return template(context).trim();
}

/**
 * 渲染 Prompt 模板（带安全隔离包装）
 * 在模板输出后追加宪法式拒绝声明
 * @param name 模板名称
 * @param context 模板上下文数据
 * @param refusal 拒绝声明文本
 * @returns 渲染后的安全 Prompt 字符串
 */
export function renderSecurePrompt(
  name: TemplateName,
  context: TemplateContext,
  refusal: string
): string {
  const prompt = renderPrompt(name, context);
  return `${prompt}\n\n${refusal}`;
}

/**
 * 清除模板编译缓存
 * 主要用于开发环境热重载和测试
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * 获取模板原始内容（用于调试和版本管理）
 * @param name 模板名称
 * @returns 模板原始字符串
 */
export function getTemplateSource(name: TemplateName): string {
  const filePath = path.join(TEMPLATE_DIR, `${name}.hbs`);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 从模板注释中提取版本号
 * Handlebars 注释格式：{{! version: 1.0.0 }}
 * @param name 模板名称
 * @returns 版本号，未找到返回 'unknown'
 */
export function getTemplateVersion(name: TemplateName): string {
  const source = getTemplateSource(name);
  const match = source.match(/\{\{!\s*version:\s*([^\}]+)\s*\}\}/);
  return match ? match[1].trim() : 'unknown';
}
