/**
 * 用户资源初始化编排服务
 * 首次登录时自动执行3步初始化流程：
 * 1. 创建根文件夹
 * 2. 创建两个子文件夹（周报归档、月报汇总）
 * 3. 授予用户管理员权限 + 保存Token
 * 多维表格单独配置，不在初始化流程中创建
 */

import { UserResource } from '../types';
import { createUserResourceStore } from '../storage/user-resource-store';
import { createFolder, addFolderAdmin, getFolderUrl } from '../feishu/drive-folder';

/** 初始化结果 */
export interface InitResult {
  /** 是否成功 */
  success: boolean;
  /** 用户资源 */
  resource?: UserResource;
  /** 错误信息 */
  error?: string;
  /** 是否是首次创建（false 表示已存在，直接返回） */
  isNew: boolean;
}

/**
 * 用户资源初始化器
 */
export class UserResourceInitializer {
  private store = createUserResourceStore();

  /**
   * 确保用户资源已初始化
   * - 已初始化：直接返回现有资源
   * - 未初始化：执行完整3步初始化流程
   * 
   * 如果用户已授权（有 userAccessToken），则使用用户身份创建资源
   * 否则使用应用身份（tenant_access_token）创建
   */
  async ensureInitialized(
    userName: string = '默认用户',
    userOpenId?: string
  ): Promise<InitResult> {
    console.log('\n' + '='.repeat(70));
    console.log('【用户资源初始化】开始检查资源状态...');
    console.log('='.repeat(70));

    try {
      // 先检查是否已有完整的云资源（必须有根文件夹token）
      const existing = await this.store.get();
      const hasCloudResource = existing && existing.rootFolderToken;

      if (hasCloudResource) {
        console.log('【用户资源初始化】云资源已存在，跳过初始化');
        console.log(`  - 根文件夹: ${existing.rootFolderToken}`);
        console.log(`  - 周报文件夹: ${existing.reportFolderToken}`);
        console.log(`  - 月报文件夹: ${existing.monthFolderToken}`);
        console.log(`  - 多维表格: ${existing.bitableBaseToken || '未配置'}`);
        console.log(`  - 授权状态: ${existing.userAccessToken ? '已授权（用户身份）' : '未授权（应用身份）'}`);
        console.log('='.repeat(70) + '\n');
        return {
          success: true,
          resource: existing,
          isNew: false,
        };
      }

      // 云资源未创建，开始执行3步初始化
      // 注意：可能已有授权信息（用户已授权），保留它用于创建资源
      console.log('【用户资源初始化】云资源未创建，开始执行3步初始化...');
      console.log(`  - 已有授权信息: ${existing?.userAccessToken ? '是（使用用户身份）' : '否（使用应用身份）'}`);

      // 读取用户授权信息（如果有）
      const userAccessToken = existing?.userAccessToken;
      const refreshToken = existing?.refreshToken;
      const tokenExpiresAt = existing?.tokenExpiresAt;

      // 合并用户信息：优先使用已有的授权信息，兜底用传入的参数
      // （用户先授权再初始化的场景，existing 里已有正确的 userName 和 userOpenId）
      const finalUserName = existing?.userName || userName;
      const finalUserOpenId = existing?.userOpenId || userOpenId;

      if (userAccessToken) {
        console.log('【用户资源初始化】使用用户身份创建资源');
      } else {
        console.log('【用户资源初始化】使用应用身份创建资源');
      }

      // 执行完整初始化流程
      const result = await this.doInitialize(finalUserName, finalUserOpenId, userAccessToken, refreshToken, tokenExpiresAt);

      console.log('\n' + '='.repeat(70));
      console.log('【用户资源初始化】全部完成 ✓');
      console.log('='.repeat(70));
      console.log(`  根文件夹: ${getFolderUrl(result.rootFolderToken)}`);
      console.log(`  周报归档: ${getFolderUrl(result.reportFolderToken)}`);
      console.log(`  月报汇总: ${getFolderUrl(result.monthFolderToken)}`);
      console.log(`  多维表格: 请前往下方"飞书多维表格"配置页面创建或绑定`);
      console.log('='.repeat(70) + '\n');

      return {
        success: true,
        resource: result,
        isNew: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('【用户资源初始化】初始化失败:', errorMsg);
      return {
        success: false,
        error: errorMsg,
        isNew: false,
      };
    }
  }

  /**
   * 强制重新初始化用户资源
   * 清除现有资源记录，重新创建一套新的
   */
  async reinitialize(
    userName: string = '默认用户',
    userOpenId?: string
  ): Promise<InitResult> {
    console.log('\n' + '='.repeat(70));
    console.log('【用户资源重新初始化】开始重新创建资源...');
    console.log('='.repeat(70));

    try {
      // 读取用户授权信息
      const existing = await this.store.get();
      const userAccessToken = existing?.userAccessToken;
      const refreshToken = existing?.refreshToken;
      const tokenExpiresAt = existing?.tokenExpiresAt;

      if (userAccessToken) {
        console.log('【重新初始化】使用用户身份重新创建资源');
      } else {
        console.log('【重新初始化】使用应用身份重新创建资源');
      }

      // 执行完整初始化流程
      const result = await this.doInitialize(
        userName || existing?.userName || '默认用户',
        userOpenId || existing?.userOpenId,
        userAccessToken,
        refreshToken,
        tokenExpiresAt
      );

      console.log('\n' + '='.repeat(70));
      console.log('【用户资源重新初始化】全部完成 ✓');
      console.log('='.repeat(70));
      console.log(`  根文件夹: ${getFolderUrl(result.rootFolderToken)}`);
      console.log(`  周报归档: ${getFolderUrl(result.reportFolderToken)}`);
      console.log(`  月报汇总: ${getFolderUrl(result.monthFolderToken)}`);
      console.log(`  多维表格: 请前往下方"飞书多维表格"配置页面创建或绑定`);
      console.log('='.repeat(70) + '\n');

      return {
        success: true,
        resource: result,
        isNew: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('【用户资源重新初始化】失败:', errorMsg);
      return {
        success: false,
        error: errorMsg,
        isNew: false,
      };
    }
  }

  /**
   * 执行完整的3步初始化流程
   * @param userName 用户名
   * @param userOpenId 用户OpenID
   * @param userAccessToken 用户访问令牌（可选，传入则用用户身份创建资源）
   * @param refreshToken 刷新令牌（用于自动刷新）
   * @param tokenExpiresAt 令牌过期时间戳
   */
  private async doInitialize(
    userName: string,
    userOpenId?: string,
    userAccessToken?: string,
    refreshToken?: string,
    tokenExpiresAt?: number
  ): Promise<UserResource> {
    const rootFolderName = `NPS业务资源_${userName}`;
    const reportFolderName = '周报归档';
    const monthFolderName = '月报汇总';

    const useUserIdentity = !!userAccessToken;
    console.log(`  创建身份: ${useUserIdentity ? '用户身份' : '应用身份'}`);

    // ============================================
    // 步骤1：创建根文件夹
    // ============================================
    console.log('\n' + '─'.repeat(50));
    console.log('【步骤 1/3】创建用户专属根云文件夹');
    console.log('─'.repeat(50));
    const rootFolder = await createFolder(
      rootFolderName,
      undefined,
      userAccessToken,
      refreshToken,
      tokenExpiresAt
    );
    const rootFolderToken = rootFolder.folderToken;
    console.log(`✓ 根文件夹创建成功: ${rootFolderToken}`);

    // ============================================
    // 步骤2：创建两个业务子文件夹
    // ============================================
    console.log('\n' + '─'.repeat(50));
    console.log('【步骤 2/3】创建业务子文件夹');
    console.log('─'.repeat(50));

    // 并行创建两个子文件夹
    const [reportFolder, monthFolder] = await Promise.all([
      createFolder(reportFolderName, rootFolderToken, userAccessToken, refreshToken, tokenExpiresAt),
      createFolder(monthFolderName, rootFolderToken, userAccessToken, refreshToken, tokenExpiresAt),
    ]);
    const reportFolderToken = reportFolder.folderToken;
    const monthFolderToken = monthFolder.folderToken;
    console.log(`✓ 周报归档文件夹: ${reportFolderToken}`);
    console.log(`✓ 月报汇总文件夹: ${monthFolderToken}`);

    // ============================================
    // 步骤3：授予用户管理员权限 + 保存Token
    // ============================================
    console.log('\n' + '─'.repeat(50));
    console.log('【步骤 3/3】权限设置 & 保存资源');
    console.log('─'.repeat(50));
    if (useUserIdentity) {
      console.log('✓ 使用用户身份创建，资源默认归属用户，无需额外授权');
    } else if (userOpenId) {
      try {
        // 自动检测ID类型：ou_开头的是open_id，数字开头的是user_id
        const memberType = userOpenId.startsWith('ou_') ? 'openid' : 'userid';
        await addFolderAdmin(rootFolderToken, userOpenId, memberType, 'full_access', userAccessToken);
        console.log(`✓ 已授予用户 ${userOpenId} 管理员权限`);
      } catch (permError) {
        console.warn('⚠️  授权失败，跳过权限设置（不影响资源使用）');
        console.warn(`   错误: ${permError instanceof Error ? permError.message : String(permError)}`);
      }
    } else {
      console.warn('⚠️  未提供用户ID，跳过权限设置');
    }

    // 保存资源Token（bitableBaseToken 留空，用户后续在配置页面自行创建/绑定）
    const resource: UserResource = {
      rootFolderToken,
      reportFolderToken,
      monthFolderToken,
      bitableBaseToken: '',
      userOpenId,
      userName,
      userAccessToken,
      refreshToken,
      tokenExpiresAt,
    };

    await this.store.save(resource);
    console.log('✓ 资源Token已保存');

    return resource;
  }
}

/** 全局单例 */
let initializerInstance: UserResourceInitializer | null = null;

/**
 * 获取用户资源初始化器（单例）
 */
export function getUserResourceInitializer(): UserResourceInitializer {
  if (!initializerInstance) {
    initializerInstance = new UserResourceInitializer();
  }
  return initializerInstance;
}
