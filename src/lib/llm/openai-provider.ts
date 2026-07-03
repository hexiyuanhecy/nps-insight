/**
 * OpenAI LLM Provider（支持 GPT 和自定义 OpenAI 兼容 API）
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

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  getProviderType(): string {
    return 'openai';
  }

  getDefaultConfig(): Partial<LLMConfig> {
    return {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
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
        return { success: true, message: 'OpenAI 兼容 API 连接成功' };
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
      throw new Error(`OpenAI API 错误: ${response.status} - ${errorText}`);
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
      // 使用 OpenAI SDK 发起流式请求
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
            // 遍历 SDK 返回的流式块
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                controller.enqueue(encodeSSE({ content }));
              }
            }
            // 流正常结束，发送结束标记
            controller.enqueue(encodeSSE({ done: true }));
            controller.close();
          } catch (error) {
            // 用户取消请求时优雅关闭，避免抛错
            if (error instanceof Error && error.name === 'AbortError') {
              controller.close();
            } else {
              controller.error(error);
            }
          }
        },
      });
    } catch (error) {
      console.error('[OpenAIProvider] 流式请求失败', error);
      throw error;
    }
  }
}
