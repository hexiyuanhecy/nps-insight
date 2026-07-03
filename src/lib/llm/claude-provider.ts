/**
 * Claude LLM Provider（Anthropic）
 */

import {
  LLMProvider,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMStreamOptions,
} from './base-provider';
import { encodeSSE } from './stream-utils';

export class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.baseUrl = 'https://api.anthropic.com/v1';
  }

  getProviderType(): string {
    return 'claude';
  }

  getDefaultConfig(): Partial<LLMConfig> {
    return {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Claude 返回错误表示连接成功（因为 test 消息太短）
      if (response.ok || response.status === 400) {
        return { success: true, message: 'Claude 连接成功' };
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
    // 将 OpenAI 格式转换为 Claude 格式
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        system: systemMessage?.content,
        messages: userMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || '',
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens:
          (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async chatStream(
    messages: LLMMessage[],
    options?: LLMStreamOptions
  ): Promise<ReadableStream<Uint8Array>> {
    // 将 OpenAI 格式转换为 Claude 格式
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options?.maxTokens ?? 500,
          temperature: options?.temperature ?? 0.3,
          system: systemMessage?.content,
          messages: userMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          stream: true,
        }),
        signal: options?.abortSignal,
      });
    } catch (error) {
      console.error('[ClaudeProvider] 流式请求失败', error);
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API 错误: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Claude API 返回空响应体');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return new ReadableStream({
      async start(controller) {
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            // 累积解码后的文本，保留未完成行到下一次处理
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) {
                continue;
              }

              const data = trimmed.slice(6);
              // Anthropic 流式结束标记
              if (data === '[DONE]') {
                controller.enqueue(encodeSSE({ done: true }));
                controller.close();
                return;
              }

              try {
                const event = JSON.parse(data) as {
                  type: string;
                  delta?: { type: string; text?: string };
                };
                // 仅处理文本增量事件
                if (
                  event.type === 'content_block_delta' &&
                  event.delta?.type === 'text_delta'
                ) {
                  const text = event.delta.text;
                  if (text) {
                    controller.enqueue(encodeSSE({ content: text }));
                  }
                }
              } catch {
                // 忽略无法解析的 JSON 行
              }
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
  }
}
