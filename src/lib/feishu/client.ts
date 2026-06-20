/**
 * 飞书SDK客户端初始化模块
 * 封装 @larksuiteoapi/node-sdk，提供认证和基础请求能力
 */

import * as lark from '@larksuiteoapi/node-sdk';

// ============================================
// 客户端配置
// ============================================

/** 飞书应用配置 */
interface FeishuClientConfig {
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

/**
 * 获取全局飞书客户端实例（单例模式）
 * @returns 飞书SDK客户端实例
 */
export function getFeishuClient(): lark.Client {
  if (!globalClient) {
    globalClient = createFeishuClientFromEnv();
  }
  return globalClient;
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
 * @returns 租户访问令牌
 */
export async function getTenantAccessToken(): Promise<string> {
  const client = getFeishuClient();
  const authClient = client as any;
  const token = await authClient.tokenManager.getTenantAccessToken({});
  return token;
}

// ============================================
// 便捷导出
// ============================================

export { lark };
export type { FeishuClientConfig };
