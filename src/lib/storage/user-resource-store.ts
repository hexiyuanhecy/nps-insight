/**
 * 本地环境用户资源存储实现
 * 从环境变量读取4个核心Token，静态复用
 * 适用：单用户本地调试、快速迭代
 */

import { UserResource, UserResourceStore } from '../types';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

/** 环境变量映射 - 核心Token */
const ENV_KEYS = {
  rootFolderToken: 'ROOT_FOLDER_TOKEN',
  reportFolderToken: 'REPORT_FOLDER_TOKEN',
  monthFolderToken: 'MONTH_FOLDER_TOKEN',
  bitableBaseToken: 'BITABLE_BASE_APP_TOKEN',
} as const;

/** 环境变量映射 - 用户Token */
const USER_TOKEN_KEYS = {
  userAccessToken: 'USER_ACCESS_TOKEN',
  refreshToken: 'USER_REFRESH_TOKEN',
  tokenExpiresAt: 'USER_TOKEN_EXPIRES_AT',
  userOpenId: 'ADMIN_USER_OPEN_ID',
} as const;

/**
 * 本地环境用户资源存储
 * 只读模式：从环境变量读取，不支持写入（写入会打印警告并返回）
 */
export class LocalUserResourceStore implements UserResourceStore {
  /**
   * 从环境变量读取用户资源
   */
  async get(): Promise<UserResource | null> {
    const rootFolderToken = process.env[ENV_KEYS.rootFolderToken] || '';
    const reportFolderToken = process.env[ENV_KEYS.reportFolderToken] || '';
    const monthFolderToken = process.env[ENV_KEYS.monthFolderToken] || '';
    const bitableBaseToken = process.env[ENV_KEYS.bitableBaseToken] || '';

    // 用户Token
    const userAccessToken = process.env[USER_TOKEN_KEYS.userAccessToken] || '';
    const refreshToken = process.env[USER_TOKEN_KEYS.refreshToken] || '';
    const tokenExpiresAt = process.env[USER_TOKEN_KEYS.tokenExpiresAt];
    const userOpenId = process.env[USER_TOKEN_KEYS.userOpenId] || '';

    // 检查4个核心Token是否都有值
    const hasAllTokens = [rootFolderToken, reportFolderToken, monthFolderToken, bitableBaseToken].every(Boolean);

    if (!hasAllTokens) {
      console.log('[本地用户资源] 环境变量中Token不完整，返回null');
      console.log(`  - ${ENV_KEYS.rootFolderToken}: ${rootFolderToken ? '已配置' : '未配置'}`);
      console.log(`  - ${ENV_KEYS.reportFolderToken}: ${reportFolderToken ? '已配置' : '未配置'}`);
      console.log(`  - ${ENV_KEYS.monthFolderToken}: ${monthFolderToken ? '已配置' : '未配置'}`);
      console.log(`  - ${ENV_KEYS.bitableBaseToken}: ${bitableBaseToken ? '已配置' : '未配置'}`);
      return null;
    }

    console.log('[本地用户资源] 从环境变量读取成功');
    
    const resource: UserResource = {
      rootFolderToken,
      reportFolderToken,
      monthFolderToken,
      bitableBaseToken,
      userOpenId: userOpenId || undefined,
    };

    // 如果有用户token，也一并返回
    if (userAccessToken && refreshToken) {
      resource.userAccessToken = userAccessToken;
      resource.refreshToken = refreshToken;
      resource.tokenExpiresAt = tokenExpiresAt ? parseInt(tokenExpiresAt, 10) : undefined;
    }

    return resource;
  }

