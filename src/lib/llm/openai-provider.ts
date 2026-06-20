/**
 * OpenAI LLM Provider（支持 GPT 和自定义 OpenAI 兼容 API）
 */

import {
  LLMProvider,
  LLMConfig,
  LLMMessage,
  LLMResponse,
} from './base-provider';

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
}
