/**
 * AgnesAI LLM Provider（默认）
 * 支持：基础聊天、JSON Object、JSON Schema 结构化输出、工具调用、流式输出
 */

import OpenAI from 'openai';
import {
  LLMProvider,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMStreamOptions,
} from './base-provider';
import { encodeSSE } from './stream-utils';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        enum?: string[] | number[];
        description?: string;
      }>;
      required?: string[];
    };
  };
}

export interface ToolCallResult {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface StructuredResponse<T = unknown> {
  content: string;
  toolCalls?: ToolCallResult[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  data?: T;
}

export class AgnesAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey?: string, model?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.AGNESAI_API_KEY || '';
    this.model = model || process.env.AGNESAI_MODEL || 'agnes-2.0-flash';
    this.baseUrl = baseUrl || process.env.AGNESAI_BASE_URL || 'https://apihub.agnes-ai.com/v1';
  }

  getProviderType(): string {
    return 'agnesai';
  }

  getDefaultConfig(): Partial<LLMConfig> {
    return {
      provider: 'agnesai',
      baseUrl: 'https://api-hub.agnes-ai.com/v1',
      model: 'agnes-2.0-flash',
    };
  }

  private getClient(): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: 120000,
      maxRetries: 1,
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        return { success: true, message: 'AgnesAI 连接成功' };
      }
      return { success: false, message: `连接失败: ${response.status}` };
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await this.getClient().chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: 0.3,
      max_tokens: 500,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: response.usage,
    };
  }

  async chatWithJSON(messages: LLMMessage[]): Promise<StructuredResponse> {
    // AgnesAI 2.0 Flash 不支持 response_format，在 Prompt 中要求 JSON
    const jsonMessages = [...messages];
    // 确保 last message 包含 JSON 输出指令
    if (jsonMessages.length > 0) {
      const lastMsg = jsonMessages[jsonMessages.length - 1];
      if (!lastMsg.content.includes('JSON')) {
        lastMsg.content = lastMsg.content + '\n\n请严格输出JSON格式，不要添加额外文字。';
      }
    }

    const response = await this.getClient().chat.completions.create({
      model: this.model,
      messages: jsonMessages as OpenAI.ChatCompletionMessageParam[],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content || '';
    let parsed: unknown;
    try {
      parsed = content ? JSON.parse(content) : undefined;
    } catch {
      parsed = undefined;
    }
    return {
      content,
      usage: response.usage,
      data: parsed,
    };
  }

  async chatWithJsonSchema<T>(
    messages: LLMMessage[],
    schema: Record<string, unknown>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<StructuredResponse<T>> {
    const response = await this.getClient().chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema,
        },
      },
    });

    const content = response.choices[0]?.message?.content || '';
    return {
      content,
      usage: response.usage,
      data: content ? JSON.parse(content) as T : undefined,
    };
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
    }
  ): Promise<StructuredResponse> {
    const response = await this.getClient().chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      tools,
      tool_choice: options?.toolChoice ?? 'auto',
    });

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls?.map(tc => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })) || undefined;

    return {
      content: message?.content || '',
      toolCalls,
      usage: response.usage,
    };
  }

  async chatStream(
    messages: LLMMessage[],
    options?: LLMStreamOptions
  ): Promise<ReadableStream<Uint8Array>> {
    try {
      const stream = await this.getClient().chat.completions.create(
        {
          model: this.model,
          messages: messages as OpenAI.ChatCompletionMessageParam[],
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 500,
          stream: true,
        },
        {
          signal: options?.abortSignal,
        }
      );

      return new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                controller.enqueue(encodeSSE({ content }));
              }
            }
            controller.enqueue(encodeSSE({ done: true }));
            controller.close();
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              controller.close();
            } else {
              controller.error(error);
            }
          }
        },
      });
    } catch (error) {
      console.error('[AgnesAIProvider] 流式请求失败', error);
      throw error;
    }
  }
}
