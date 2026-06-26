/**
 * Vercel KV 存储适配器
 * 用于缓存配置和用户映射关系
 */

// ponytail: Config 类型与 route.ts 中的 StoredConfig 保持一致
// 使用 Record 避免循环依赖
type Config = Record<string, unknown>;

// KV 客户端（延迟初始化）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kvClient: any = null;

// 内存降级缓存
const memoryCache = new Map<string, string>();

/**
 * 获取 KV 客户端，带降级处理
 */
async function getKvClient() {
  if (kvClient !== null) return kvClient;

  // 先检查环境变量是否配置，未配置则直接降级到内存缓存
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.warn('[KV] KV 环境变量未配置，使用内存缓存降级');
    kvClient = null;
    return null;
  }

  try {
    const { createClient } = await import('@vercel/kv');
    kvClient = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    return kvClient;
  } catch {
    // KV 不可用，使用内存缓存
    kvClient = null;
    return null;
  }
}

// ==================== 配置操作 ====================

/**
 * 获取配置
 */
export async function getConfig(ownerUserId: string): Promise<Config | null> {
  const client = await getKvClient();
  if (!client) {
    return memoryCache.get(`config:${ownerUserId}`) as Config | null ?? null;
  }

  try {
    const result = await client.get<Config>(`config:${ownerUserId}`);
    return result ?? null;
  } catch {
    return memoryCache.get(`config:${ownerUserId}`) as Config | null ?? null;
  }
}

/**
 * 保存配置
 */
export async function setConfig(ownerUserId: string, config: Config): Promise<boolean> {
  const client = await getKvClient();
  const key = `config:${ownerUserId}`;

  if (!client) {
    memoryCache.set(key, config as unknown as string);
    return true;
  }

  try {
    await client.set(key, config);
    return true;
  } catch {
    // 降级到内存缓存
    memoryCache.set(key, config as unknown as string);
    return true;
  }
}

// ==================== 用户映射操作 ====================

/**
 * 获取用户到 Owner 的映射
 */
export async function getUserMapping(userId: string): Promise<string | null> {
  const client = await getKvClient();
  if (!client) {
    return memoryCache.get(`userConfigMapping:${userId}`) ?? null;
  }

  try {
    const result = await client.get<string>(`userConfigMapping:${userId}`);
    return result ?? null;
  } catch {
    return memoryCache.get(`userConfigMapping:${userId}`) ?? null;
  }
}

/**
 * 设置用户映射
 */
export async function setUserMapping(userId: string, ownerUserId: string): Promise<boolean> {
  const client = await getKvClient();
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
  const client = await getKvClient();
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
  const client = await getKvClient();
  if (!client) {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('config:'));
  }

  try {
    const keys: string[] = [];
    // ponytail: 使用 scan 而非 keys()，避免阻塞
    let cursor = 0;
    do {
      const [nextCursor, batch] = await client.scan<string>({ cursor, match: 'config:*', count: 100 });
      cursor = nextCursor;
      keys.push(...batch);
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
  const client = await getKvClient();
  if (!client) {
    return Array.from(memoryCache.keys()).filter((k) => k.startsWith('userConfigMapping:'));
  }

  try {
    const keys: string[] = [];
    let cursor = 0;
    do {
      const [nextCursor, batch] = await client.scan<string>({ cursor, match: 'userConfigMapping:*', count: 100 });
      cursor = nextCursor;
      keys.push(...batch);
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
  const client = await getKvClient();
  if (!client) {
    return memoryCache.has(MIGRATION_FLAG_KEY);
  }

  try {
    const flag = await client.get<string>(MIGRATION_FLAG_KEY);
    return flag === 'true';
  } catch {
    return memoryCache.has(MIGRATION_FLAG_KEY);
  }
}

/**
 * 标记迁移已完成
 */
async function setMigrationCompleted(): Promise<void> {
  const client = await getKvClient();
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
 * 仅当 KV 中没有配置时用于初始化
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
      url: process.env.FEISHU_BITABLE_URL || '',
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
 * 执行数据迁移（从 .env 到 KV）
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

  // 2. 检查 KV 中是否已有配置
  const existingKeys = await listAllConfigKeys();
  if (existingKeys.length > 0) {
    console.log(`[迁移] KV 中已有 ${existingKeys.length} 个配置，跳过迁移`);
    await setMigrationCompleted();
    return false;
  }

  // 3. 从环境变量构建默认配置
  const defaultConfig = buildDefaultConfigFromEnv();
  const ownerId = defaultConfig.ownerUserId as string;

  console.log('[迁移] 开始从 .env 迁移配置到 KV');
  console.log(`[迁移] Owner ID: ${ownerId}`);

  // 4. 保存配置到 KV
  await setConfig(ownerId, defaultConfig);

  // 5. 创建用户映射（owner → self）
  await setUserMapping(ownerId, ownerId);

  // 6. 标记迁移完成
  await setMigrationCompleted();

  console.log('[迁移] 配置迁移完成');
  return true;
}
