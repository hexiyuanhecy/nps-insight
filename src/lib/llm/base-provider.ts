/**
 * LLM Provider 基类和接口定义
 */

// LLM 配置
export interface LLMConfig {
  provider: 'agnesai' | 'claude' | 'openai' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// LLM 消息
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// LLM 响应
export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// LLM Provider 接口
export interface LLMProvider {
  /** 获取 Provider 类型 */
  getProviderType(): string;

  /** 测试连接 */
  testConnection(): Promise<{ success: boolean; message: string }>;

  /** 发送对话请求 */
  chat(messages: LLMMessage[]): Promise<LLMResponse>;

  /** 获取默认配置 */
  getDefaultConfig(): Partial<LLMConfig>;
}

// 默认系统 Prompt
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的用户反馈分析助手。你的任务是根据用户反馈内容，提取三个层级的标签。

## Tag1（一级标签）—— 必须从以下 7 类中选择：
1. 疑似Bug：功能异常、报错、无法使用
2. 功能优化：功能改进、新功能建议
3. 界面改进：UI问题、交互优化
4. 性能提升：加载慢、卡顿、耗电
5. 用户教育：不知道如何使用
6. 安全：安全漏洞、隐私问题
7. 无效：无法分析、垃圾反馈

## Tag2（二级标签）—— 功能模块
- 根据反馈内容识别所属功能模块
- 示例：极速打卡、补卡、休假申请、审批流程、抄送人选择等

## Tag3（三级标签）—— 具体问题
- 从用户原话中提取的具体问题点
- 示例：入口太深、加载速度慢、无法搜索、必填项太多等

## 输出格式
必须严格按照以下 JSON 格式输出，不要添加任何其他内容：
{
  "tag1": "一级标签名称",
  "tag2": "二级标签名称",
  "tag3": "三级标签名称"
}

## 规则
1. Tag1 必须且只能从上述 7 个固定标签中选择
2. Tag2 和 Tag3 根据内容动态提取，尽可能具体
3. 如果无法确定 Tag2 或 Tag3，使用空字符串 ""
4. 如果反馈内容无法分析，Tag1 选择「无效」
5. 分析时先提取具体关键词作为 Tag3，再归类到功能模块作为 Tag2`;
