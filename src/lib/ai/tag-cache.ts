/**
 * 标签缓存模块
 * 提供全局标签内存缓存的刷新和管理功能
 */

let tagsCache: any[] = [];
let cacheTimestamp = 0;

export async function refreshGlobalTagCache(): Promise<void> {
  console.log('[TagCache] 刷新全局标签缓存');
  tagsCache = [];
  cacheTimestamp = Date.now();
}

export function getCachedTags(): any[] {
  return tagsCache;
}

export function setCachedTags(tags: any[]): void {
  tagsCache = tags;
  cacheTimestamp = Date.now();
}

export function getCacheTimestamp(): number {
  return cacheTimestamp;
}
