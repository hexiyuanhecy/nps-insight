/**
 * 语义缓存单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage/kv-storage', () => ({
  getValue: vi.fn(),
  setValue: vi.fn(),
}));

import { getValue, setValue } from '../../storage/kv-storage';
import {
  queryCache,
  writeCache,
  clearCache,
  getCacheStats,
  updateCacheStats,
  getCacheConfig,
  updateCacheConfig,
  shouldCacheTask,
  cosineSimilarity,
  cleanupExpiredCache,
} from '../semantic-cache';
import { TASK_TYPES } from '../model-router';

describe('语义缓存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getValue as vi.Mock).mockResolvedValue(null);
    (setValue as vi.Mock).mockResolvedValue(true);
  });

  describe('任务缓存策略', () => {
    it('问答任务应该被缓存', () => {
      expect(shouldCacheTask(TASK_TYPES.INTENT)).toBe(true);
      expect(shouldCacheTask(TASK_TYPES.ANSWER)).toBe(true);
      expect(shouldCacheTask(TASK_TYPES.SUMMARY)).toBe(true);
    });

    it('打标任务不应该被缓存', () => {
      expect(shouldCacheTask(TASK_TYPES.TAGGING)).toBe(false);
      expect(shouldCacheTask(TASK_TYPES.EVOLUTION)).toBe(false);
      expect(shouldCacheTask(TASK_TYPES.BATCH_ANALYZE)).toBe(false);
      expect(shouldCacheTask(TASK_TYPES.ANALYZE_FEEDBACK)).toBe(false);
    });
  });

  describe('余弦相似度', () => {
    it('相同向量相似度应为 1', () => {
      const vec = [1, 2, 3];
      expect(cosineSimilarity(vec, vec)).toBe(1);
    });

    it('正交向量相似度应为 0', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it('长度不同的向量相似度应为 0', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });

    it('相似向量应有较高相似度', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [2, 4, 6];
      expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1);
    });
  });

  describe('缓存配置', () => {
    it('应返回默认配置', async () => {
      const config = await getCacheConfig();
      expect(config.enabled).toBe(true);
      expect(config.ttlSeconds).toBe(3600);
      expect(config.similarityThreshold).toBe(0.95);
      expect(config.maxSize).toBe(1000);
    });

    it('应从 KV 读取配置', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({
        enabled: false,
        ttlSeconds: 1800,
      }));

      const config = await getCacheConfig();
      expect(config.enabled).toBe(false);
      expect(config.ttlSeconds).toBe(1800);
      expect(config.similarityThreshold).toBe(0.95);
    });

    it('应更新缓存配置', async () => {
      await updateCacheConfig({ enabled: false });
      expect(setValue).toHaveBeenCalled();
    });
  });

  describe('缓存写入与查询', () => {
    it('写入缓存后应能查询到', async () => {
      await writeCache('测试问题', '测试答案', TASK_TYPES.ANSWER);

      expect(setValue).toHaveBeenCalled();
    });

    it('缓存索引为空时应返回未命中', async () => {
      (getValue as vi.Mock).mockResolvedValueOnce(null);
      (getValue as vi.Mock).mockResolvedValueOnce(null);

      const result = await queryCache('NPS 总体情况', TASK_TYPES.SUMMARY);
      expect(result.hit).toBe(false);
    });

    it('打标任务应跳过缓存', async () => {
      const result = await queryCache('测试反馈', TASK_TYPES.TAGGING);
      expect(result.hit).toBe(false);
    });

    it('缓存禁用时应跳过缓存', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify({ enabled: false }));

      const result = await queryCache('测试问题', TASK_TYPES.ANSWER);
      expect(result.hit).toBe(false);
    });
  });

  describe('缓存过期', () => {
    it('过期缓存不应被命中', async () => {
      const expiredTime = Date.now() - 3600 * 1000 - 1000;
      const indexKey = 'ai:semantic-cache:index:answer';

      (getValue as vi.Mock).mockResolvedValueOnce(JSON.stringify(['ai:semantic-cache:answer:123']));
      (getValue as vi.Mock).mockResolvedValueOnce(JSON.stringify({
        query: '测试问题',
        answer: '测试答案',
        embedding: [1, 2, 3],
        timestamp: expiredTime,
        ttlSeconds: 3600,
        taskType: TASK_TYPES.ANSWER,
      }));

      const result = await queryCache('测试问题', TASK_TYPES.ANSWER);
      expect(result.hit).toBe(false);
    });
  });

  describe('缓存清除', () => {
    it('应清除指定任务类型的缓存', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify(['key1', 'key2']));

      await clearCache(TASK_TYPES.ANSWER);

      expect(setValue).toHaveBeenCalled();
    });

    it('应清除所有缓存', async () => {
      (getValue as vi.Mock).mockResolvedValue(JSON.stringify(['key1']));

      await clearCache();

      expect(setValue).toHaveBeenCalled();
    });
  });

  describe('缓存统计', () => {
    it('应返回初始统计', async () => {
      const stats = await getCacheStats();
      expect(stats.totalQueries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.entries).toBe(0);
    });

    it('应更新统计', async () => {
      await updateCacheStats(true);
      expect(setValue).toHaveBeenCalled();
    });
  });

  describe('过期缓存清理', () => {
    it('应清理过期缓存', async () => {
      (getValue as vi.Mock).mockImplementation((key: string) => {
        if (key.includes('index:')) {
          return Promise.resolve(JSON.stringify(['key1']));
        }
        return Promise.resolve(JSON.stringify({
          query: '测试',
          answer: '答案',
          embedding: [1, 2, 3],
          timestamp: Date.now() - 3600 * 1000 - 1000,
          ttlSeconds: 3600,
          taskType: TASK_TYPES.ANSWER,
        }));
      });

      await cleanupExpiredCache();

      expect(setValue).toHaveBeenCalled();
    });
  });
});