  /**
   * 保存用户资源（本地环境不支持持久化保存，只打印日志）
   */
  async save(resource: UserResource): Promise<void> {
    console.warn('[本地用户资源] 本地环境不支持持久化保存，请手动将以下Token写入 .env.local:');
    console.log('');
    console.log(`${ENV_KEYS.rootFolderToken}=${resource.rootFolderToken}`);
    console.log(`${ENV_KEYS.reportFolderToken}=${resource.reportFolderToken}`);
    console.log(`${ENV_KEYS.monthFolderToken}=${resource.monthFolderToken}`);
    console.log(`${ENV_KEYS.bitableBaseToken}=${resource.bitableBaseToken}`);
    
    // 保存用户Token
    if (resource.userAccessToken) {
      console.log(`${USER_TOKEN_KEYS.userAccessToken}=${resource.userAccessToken}`);
    }
    if (resource.refreshToken) {
      console.log(`${USER_TOKEN_KEYS.refreshToken}=${resource.refreshToken}`);
    }
    if (resource.tokenExpiresAt) {
      console.log(`${USER_TOKEN_KEYS.tokenExpiresAt}=${resource.tokenExpiresAt}`);
    }
    if (resource.userOpenId) {
      console.log(`${USER_TOKEN_KEYS.userOpenId}=${resource.userOpenId}`);
    }
    console.log('');

    // 将Token临时存入内存，供当前进程使用
    process.env[ENV_KEYS.rootFolderToken] = resource.rootFolderToken;
    process.env[ENV_KEYS.reportFolderToken] = resource.reportFolderToken;
    process.env[ENV_KEYS.monthFolderToken] = resource.monthFolderToken;
    process.env[ENV_KEYS.bitableBaseToken] = resource.bitableBaseToken;

    if (resource.userAccessToken) {
      process.env[USER_TOKEN_KEYS.userAccessToken] = resource.userAccessToken;
    }
    if (resource.refreshToken) {
      process.env[USER_TOKEN_KEYS.refreshToken] = resource.refreshToken;
    }
    if (resource.tokenExpiresAt) {
      process.env[USER_TOKEN_KEYS.tokenExpiresAt] = String(resource.tokenExpiresAt);
    }
    if (resource.userOpenId) {
      process.env[USER_TOKEN_KEYS.userOpenId] = resource.userOpenId;
    }

    console.log('[本地用户资源] Token已临时存入当前进程内存，重启后失效');
  }

  /**
   * 保存用户授权Token
   */
  async saveUserToken(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = getCurrentTimestampSeconds() + expiresIn;
    
    console.warn('[本地用户资源] 保存用户Token到 .env.local:');
    console.log(`${USER_TOKEN_KEYS.userAccessToken}=${accessToken}`);
    console.log(`${USER_TOKEN_KEYS.refreshToken}=${refreshToken}`);
    console.log(`${USER_TOKEN_KEYS.tokenExpiresAt}=${expiresAt}`);
    console.log('');

    // 临时存入内存
    process.env[USER_TOKEN_KEYS.userAccessToken] = accessToken;
    process.env[USER_TOKEN_KEYS.refreshToken] = refreshToken;
    process.env[USER_TOKEN_KEYS.tokenExpiresAt] = String(expiresAt);
  }

  /**
   * 获取有效的用户 access_token
   * 如果 token 即将过期，返回 null
   */
  async getValidAccessToken(): Promise<string | null> {
    const accessToken = process.env[USER_TOKEN_KEYS.userAccessToken];
    const expiresAt = process.env[USER_TOKEN_KEYS.tokenExpiresAt];
    
    if (!accessToken || !expiresAt) {
      return null;
    }

    const expiresAtTimestamp = parseInt(expiresAt, 10);
    const now = getCurrentTimestampSeconds();
    
    // 如果 token 即将过期（剩余 < 10 分钟），返回 null 让调用者刷新
    if (expiresAtTimestamp - now < 600) {
      console.log('[本地用户资源] Token即将过期，需要刷新');
      return null;
    }

    return accessToken;
  }

  /**
   * 获取 refresh_token
   */
  async getRefreshToken(): Promise<string | null> {
    return process.env[USER_TOKEN_KEYS.refreshToken] || null;
  }

  /**
   * 清除用户授权Token
   */
  async clearUserToken(): Promise<void> {
    console.log('[本地用户资源] 清除用户Token');
    delete process.env[USER_TOKEN_KEYS.userAccessToken];
    delete process.env[USER_TOKEN_KEYS.refreshToken];
    delete process.env[USER_TOKEN_KEYS.tokenExpiresAt];
  }

  /**
   * 判断资源是否已初始化
   */
  async exists(): Promise<boolean> {
    const resource = await this.get();
    return resource !== null;
  }

  /**
   * 判断用户是否已授权
   */
  async isUserAuthorized(): Promise<boolean> {
    const accessToken = await this.getValidAccessToken();
    const refreshToken = await this.getRefreshToken();
    return !!(accessToken && refreshToken);
  }
}

/**
 * 创建用户资源存储实例
 * 当前默认使用本地环境实现
 */
export function createUserResourceStore(): UserResourceStore {
  return new LocalUserResourceStore();
}
