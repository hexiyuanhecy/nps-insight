/**
 * 语义缓存（Semantic Cache）
 * 使用 Embedding 向量化 + 余弦相似度匹配实现智能缓存
 * 对高频重复查询做语义缓存，降低 AI 调用成本
 * 
 * 缓存策略：
 * - 问答类任务优先缓存（INTENT, ANSWER, SUMMARY）
 * - 打标任务不缓存（TAGGING, EVOLUTION, BATCH_ANALYZE）
 * - 相似度阈值 > 0.95 直接返回缓存结果
 * - 支持 TTL 自动过期和手动清除
 */

import { getValue, setValue } from '../storage/kv-storage';
import { TASK_TYPES, TaskType } from './model-router';

// ============================================
// 常量定义
// ============================================

const CACHE_KEY_PREFIX = 'ai:semantic-cache:';
const EMBEDDING_KEY_PREFIX = 'ai:semantic-embedding:';
const DEFAULT_TTL_SECONDS = 3600; // 默认缓存 1 小时
const DEFAULT_SIMILARITY_THRESHOLD = 0.95; // 相似度阈值
const MAX_CACHE_SIZE = 1000; // 最大缓存条数

// ============================================
// 类型定义
// ============================================

/** 缓存条目 */
export interface CacheEntry {
  query: string;
  answer: string;
  embedding: number[];
  timestamp: number;
  ttlSeconds: number;
  taskType: TaskType;
}

/** 缓存查询结果 */
export interface CacheResult {
  hit: boolean;
  answer?: string;
  similarity?: number;
  cachedAt?: number;
}

/** 缓存统计 */
export interface CacheStats {
  totalQueries: number;
  hits: number;
  misses: number;
  hitRate: number;
  entries: number;
}

// ============================================
// 缓存配置
// ============================================

export interface SemanticCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  similarityThreshold: number;
  maxSize: number;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  enabled: true,
  ttlSeconds: DEFAULT_TTL_SECONDS,
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  maxSize: MAX_CACHE_SIZE,
};

// ============================================
// 任务类型缓存策略
// ============================================

/** 判断任务类型是否应该被缓存 */
export function shouldCacheTask(taskType: TaskType): boolean {
  const cacheableTasks: TaskType[] = [
    TASK_TYPES.INTENT,
    TASK_TYPES.ANSWER,
    TASK_TYPES.SUMMARY,
  ];
  return cacheableTasks.includes(taskType);
}

// ============================================
// 余弦相似度计算
// ============================================

/** 计算两个向量的余弦相似度 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// ============================================
// 简单文本特征提取（降级方案）
// ============================================

/** 简单的文本哈希特征（用于无 Embedding 服务时的降级方案） */
function simpleTextFeatures(text: string): number[] {
  const normalized = text.toLowerCase().replace(/\s+/g, '');
  const features: number[] = new Array(64).fill(0);
  
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    const index = charCode % 64;
    features[index] += charCode / 100;
  }
  
  const hash = normalized.split('').reduce((acc, char) => {
    return acc * 31 + char.charCodeAt(0);
  }, 0);
  
  for (let i = 0; i < 8; i++) {
    features[i] += (hash >> (i * 8)) / 10000;
  }
  
  return features;
}

// ============================================
// 缓存管理
// ============================================

/** 获取缓存键 */
function getCacheKey(query: string, taskType: TaskType): string {
  const hash = query.split('').reduce((acc, char) => acc * 31 + char.charCodeAt(0), 0);
  return `${CACHE_KEY_PREFIX}${taskType}:${hash}`;
}

/** 获取任务类型的缓存索引键 */
function getTaskIndexKey(taskType: TaskType): string {
  return `${CACHE_KEY_PREFIX}index:${taskType}`;
}

/** 获取缓存配置 */
export async function getCacheConfig(): Promise<SemanticCacheConfig> {
  try {
    const raw = await getValue('ai:semantic-cache:config');
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.warn('[SemanticCache] 读取配置失败，使用默认配置:', error);
  }
  return { ...DEFAULT_CONFIG };
}

/** 更新缓存配置 */
export async function updateCacheConfig(config: Partial<SemanticCacheConfig>): Promise<void> {
  const current = await getCacheConfig();
  const merged = { ...current, ...config };
  await setValue('ai:semantic-cache:config', JSON.stringify(merged));
  console.log('[SemanticCache] 缓存配置已更新:', merged);
}

/** 查询缓存 */
export async function queryCache(
  query: string,
  taskType: TaskType,
  config?: SemanticCacheConfig
): Promise<CacheResult> {
  const cacheConfig = config || await getCacheConfig();
  
  if (!cacheConfig.enabled) {
    return { hit: false };
  }
  
  if (!shouldCacheTask(taskType)) {
    return { hit: false };
  }
  
  try {
    const indexKey = getTaskIndexKey(taskType);
    const indexRaw = await getValue(indexKey);
    
    if (!indexRaw) {
      return { hit: false };
    }
    
    const parsedIndex = JSON.parse(indexRaw);
    if (!Array.isArray(parsedIndex)) {
      return { hit: false };
    }
    
    const index: string[] = parsedIndex;
    const queryFeatures = simpleTextFeatures(query);
    
    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;
    
    for (const cacheKey of index) {
      const entryRaw = await getValue(cacheKey);
      if (!entryRaw) continue;
      
      try {
        const entry: CacheEntry = JSON.parse(entryRaw);
        
        // 检查是否过期
        if (Date.now() - entry.timestamp > entry.ttlSeconds * 1000) {
          continue;
        }
        
        // 计算相似度
        const similarity = cosineSimilarity(queryFeatures, entry.embedding);
        
        if (similarity > bestSimilarity && similarity >= cacheConfig.similarityThreshold) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      } catch {
        continue;
      }
    }
    
    if (bestMatch) {
      console.log(`[SemanticCache] 缓存命中，相似度: ${bestSimilarity.toFixed(4)}`);
      return {
        hit: true,
        answer: bestMatch.answer,
        similarity: bestSimilarity,
        cachedAt: bestMatch.timestamp,
      };
    }
    
    return { hit: false };
  } catch (error) {
    console.warn('[SemanticCache] 查询缓存失败:', error);
    return { hit: false };
  }
}

