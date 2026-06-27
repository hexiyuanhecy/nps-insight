/**
 * 飞书云文件夹服务模块
 * 封装云文件夹创建、权限管理等操作
 * 支持 tenant_access_token 和 user_access_token 两种身份
 */

import { getTenantAccessToken } from './client';
import { refreshAccessToken } from './user-auth';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

const DRIVE_API_BASE = 'https://open.feishu.cn/open-apis/drive/v1';

/**
 * 创建文件夹的返回结果
 */
export interface CreateFolderResult {
  /** 文件夹token */
  folderToken: string;
  /** 文件夹URL */
  url: string;
  /** 文件夹名称 */
  name: string;
}

/**
 * 获取文件夹URL
 * @param folderToken 文件夹token
 * @returns 文件夹完整URL
 */
export function getFolderUrl(folderToken: string): string {
  return `https://www.feishu.cn/drive/folder/${folderToken}`;
}

/**
 * 获取有效的 access_token
 * 如果传入了 userAccessToken，优先使用（支持自动刷新）
 * 否则使用 tenant_access_token
 */
async function getAccessToken(
  userAccessToken?: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<string> {
  if (userAccessToken) {
    // 如果有 refreshToken 且 token 即将过期，先刷新
    if (refreshToken && expiresAt) {
      const now = getCurrentTimestampSeconds();
      const remainingSeconds = expiresAt - now;
      
      if (remainingSeconds < 600) { // 剩余 < 10 分钟
        console.log('【云文件夹】用户 token 即将过期，先刷新...');
        try {
          const newToken = await refreshAccessToken(refreshToken);
          console.log('【云文件夹】用户 token 刷新成功');
          return newToken.access_token;
        } catch (refreshErr) {
          console.warn('【云文件夹】用户 token 刷新失败，使用现有 token:', refreshErr instanceof Error ? refreshErr.message : '未知错误');
          return userAccessToken;
        }
      }
    }
    return userAccessToken;
  }
  
  // 使用应用身份
  return getTenantAccessToken();
}

/**
 * 创建飞书云文件夹
 * @param name 文件夹名称
 * @param parentFolderToken 父文件夹token（可选，不传则创建在根目录）
 * @param userAccessToken 用户 access_token（可选，传入会使用用户身份创建）
 * @param refreshToken refresh_token（用于 token 刷新）
 * @param expiresAt access_token 过期时间戳
 * @returns 创建结果（folderToken, url, name）
 */
export async function createFolder(
  name: string,
  parentFolderToken?: string,
  userAccessToken?: string,
  refreshToken?: string,
  expiresAt?: number
): Promise<CreateFolderResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`【云文件夹】开始创建文件夹: ${name}`);
  console.log(`【云文件夹】身份: ${userAccessToken ? '用户身份' : '应用身份'}`);
  if (parentFolderToken) {
    console.log(`【云文件夹】父文件夹: ${parentFolderToken}`);
  } else {
    console.log(`【云文件夹】创建位置: 云盘根目录`);
  }

  try {
    const token = await getAccessToken(userAccessToken, refreshToken, expiresAt);

    const requestBody: Record<string, string> = {
      name,
      folder_token: parentFolderToken || '',
    };

    const response = await fetch(`${DRIVE_API_BASE}/files/create_folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      const errorMsg = data.msg || `HTTP ${response.status}`;
      console.error(`【云文件夹】创建失败: ${errorMsg}`);
      console.error(`【云文件夹】错误详情:`, JSON.stringify(data, null, 2));
      throw new Error(`创建文件夹失败: ${errorMsg}`);
    }

    const folderToken = data.data?.token || data.data?.file?.token || data.data?.folder_token;
    const folderUrl = getFolderUrl(folderToken);

    console.log(`【云文件夹】创建成功 ✓`);
    console.log(`【云文件夹】名称: ${name}`);
    console.log(`【云文件夹】Token: ${folderToken}`);
    console.log(`【云文件夹】链接: ${folderUrl}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      folderToken,
      url: folderUrl,
      name,
    };
  } catch (error) {
    console.error(`【云文件夹】创建异常:`, error);
    throw error;
  }
}

