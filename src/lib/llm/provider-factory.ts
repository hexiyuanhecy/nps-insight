/**
 * LLM Provider 工厂
 */

import { LLMProvider, LLMConfig } from './base-provider';
import { AgnesAIProvider } from './agnesai-provider';
import { OpenAIProvider } from './openai-provider';
import { ClaudeProvider } from './claude-provider';

export class LLMProviderFactory {
  static create(config: LLMConfig): LLMProvider {
    switch (config.provider) {
      case 'agnesai':
        return new AgnesAIProvider(config.apiKey, config.model, config.baseUrl);
      case 'openai':
      case 'custom':
        return new OpenAIProvider({
          apiKey: config.apiKey!,
          model: config.model,
          baseUrl: config.baseUrl,
        });
      case 'claude':
        return new ClaudeProvider({
          apiKey: config.apiKey!,
          model: config.model,
        });
      default:
        // 默认使用 AgnesAI
        return new AgnesAIProvider();
    }
  }

  /**
   * 从环境变量创建 Provider
   */
  static createFromEnv(): LLMProvider {
    const provider = process.env.AGNESAI_PROVIDER as LLMConfig['provider'];
    const apiKey = process.env.AGNESAI_API_KEY;
    const baseUrl = process.env.AGNESAI_BASE_URL;
    const model = process.env.AGNESAI_MODEL;

    return this.create({
      provider: provider || 'agnesai',
      apiKey,
      baseUrl,
      model,
    });
  }

  /**
   * 获取默认 Provider（AgnesAI）
   */
  static createDefault(): LLMProvider {
    return new AgnesAIProvider();
  }
}

// 导出所有 Provider 类型
export { AgnesAIProvider } from './agnesai-provider';
export { OpenAIProvider } from './openai-provider';
export { ClaudeProvider } from './claude-provider';