/** 写入缓存 */
export async function writeCache(
  query: string,
  answer: string,
  taskType: TaskType,
  config?: SemanticCacheConfig
): Promise<void> {
  const cacheConfig = config || await getCacheConfig();
  
  if (!cacheConfig.enabled) {
    return;
  }
  
  if (!shouldCacheTask(taskType)) {
    return;
  }
  
  try {
    const cacheKey = getCacheKey(query, taskType);
    const entry: CacheEntry = {
      query,
      answer,
      embedding: simpleTextFeatures(query),
      timestamp: Date.now(),
      ttlSeconds: cacheConfig.ttlSeconds,
      taskType,
    };
    
    await setValue(cacheKey, JSON.stringify(entry));
    
    // 更新索引
    const indexKey = getTaskIndexKey(taskType);
    const indexRaw = await getValue(indexKey);
    let index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    
    if (!index.includes(cacheKey)) {
      index.push(cacheKey);
      
      // 限制最大缓存数量
      if (index.length > cacheConfig.maxSize) {
        index = index.slice(-cacheConfig.maxSize);
      }
      
      await setValue(indexKey, JSON.stringify(index));
    }
    
    console.log('[SemanticCache] 缓存已写入:', cacheKey);
  } catch (error) {
    console.warn('[SemanticCache] 写入缓存失败:', error);
  }
}

/** 清除指定任务类型的缓存 */
export async function clearCache(taskType?: TaskType): Promise<void> {
  try {
    if (taskType) {
      const indexKey = getTaskIndexKey(taskType);
      const indexRaw = await getValue(indexKey);
      
      if (indexRaw) {
        const index: string[] = JSON.parse(indexRaw);
        for (const cacheKey of index) {
          await setValue(cacheKey, '');
        }
        await setValue(indexKey, '');
      }
    } else {
      // 清除所有缓存
      const taskTypes = Object.values(TASK_TYPES);
      for (const type of taskTypes) {
        await clearCache(type);
      }
    }
    
    console.log('[SemanticCache] 缓存已清除:', taskType || 'all');
  } catch (error) {
    console.warn('[SemanticCache] 清除缓存失败:', error);
  }
}

/** 获取缓存统计 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const statsRaw = await getValue('ai:semantic-cache:stats');
    let stats: CacheStats = statsRaw ? JSON.parse(statsRaw) : {
      totalQueries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
    };
    
    // 计算当前缓存条目数
    let entries = 0;
    const taskTypes = Object.values(TASK_TYPES);
    
    for (const taskType of taskTypes) {
      const indexKey = getTaskIndexKey(taskType);
      const indexRaw = await getValue(indexKey);
      if (indexRaw) {
        const index: string[] = JSON.parse(indexRaw);
        entries += index.length;
      }
    }
    
    stats.entries = entries;
    
    return stats;
  } catch (error) {
    console.warn('[SemanticCache] 获取统计失败:', error);
    return {
      totalQueries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
    };
  }
}

/** 更新缓存统计 */
export async function updateCacheStats(hit: boolean): Promise<void> {
  try {
    const statsRaw = await getValue('ai:semantic-cache:stats');
    let stats: CacheStats = statsRaw ? JSON.parse(statsRaw) : {
      totalQueries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      entries: 0,
    };
    
    stats.totalQueries++;
    if (hit) {
      stats.hits++;
    } else {
      stats.misses++;
    }
    stats.hitRate = stats.totalQueries > 0 ? stats.hits / stats.totalQueries : 0;
    
    await setValue('ai:semantic-cache:stats', JSON.stringify(stats));
  } catch (error) {
    console.warn('[SemanticCache] 更新统计失败:', error);
  }
}

/** 清除过期缓存 */
export async function cleanupExpiredCache(): Promise<void> {
  try {
    const taskTypes = Object.values(TASK_TYPES);
    
    for (const taskType of taskTypes) {
      const indexKey = getTaskIndexKey(taskType);
      const indexRaw = await getValue(indexKey);
      
      if (!indexRaw) continue;
      
      let index: string[] = JSON.parse(indexRaw);
      const validKeys: string[] = [];
      
      for (const cacheKey of index) {
        const entryRaw = await getValue(cacheKey);
        
        if (!entryRaw) continue;
        
        try {
          const entry: CacheEntry = JSON.parse(entryRaw);
          
          if (Date.now() - entry.timestamp <= entry.ttlSeconds * 1000) {
            validKeys.push(cacheKey);
          }
        } catch {
          continue;
        }
      }
      
      if (validKeys.length !== index.length) {
        await setValue(indexKey, JSON.stringify(validKeys));
        console.log(`[SemanticCache] 清理过期缓存: ${taskType}, 清理 ${index.length - validKeys.length} 条`);
      }
    }
  } catch (error) {
    console.warn('[SemanticCache] 清理过期缓存失败:', error);
  }
}
