/**
 * 飞书配置加载工具
 * 统一从 KV 存储 + 环境变量读取飞书配置
 * 优先级：KV 存储 > 环境变量
 * 
 * 解决问题：界面上保存了配置到 KV 存储，但代码只读环境变量导致配置不生效
 */

import { getConfig } from '@/lib/storage/kv-storage';

export interface FeishuAppConfig {
  appId: string;
  appSecret: string;
}

/**
 * 获取默认 ownerId
 */
function getDefaultOwnerId(): string {
  return process.env.DEFAULT_OWNER_ID || 'default_owner';
}

/**
 * 从环境变量读取飞书配置
 */
function getFeishuConfigFromEnv(): FeishuAppConfig {
  return {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
  };
}

/**
 * 从 KV 存储读取飞书配置
 */
async function getFeishuConfigFromKV(ownerId?: string): Promise<FeishuAppConfig | null> {
  try {
    const oid = ownerId || getDefaultOwnerId();
    const config = await getConfig(oid);
    if (config?.feishu && typeof config.feishu === 'object') {
      const feishu = config.feishu as { appId?: string; appSecret?: string };
      if (feishu.appId && feishu.appSecret) {
        return {
          appId: feishu.appId,
          appSecret: feishu.appSecret,
        };
      }
    }
    return null;
  } catch (error) {
    console.warn('[FeishuConfig] 从 KV 读取配置失败:', error);
    return null;
  }
}

/**
 * 获取飞书应用配置（推荐使用）
 * 优先级：环境变量 > KV 存储
 * 
 * 为什么环境变量优先级更高？
 * - FEISHU_APP_ID / FEISHU_APP_SECRET 是系统级配置，部署时就确定了
 * - KV 存储可能因误操作、测试、配置迁移等原因写入错误值
 * - 环境变量由运维/部署流程保证正确性，更可靠
 * - KV 存储仅作为 fallback（当环境变量未配置时使用）
 */
export async function getFeishuAppConfig(ownerId?: string): Promise<FeishuAppConfig> {
  // 1. 优先从环境变量读取（系统级配置，最可靠）
  const envConfig = getFeishuConfigFromEnv();
  if (envConfig.appId && envConfig.appSecret) {
    return envConfig;
  }

  // 2. 降级到 KV 存储（仅当环境变量未配置时使用）
  const kvConfig = await getFeishuConfigFromKV(ownerId);
  if (kvConfig && kvConfig.appId && kvConfig.appSecret) {
    return kvConfig;
  }

  // 3. 都没有，返回空配置
  console.warn('[FeishuConfig] 未找到飞书应用配置');
  return { appId: '', appSecret: '' };
}

/**
 * 检查飞书配置是否已设置
 */
export async function isFeishuConfigured(ownerId?: string): Promise<boolean> {
  const config = await getFeishuAppConfig(ownerId);
  return !!config.appId && !!config.appSecret;
}
