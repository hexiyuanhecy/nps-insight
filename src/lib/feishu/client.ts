/**
 * 飞书SDK客户端初始化模块
 * 封装 @larksuiteoapi/node-sdk，提供认证和基础请求能力
 */

import * as lark from '@larksuiteoapi/node-sdk';
import { getFeishuAppConfig, type FeishuAppConfig } from './feishu-config';

// ============================================
// 客户端配置
// ============================================

/** 飞书应用配置 */
export interface FeishuClientConfig {
  /** 应用ID */
  appId: string;
  /** 应用密钥 */
  appSecret: string;
  /** 是否开启调试日志 */
  debug?: boolean;
}

// ============================================
// 客户端创建
// ============================================

/**
 * 创建飞书SDK客户端
 * @param config 客户端配置
 * @returns 飞书SDK客户端实例
 */
export function createFeishuClient(config: FeishuClientConfig): lark.Client {
  const client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
    loggerLevel: config.debug ? lark.LoggerLevel.debug : lark.LoggerLevel.info,
  });

  console.log(`[FeishuClient] 飞书客户端已创建，AppID: ${config.appId}`);
  return client;
}

/**
 * 从环境变量创建飞书客户端
 * @returns 飞书SDK客户端实例
 * @throws 如果环境变量未配置则抛出错误
 */
export function createFeishuClientFromEnv(): lark.Client {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      '飞书应用配置缺失，请设置环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET'
    );
  }

  return createFeishuClient({
    appId,
    appSecret,
    debug: process.env.NODE_ENV === 'development',
  });
}

// ============================================
// 全局客户端实例（懒加载）
// ============================================

let globalClient: lark.Client | null = null;
// 按 ownerId 缓存的客户端实例（KV 存储配置）
const clientCache = new Map<string, lark.Client>();
// 按 ownerId 缓存的配置摘要（用于检测配置变化）
const configCache = new Map<string, string>();

/**
 * 获取全局飞书客户端实例（单例模式）
 * 注意：此方法只读环境变量，不读 KV 存储
 * @deprecated 推荐使用 getFeishuClientAsync()，会优先从 KV 存储读取配置
 */
export function getFeishuClient(): lark.Client {
  if (!globalClient) {
    globalClient = createFeishuClientFromEnv();
  }
  return globalClient;
}

/**
 * 异步获取飞书客户端实例（推荐使用）
 * 优先级：KV 存储 > 环境变量
 * @param ownerId 用户ID，不传则使用默认值
 */
export async function getFeishuClientAsync(ownerId?: string): Promise<lark.Client> {
  const oid = ownerId || process.env.DEFAULT_OWNER_ID || 'default_owner';

  // 1. 从 KV 存储读取配置
  let appConfig: FeishuAppConfig | null = null;
  try {
    appConfig = await getFeishuAppConfig(oid);
  } catch (e) {
    console.warn('[FeishuClient] 从 KV 读取配置失败，使用环境变量:', e);
  }

  // 2. 如果 KV 里没有配置，使用全局客户端（环境变量）
  if (!appConfig || !appConfig.appId || !appConfig.appSecret) {
    console.log('[FeishuClient] KV 无配置，使用环境变量创建客户端');
    return getFeishuClient();
  }

  // 3. 检查配置是否变化
  const configKey = `${appConfig.appId}:${appConfig.appSecret.slice(0, 8)}`;
  const cachedClient = clientCache.get(oid);
  const cachedConfig = configCache.get(oid);

  if (cachedClient && cachedConfig === configKey) {
    return cachedClient;
  }

  // 4. 配置变化或无缓存，创建新客户端
  console.log(`[FeishuClient] 创建新客户端 (owner: ${oid}, appId: ${appConfig.appId})`);
  const client = createFeishuClient({
    appId: appConfig.appId,
    appSecret: appConfig.appSecret,
    debug: process.env.NODE_ENV === 'development',
  });

  clientCache.set(oid, client);
  configCache.set(oid, configKey);

  return client;
}

/**
 * 重新初始化全局客户端
 * 用于配置变更后刷新客户端
 */
export function resetFeishuClient(): void {
  globalClient = null;
  console.log('[FeishuClient] 飞书客户端已重置');
}

/**
 * 获取租户访问令牌
 * 注意：此方法只读环境变量，不读 KV 存储
 * @deprecated 推荐使用 getTenantAccessTokenAsync()，会优先从 KV 存储读取配置
 */
export async function getTenantAccessToken(): Promise<string> {
  const client = getFeishuClient();
  const authClient = client as any;
  const token = await authClient.tokenManager.getTenantAccessToken({});
  return token;
}

/**
 * 异步获取租户访问令牌（推荐使用）
 * 优先级：KV 存储 > 环境变量
 * @param ownerId 用户ID，不传则使用默认值
 */
export async function getTenantAccessTokenAsync(ownerId?: string): Promise<string> {
  const client = await getFeishuClientAsync(ownerId);
  const authClient = client as any;
  const token = await authClient.tokenManager.getTenantAccessToken({});
  return token;
}

// ============================================
// 便捷导出
// ============================================

export { lark };
