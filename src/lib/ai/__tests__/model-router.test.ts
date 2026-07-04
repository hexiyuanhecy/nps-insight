/**
 * 模型路由单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock KV storage
vi.mock('../../storage/kv-storage', () => ({
  getValue: vi.fn(),
  setValue: vi.fn(),
}));

// Mock LLM provider modules to avoid import errors
vi.mock('@/lib/llm/provider-factory', () => ({
  LLMProviderFactory: {
    create: vi.fn(),
    createFromEnv: vi.fn(),
    createDefault: vi.fn(),
  },
}));

vi.mock('@/lib/llm/base-provider', () => ({
  LLMProvider: class {},
  LLMConfig: {} as any,
}));

import { getValue, setValue } from '../../storage/kv-storage';
import {
  route,
  getRouteConfig,
  updateRouteConfig,
  invalidateRouteConfigCache,
  isLightTask,
  isHeavyTask,
  TASK_TYPES,
  TASK_CATEGORIES,
} from '../model-router';

describe('模型路由', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateRouteConfigCache();
    (getValue as vi.Mock).mockResolvedValue(null);
  });

  describe('任务分类', () => {
    it('打标任务应为重量任务', () => {
      expect(isHeavyTask(TASK_TYPES.TAGGING)).toBe(true);
      expect(isLightTask(TASK_TYPES.TAGGING)).toBe(false);
    });

    it('进化任务应为重量任务', () => {
      expect(isHeavyTask(TASK_TYPES.EVOLUTION)).toBe(true);
      expect(isLightTask(TASK_TYPES.EVOLUTION)).toBe(false);
    });

    it('意图识别应为轻量任务', () => {
      expect(isLightTask(TASK_TYPES.INTENT)).toBe(true);
      expect(isHeavyTask(TASK_TYPES.INTENT)).toBe(false);
    });

    it('回答生成为轻量任务', () => {
      expect(isLightTask(TASK_TYPES.ANSWER)).toBe(true);
      expect(isHeavyTask(TASK_TYPES.ANSWER)).toBe(false);
    });

    it('摘要应为轻量任务', () => {
      expect(isLightTask(TASK_TYPES.SUMMARY)).toBe(true);
      expect(isHeavyTask(TASK_TYPES.SUMMARY)).toBe(false);
    });
  });

  describe('默认配置', () => {
    it('应返回默认路由配置', async () => {
      const config = await getRouteConfig();
      expect(config.routingEnabled).toBe(true);
      expect(config.heavyModel).toBe('agnes-2.0-flash');
      expect(config.lightModel).toBe('agnes-2.0-flash');
      expect(config.heavyTemperature).toBe(0.3);
      expect(config.lightTemperature).toBe(0.1);
      expect(config.heavyMaxTokens).toBe(8192);
      expect(config.lightMaxTokens).toBe(512);
    });

    it('轻量任务应使用轻量配置', async () => {
      const decision = await route(TASK_TYPES.INTENT);
      expect(decision.category).toBe('light');
      expect(decision.temperature).toBe(0.1);
      expect(decision.maxTokens).toBe(512);
      expect(decision.routed).toBe(true);
    });

    it('重量任务应使用重量配置', async () => {
      const decision = await route(TASK_TYPES.TAGGING);
      expect(decision.category).toBe('heavy');
      expect(decision.temperature).toBe(0.3);
      expect(decision.maxTokens).toBe(8192);
      expect(decision.routed).toBe(true);
    });
  });

  describe('KV 配置加载', () => {
    it('应从 KV 存储读取配置', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        routingEnabled: true,
        heavyModel: 'custom-heavy-model',
        lightModel: 'custom-light-model',
      }));

      const config = await getRouteConfig();
      expect(getValue).toHaveBeenCalled();
      expect(config.heavyModel).toBe('custom-heavy-model');
      expect(config.lightModel).toBe('custom-light-model');
    });

    it('KV 读取失败时应使用默认配置', async () => {
      (getValue as vi.Mock).mockRejectedValue(new Error('KV error'));

      const config = await getRouteConfig();
      expect(config.heavyModel).toBe('agnes-2.0-flash');
      expect(config.lightModel).toBe('agnes-2.0-flash');
    });
  });

  describe('配置更新', () => {
    it('应更新路由配置到 KV', async () => {
      await updateRouteConfig({
        routingEnabled: false,
        heavyModel: 'new-heavy',
      });

      expect(setValue).toHaveBeenCalled();
    });

    it('更新后应立即生效', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        routingEnabled: true,
        heavyModel: 'updated-heavy',
        lightModel: 'updated-light',
      }));

      invalidateRouteConfigCache();
      const config = await getRouteConfig();
      expect(config.heavyModel).toBe('updated-heavy');
      expect(config.lightModel).toBe('updated-light');
    });
  });

  describe('路由禁用', () => {
    it('禁用路由时应返回默认配置', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        routingEnabled: false,
      }));

      invalidateRouteConfigCache();
      const decision = await route(TASK_TYPES.INTENT);

      expect(decision.routed).toBe(false);
      expect(decision.category).toBe('heavy');
      expect(decision.temperature).toBe(0.3);
    });
  });

  describe('任务级别覆盖', () => {
    it('特定任务类型的覆盖配置应优先', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        routingEnabled: true,
        heavyModel: 'default-heavy',
        lightModel: 'default-light',
        overrides: {
          [TASK_TYPES.INTENT]: {
            model: 'special-model',
            temperature: 0.5,
            maxTokens: 1024,
          },
        },
      }));

      invalidateRouteConfigCache();
      const decision = await route(TASK_TYPES.INTENT);

      expect(decision.model).toBe('special-model');
      expect(decision.temperature).toBe(0.5);
      expect(decision.maxTokens).toBe(1024);
    });
  });

  describe('配置缓存', () => {
    it('配置应被缓存 1 分钟', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        heavyModel: 'cached-model',
      }));

      await getRouteConfig();
      await getRouteConfig();

      expect(getValue).toHaveBeenCalledTimes(1);
    });

    it('清除缓存后应重新读取', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        heavyModel: 'first-model',
      }));

      await getRouteConfig();
      invalidateRouteConfigCache();
      await getRouteConfig();

      expect(getValue).toHaveBeenCalledTimes(2);
    });
  });
});
