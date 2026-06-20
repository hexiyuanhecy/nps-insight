/**
 * AgnesAI LLM Provider（默认）
 */

import {
  LLMProvider,
  LLMConfig,
  LLMMessage,
  LLMResponse,
} from './base-provider';

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
}
