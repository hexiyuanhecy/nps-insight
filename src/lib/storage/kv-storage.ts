/**
 * Upstash Redis 存储适配器
 * 用于缓存配置和用户映射关系
 *
 * 支持两种模式：
 * 1. 生产环境：使用 Upstash Redis（需要配置 KV_REST_API_URL 和 KV_REST_API_TOKEN）
 * 2. 开发环境：无 Redis 时使用内存缓存作为 fallback
 */

import { Redis } from '@upstash/redis';

// ponytail: Config 类型与 route.ts 中的 StoredConfig 保持一致
// 使用 Record 避免循环依赖
type Config = Record<string, unknown>;

// Redis 客户端（延迟初始化）
let redisClient: Redis | null = null;

// 内存降级缓存 — 存储 JSON 字符串（仅开发环境使用）
const memoryCache = new Map<string, string>();

/**
 * 获取 Redis 客户端
 * 仅在环境变量配置时才初始化
 */
function getRedisClient(): Redis | null {
  // 已初始化直接返回
  if (redisClient) return redisClient;

  // 检查环境变量
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    redisClient = new Redis({
      url,
      token,
    });
    return redisClient;
  } catch {
    return null;
  }
}

/**
 * 检查 Redis 是否可用
 */
function isRedisAvailable(): boolean {
  return getRedisClient() !== null;
}

/**
 * 检查是否为开发环境
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

// ==================== 配置操作 ====================

/**
 * 获取配置
 */
export async function getConfig(ownerUserId: string): Promise<Config | null> {
  const client = getRedisClient();

  if (!client) {
    // 使用内存缓存
    const raw = memoryCache.get(`config:${ownerUserId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Config;
    } catch {
      return null;
    }
  }

  try {
    const result = await client.get(`config:${ownerUserId}`);
    if (!result) return null;
    // Upstash Redis 返回的结果可能是字符串或对象
    if (typeof result === 'string') {
      return JSON.parse(result) as Config;
    }
    return result as Config;
  } catch {
    // 连接失败，降级到内存
    const raw = memoryCache.get(`config:${ownerUserId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Config;
    } catch {
      return null;
    }
  }
}

/**
 * 保存配置
 */
export async function setConfig(ownerUserId: string, config: Config): Promise<boolean> {
  const client = getRedisClient();
  const key = `config:${ownerUserId}`;

  if (!client) {
    memoryCache.set(key, JSON.stringify(config));
    return true;
  }

  try {
    await client.set(key, JSON.stringify(config));
    return true;
  } catch {
    // 降级到内存缓存
    memoryCache.set(key, JSON.stringify(config));
    return true;
  }
}

// ==================== 用户映射操作 ====================

/**
 * 获取用户到 Owner 的映射
 */
export async function getUserMapping(userId: string): Promise<string | null> {
  const client = getRedisClient();

  if (!client) {
    return memoryCache.get(`userConfigMapping:${userId}`) ?? null;
  }

  try {
    const result = await client.get(`userConfigMapping:${userId}`);
    return (result as string | null) ?? null;
  } catch {
    return memoryCache.get(`userConfigMapping:${userId}`) ?? null;
  }
}

/**
 * 设置用户映射
 */
export async function setUserMapping(userId: string, ownerUserId: string): Promise<boolean> {
  const client = getRedisClient();
  const key = `userConfigMapping:${userId}`;

  if (!client) {
    memoryCache.set(key, ownerUserId);
    return true;
  }

  try {
    await client.set(key, ownerUserId);
    return true;
  } catch {
    memoryCache.set(key, ownerUserId);
    return true;
  }
}

/**
 * 删除用户映射
 */
export async function deleteUserMapping(userId: string): Promise<boolean> {
  const client = getRedisClient();
  const key = `userConfigMapping:${userId}`;

  if (!client) {
    memoryCache.delete(key);
    return true;
  }

  try {
    await client.del(key);
    return true;
  } catch {
    memoryCache.delete(key);
    return true;
  }
}

// ==================== 键枚举（供定时任务用） ====================

/**
 * 列出所有 config:* 键
 */
export async function listAllConfigKeys(): Promise<string[]> {
  const client = getRedisClient();

  if (!client) {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('config:'));
  }

  try {
    const keys: string[] = [];
    let cursor: number | string = 0;
    do {
      // @ts-ignore - Upstash scan API 类型定义复杂，使用简化调用
      const result = await client.scan(cursor, { match: 'config:*', count: 100 });
      cursor = typeof result[0] === 'number' ? result[0] : parseInt(String(result[0]), 10);
      const batch = result[1] as string[];
      if (batch && batch.length > 0) {
        keys.push(...batch);
      }
    } while (cursor !== 0);
    return keys;
  } catch {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('config:'));
  }
}

/**
 * 列出所有 userConfigMapping:* 键
 */
export async function listAllMappingKeys(): Promise<string[]> {
  const client = getRedisClient();

  if (!client) {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('userConfigMapping:'));
  }

  try {
    const keys: string[] = [];
    let cursor: number | string = 0;
    do {
      // @ts-ignore - Upstash scan API 类型定义复杂，使用简化调用
      const result = await client.scan(cursor, { match: 'userConfigMapping:*', count: 100 });
      cursor = typeof result[0] === 'number' ? result[0] : parseInt(String(result[0]), 10);
      const batch = result[1] as string[];
      if (batch && batch.length > 0) {
        keys.push(...batch);
      }
    } while (cursor !== 0);
    return keys;
  } catch {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('userConfigMapping:'));
  }
}

// ==================== 数据迁移 ====================

/**
 * 迁移标记键
 */
const MIGRATION_FLAG_KEY = 'system:migration_completed';

/**
 * 检查数据迁移是否已完成
 */
