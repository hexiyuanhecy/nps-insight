/**
 * AgnesAI LLM Provider（默认）
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AgnesAI API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  async chatStream(
    messages: LLMMessage[],
    options?: LLMStreamOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: 60000,
      maxRetries: 2,
    });

    try {
      // AgnesAI 为 OpenAI 兼容接口，复用 SDK 流式能力
      const stream = await client.chat.completions.create(
        {
          model: this.model,
          messages,
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
