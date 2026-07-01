/**
 * 飞书多维表格自动建表模块
 * 首次启动时自动创建多维表格及所需表结构
 */

import { getTenantAccessToken, getTenantAccessTokenAsync } from './client';
import { TABLE_DEFINITIONS, TABLE_NAMES } from './constants';
import { bitableClient } from './bitable';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

// ============================================
// 类型定义
// ============================================

/** 初始化结果 */
export interface SetupResult {
  /** 是否成功 */
  success: boolean;
  /** 多维表格Token */
  bitableToken?: string;
  /** 创建的表信息 */
  tables?: Array<{ tableId: string; name: string }>;
  /** 错误信息 */
  error?: string;
}

// ============================================
// 多维表格创建
// ============================================

/**
 * 创建新的多维表格
 * @param name 多维表格名称
 * @param ownerId 用户ID，不传则使用环境变量
 * @returns 多维表格Token
 */
export async function createBitable(
  name: string = 'NPS Insight 数据',
  ownerId?: string
): Promise<string> {
  try {
    // 优先使用异步方式获取 token（从 KV 读配置）
    let token: string;
    if (ownerId) {
      token = await getTenantAccessTokenAsync(ownerId);
    } else {
      token = await getTenantAccessToken();
    }

    const response = await fetch(`${BITABLE_API_BASE}/apps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`创建多维表格失败: ${data.msg}`);
    }

    const appToken = data.data?.app?.app_token;
    if (!appToken) {
      throw new Error('创建多维表格失败：未返回app_token');
    }

    console.log(`[Setup] 多维表格创建成功，Token: ${appToken}`);
    return appToken;
  } catch (error) {
    console.error('[Setup] 创建多维表格失败', error);
    throw error;
  }
}

// ============================================
// 表结构初始化
// ============================================

/**
 * 初始化所有表结构
 * @param bitableToken 多维表格Token
 * @returns 创建的表信息
 */
export async function initializeTables(
  bitableToken: string
): Promise<Array<{ tableId: string; name: string }>> {
  // 临时设置环境变量以便bitableClient使用
  const originalToken = process.env.BITABLE_TOKEN;
  process.env.BITABLE_TOKEN = bitableToken;

  try {
    const createdTables: Array<{ tableId: string; name: string }> = [];

    // 按顺序创建所有表
    for (const [tableKey, tableDef] of Object.entries(TABLE_DEFINITIONS)) {
      console.log(`[Setup] 创建表: ${tableDef.name} (${tableKey})`);

      try {
        const tableId = await bitableClient.createTable(tableDef.name, tableDef.fields);
        createdTables.push({ tableId, name: tableDef.name });
        console.log(`[Setup] 表创建成功: ${tableDef.name}, ID: ${tableId}`);
      } catch (error) {
        console.error(`[Setup] 创建表失败: ${tableDef.name}`, error);
        throw error;
      }
    }

    return createdTables;
  } finally {
    // 恢复原始环境变量
    if (originalToken) {
      process.env.BITABLE_TOKEN = originalToken;
    }
  }
}

// ============================================
// 完整初始化流程
// ============================================

/**
 * 执行完整的系统初始化
 * 1. 创建多维表格
 * 2. 创建所有表
 * 3. 初始化默认配置
 * @param ownerId 用户ID，不传则使用环境变量
 * @returns 初始化结果
 */
export async function runSetup(ownerId?: string): Promise<SetupResult> {
  try {
    console.log('[Setup] 开始系统初始化...', ownerId ? `(owner: ${ownerId})` : '');

    // 检查是否已配置BITABLE_TOKEN
    const existingToken = process.env.BITABLE_TOKEN;
    let bitableToken: string;

    if (existingToken) {
      // 使用已有的多维表格
      bitableToken = existingToken;
      console.log(`[Setup] 使用已有多维表格: ${bitableToken}`);

      // 检查是否已有表
      process.env.BITABLE_TOKEN = bitableToken;
      const existingTables = await bitableClient.listTables();

      if (existingTables.length > 0) {
        console.log(`[Setup] 多维表格已有 ${existingTables.length} 个表，跳过建表`);
        return {
          success: true,
          bitableToken,
          tables: existingTables.map((t) => ({ tableId: t.table_id, name: t.name })),
        };
      }
    } else {
      // 创建新的多维表格
      bitableToken = await createBitable('NPS Insight 数据', ownerId);
    }

    // 创建表结构
    const tables = await initializeTables(bitableToken);

    // 初始化默认配置数据
    await initializeDefaultConfig(bitableToken);

    console.log('[Setup] 系统初始化完成');

    return {
      success: true,
      bitableToken,
      tables,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Setup] 系统初始化失败', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// 默认配置初始化
// ============================================

/**
 * 初始化默认配置数据
 * @param bitableToken 多维表格Token
 */
async function initializeDefaultConfig(bitableToken: string): Promise<void> {
  const originalToken = process.env.BITABLE_TOKEN;
  process.env.BITABLE_TOKEN = bitableToken;

  try {
    // 查找配置表
    const tables = await bitableClient.listTables();
    const configTable = tables.find((t) => t.name === '系统配置');

    if (!configTable) {
      console.warn('[Setup] 未找到配置表，跳过默认配置初始化');
      return;
    }

    // 初始化默认配置项
    const defaultConfigs = [
      {
        configKey: 'system_initialized',
        configValue: 'true',
        description: '系统初始化标志',
      },
      {
        configKey: 'app_version',
        configValue: '1.0.0',
        description: '应用版本号',
      },
      {
        configKey: 'cron_schedule',
        configValue: '0 9 * * *',
        description: '定时任务执行频率（cron表达式）',
      },
      {
        configKey: 'auto_sync_enabled',
        configValue: 'false',
        description: '是否启用自动同步',
      },
    ];

    for (const config of defaultConfigs) {
      await bitableClient.createRecord(configTable.table_id, {
        ...config,
        updatedAt: new Date().toISOString(),
      });
    }

    console.log(`[Setup] 默认配置初始化完成，共 ${defaultConfigs.length} 项`);
  } catch (error) {
    console.error('[Setup] 初始化默认配置失败', error);
  } finally {
    if (originalToken) {
      process.env.BITABLE_TOKEN = originalToken;
    }
  }
}

// ============================================
// 导出便捷对象
// ============================================

export const setupManager = {
  createBitable,
  initializeTables,
  runSetup,
};