async function isMigrationCompleted(): Promise<boolean> {
  const client = getRedisClient();

  if (!client) {
    return memoryCache.has(MIGRATION_FLAG_KEY);
  }

  try {
    const flag = await client.get(MIGRATION_FLAG_KEY);
    return flag === 'true';
  } catch {
    return memoryCache.has(MIGRATION_FLAG_KEY);
  }
}

/**
 * 标记迁移已完成
 */
async function setMigrationCompleted(): Promise<void> {
  const client = getRedisClient();
  const key = MIGRATION_FLAG_KEY;

  if (!client) {
    memoryCache.set(key, 'true');
    return;
  }

  try {
    await client.set(key, 'true');
  } catch {
    memoryCache.set(key, 'true');
  }
}

/**
 * 从环境变量构建默认配置
 * 仅当 Redis 中没有配置时用于初始化
 */
function buildDefaultConfigFromEnv(): Config {
  return {
    version: 1,
    ownerUserId: process.env.DEFAULT_OWNER_ID || 'default_owner',
    feishu: {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
    },
    bitable: {
      mode: process.env.BITABLE_MODE || 'idle',
      appToken: process.env.FEISHU_BITABLE_APP_TOKEN || '',
      url: process.env.BITABLE_URL || '',
      status: process.env.FEISHU_BITABLE_APP_TOKEN ? 'linked' : 'unset',
    },
    dataSource: {
      apiUrl: process.env.DATA_SOURCE_API_URL || '',
      apiKey: process.env.DATA_SOURCE_API_KEY || '',
      queryParams: process.env.DATA_SOURCE_QUERY_PARAMS || '',
      timeRule: 'lastWeek',
    },
    webhook: {
      url: process.env.FEISHU_WEBHOOK_URL || '',
    },
    ai: {
      provider: process.env.AI_PROVIDER || 'agnesai',
      apiKey: process.env.AI_API_KEY || '',
      baseUrl: process.env.AI_BASE_URL || 'https://api.agnes.ai',
      model: process.env.AI_MODEL || 'ag-nezumi-20250611',
      modelVersion: process.env.AI_MODEL_VERSION || 'v1',
    },
    tag1: [],
    tag2Init: '',
    tagging: {
      confidenceThreshold: 0.7,
      largeTenantLevels: ['A4', 'A5', 'A6'],
    },
    schedule: {
      syncUnit: 'week',
      syncEvery: 1,
      syncTime: '09:00',
      syncWeekDay: 1,
      syncMonthDay: 1,
      analysisUnit: 'month',
      analysisEvery: 1,
      analysisTime: '00:00',
      analysisWeekDay: 1,
      analysisMonthDay: 1,
      devMode: process.env.CRON_DEV_MODE === 'true',
    },
    logPlatform: {
      urlTemplate: process.env.LOG_PLATFORM_URL_TEMPLATE || '',
    },
    notification: {
      chatIds: process.env.NOTIFICATION_CHAT_ID || '',
      adminUserIds: '',
    },
    operations: {
      adminUserIds: [],
    },
  };
}

/**
 * 执行数据迁移（从 .env 到 Redis）
 * 幂等操作：首次调用会迁移配置，之后调用无效
 *
 * @returns 是否执行了迁移（true=首次迁移，false=已迁移或跳过）
 */
export async function migrateFromEnvToKV(): Promise<boolean> {
  // 1. 检查是否已完成迁移
  if (await isMigrationCompleted()) {
    console.log('[迁移] 迁移已完成，跳过');
    return false;
  }

  // 2. 检查 Redis 中是否已有配置
  const existingKeys = await listAllConfigKeys();
  if (existingKeys.length > 0) {
    console.log(`[迁移] Redis 中已有 ${existingKeys.length} 个配置，跳过迁移`);
    await setMigrationCompleted();
    return false;
  }

  // 3. 从环境变量构建默认配置
  const defaultConfig = buildDefaultConfigFromEnv();
  const ownerId = defaultConfig.ownerUserId as string;

  console.log('[迁移] 开始从 .env 迁移配置到 Redis');
  console.log(`[迁移] Owner ID: ${ownerId}`);
  console.log(`[迁移] Redis 可用: ${isRedisAvailable()}`);

  // 4. 保存配置到 Redis
  await setConfig(ownerId, defaultConfig);

  // 5. 创建用户映射（owner → self）
  await setUserMapping(ownerId, ownerId);

  // 6. 标记迁移完成
  await setMigrationCompleted();

  console.log('[迁移] 配置迁移完成');
  return true;
}

// 导出存储状态供调试
export function getStorageStatus(): { redis: boolean; memory: number } {
  return {
    redis: isRedisAvailable(),
    memory: memoryCache.size,
  };
}

// ==================== 通用键值操作 ====================

/**
 * 获取值
 * 注意：Upstash Redis 会自动 JSON 解析值，返回的可能是对象而非字符串
 */
export async function getValue(key: string): Promise<string | null> {
  const client = getRedisClient();

  if (!client) {
    return memoryCache.get(key) ?? null;
  }

  try {
    const result = await client.get(key);
    if (result === null) return null;
    // Upstash Redis 可能自动 JSON 解析，返回对象而非字符串
    // 如果是对象，转成 JSON 字符串，保持接口一致性
    if (typeof result === 'object') {
      return JSON.stringify(result);
    }
    return String(result);
  } catch {
    return memoryCache.get(key) ?? null;
  }
}

/**
 * 设置值
 */
export async function setValue(key: string, value: string): Promise<boolean> {
  const client = getRedisClient();

  if (!client) {
    memoryCache.set(key, value);
    return true;
  }

  try {
    await client.set(key, value);
    return true;
  } catch {
    memoryCache.set(key, value);
    return true;
  }
}