/**
 * 为文件夹添加管理员权限
 * 
 * @param folderToken 文件夹token
 * @param userId 用户ID
 * @param memberType 用户ID类型：openid | userid | unionid | email，默认 openid
 * @param perm 权限级别，默认 full_access
 * @param userAccessToken 用户 access_token（可选）
 * 
 * @note 需要以下应用权限：
 * - drive:folder:read（云空间文件夹读取权限）
 * - drive:folder:write（云空间文件夹写入权限）
 */
export async function addFolderAdmin(
  folderToken: string,
  userId: string,
  memberType: 'openid' | 'userid' | 'unionid' | 'email' = 'openid',
  perm: 'view' | 'edit' | 'full_access' = 'full_access',
  userAccessToken?: string
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`【文件夹权限】开始授予管理员权限`);
  console.log(`【文件夹权限】文件夹: ${folderToken}`);
  console.log(`【文件夹权限】用户: ${userId}`);
  console.log(`【文件夹权限】ID类型: ${memberType}`);
  console.log(`【文件夹权限】权限: ${perm}`);
  console.log('【文件夹权限】提示: 需要在飞书开放平台开通 drive:folder:read/write 权限');

  try {
    const token = userAccessToken || await getTenantAccessToken();

    const response = await fetch(
      `${DRIVE_API_BASE}/permissions/${folderToken}/members?type=file&need_notification=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          member_type: memberType,
          member_id: userId,
          perm,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      const errorMsg = data.msg || `HTTP ${response.status}`;
      console.error(`【文件夹权限】授权失败: ${errorMsg}`);
      console.error(`【文件夹权限】错误详情:`, JSON.stringify(data, null, 2));
      
      // 提供更详细的错误提示
      if (data.code === 1063001) {
        console.error(`【文件夹权限】排查建议:`);
        console.error(`  1. 确认应用已开通 drive:folder:read 和 drive:folder:write 权限`);
        console.error(`  2. 确认传入的 member_id 格式正确（openid 应以 ou_ 开头）`);
        console.error(`  3. 确认 folderToken 是有效的文件夹 token`);
      }
      
      throw new Error(`授予文件夹权限失败: ${errorMsg}`);
    }

    console.log(`【文件夹权限】授权成功 ✓`);
    console.log(`【文件夹权限】用户 ${userId} 已获得 ${perm} 权限`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error(`【文件夹权限】授权异常:`, error);
    throw error;
  }
}

/**
 * 列出文件夹下的文件
 * @param folderToken 文件夹token
 * @param userAccessToken 用户 access_token（可选）
 * @returns 文件列表
 */
export async function listFolderFiles(
  folderToken: string,
  userAccessToken?: string
): Promise<any[]> {
  console.log(`【云文件夹】列出文件夹内容: ${folderToken}`);

  try {
    const token = userAccessToken || await getTenantAccessToken();

    const response = await fetch(
      `${DRIVE_API_BASE}/files?folder_token=${folderToken}&page_size=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || data.code !== 0) {
      const errorMsg = data.msg || `HTTP ${response.status}`;
      console.error(`【云文件夹】列表获取失败: ${errorMsg}`);
      throw new Error(`获取文件夹列表失败: ${errorMsg}`);
    }

    const files = data.data?.files || [];
    console.log(`【云文件夹】文件数量: ${files.length}`);
    files.forEach((file: any, index: number) => {
      console.log(`  ${index + 1}. [${file.type}] ${file.name} (${file.token})`);
    });

    return files;
  } catch (error) {
    console.error(`【云文件夹】列表获取异常:`, error);
    throw error;
  }
}
