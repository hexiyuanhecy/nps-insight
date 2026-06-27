/**
 * 飞书文档适配器实现
 * 封装飞书文档 API，实现 DocumentAdapter 接口
 */

import { DocumentAdapter } from './base-document';
import { getTenantAccessToken } from '../feishu/client';
import { refreshAccessToken } from '../feishu/user-auth';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';

const DOCX_API_BASE = 'https://open.feishu.cn/open-apis/docx/v1';

/**
 * 飞书文档适配器
 */
export class FeishuDocumentAdapter implements DocumentAdapter {
  private appId: string;
  private appSecret: string;
  private userAccessToken?: string;
  private userRefreshToken?: string;
  private tokenExpiresAt?: number;

  constructor(appId?: string, appSecret?: string, userAccessToken?: string, userRefreshToken?: string, tokenExpiresAt?: number) {
    this.appId = appId || process.env.FEISHU_APP_ID || '';
    this.appSecret = appSecret || process.env.FEISHU_APP_SECRET || '';
    this.userAccessToken = userAccessToken;
    this.userRefreshToken = userRefreshToken;
    this.tokenExpiresAt = tokenExpiresAt;

    if (!this.appId || !this.appSecret) {
      throw new Error('飞书应用配置缺失');
    }
  }

  /**
   * 获取有效的 access_token
   * 如果配置了用户 token，优先使用用户身份（支持自动刷新）
   * 否则使用应用身份 tenant_access_token
   */
  private async getAccessToken(): Promise<string> {
    if (this.userAccessToken) {
      // 如果有 refreshToken 且 token 即将过期，先刷新
      if (this.userRefreshToken && this.tokenExpiresAt) {
        const now = getCurrentTimestampSeconds();
        const remainingSeconds = this.tokenExpiresAt - now;

        if (remainingSeconds < 600) {
          console.log('[飞书文档] 用户 token 即将过期，先刷新...');
          try {
            const newToken = await refreshAccessToken(this.userRefreshToken);
            console.log('[飞书文档] 用户 token 刷新成功');
            this.userAccessToken = newToken.access_token;
            if (newToken.refresh_token) {
              this.userRefreshToken = newToken.refresh_token;
            }
            if (newToken.expires_in) {
              this.tokenExpiresAt = getCurrentTimestampSeconds() + newToken.expires_in;
            }
            return newToken.access_token;
          } catch (refreshErr) {
            console.warn('[飞书文档] 用户 token 刷新失败，使用现有 token:', refreshErr instanceof Error ? refreshErr.message : '未知错误');
            return this.userAccessToken;
          }
        }
      }
      return this.userAccessToken;
    }

    // 使用应用身份
    return getTenantAccessToken();
  }

  /**
   * 获取适配器类型
   */
  getType(): string {
    return 'feishu';
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return { success: false, message: '获取飞书 Token 失败' };
      }
      return { success: true, message: '飞书文档连接成功' };
    } catch (error) {
      return { success: false, message: `连接失败: ${error instanceof Error ? error.message : '未知错误'}` };
    }
  }

  /**
   * 创建文档
   * @param title 文档标题
   * @param content 文档内容
   * @param folderToken 可选，文件夹token，指定创建位置
   */
  async create(title: string, content: string, folderToken?: string): Promise<{ documentId: string; url: string }> {
    const token = await this.getAccessToken();
    
    console.log(`[飞书文档] 创建文档: ${title}`);
    if (folderToken) {
      console.log(`[飞书文档] 创建位置: 文件夹 ${folderToken}`);
    }
    
    // 构建请求体
    const body: Record<string, any> = { title };
    if (folderToken) {
      body.folder_token = folderToken;
    }
    
    // 创建文档
    const createResponse = await fetch(`${DOCX_API_BASE}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    
    const createData = await createResponse.json();
    if (createData.code !== 0) {
      throw new Error(`创建文档失败: ${createData.msg}`);
    }
    
    const documentId = createData.data?.document?.document_id || '';
    
    // 写入内容
    if (content) {
      await this.append(documentId, content, 'bottom');
    }
    
    const url = `https://feishu.cn/docx/${documentId}`;
    console.log(`[飞书文档] 创建成功: ${url}`);
    return { documentId, url };
  }

  /**
   * 追加内容到文档
   */
  async append(
    documentId: string,
    content: string,
    position: 'top' | 'bottom' = 'top'
  ): Promise<void> {
    const token = await this.getAccessToken();
    
    // 将 Markdown 转换为飞书文档 Block
    const blocks = this.parseMarkdownToBlocks(content);
    
    const index = position === 'top' ? 0 : -1;
    
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${documentId}/children/batch_create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          children: blocks,
          index,
          document_revision_id: -1,
        }),
      }
    );
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`追加内容失败: ${data.msg}`);
    }
  }

  /**
   * 更新文档内容
   */
  async update(documentId: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    
    // 获取文档根 Block
    const blocks = this.parseMarkdownToBlocks(content);
    
    // 更新文档内容（替换所有内容）
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${documentId}/children/batch_update`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          children: blocks,
          document_revision_id: -1,
        }),
      }
    );
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`更新文档失败: ${data.msg}`);
    }
  }

  /**
   * 获取文档内容
   */
  async getContent(documentId: string): Promise<string> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${documentId}/children`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取文档内容失败: ${data.msg}`);
    }
    
    // 将飞书 Block 转换为 Markdown
    return this.parseBlocksToMarkdown(data.data?.items || []);
  }

  /**
   * 删除文档
   */
  async delete(documentId: string): Promise<void> {
    const token = await this.getAccessToken();
    
    const response = await fetch(`${DOCX_API_BASE}/documents/${documentId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`删除文档失败: ${data.msg}`);
    }
  }

  /**
   * 将 Markdown 转换为飞书文档 Block
   */
  private parseMarkdownToBlocks(markdown: string): any[] {
    const blocks: any[] = [];
    const lines = markdown.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        // 标题2
        blocks.push({
          block_type: 2,
          heading2: {
            text: [{ text: line.replace('## ', '') }],
          },
        });
      } else if (line.startsWith('# ')) {
        // 标题1
        blocks.push({
          block_type: 1,
          heading1: {
            text: [{ text: line.replace('# ', '') }],
          },
        });
      } else if (line.startsWith('- ')) {
        // 无序列表
        blocks.push({
          block_type: 4,
          bullet: {
            text: [{ text: line.replace('- ', '') }],
          },
        });
      } else if (line.trim() === '---') {
        // 分割线
        blocks.push({ block_type: 14, divider: {} });
      } else if (line.trim()) {
        // 普通文本
        blocks.push({
          block_type: 2,
          text: {
            text: [{ text: line }],
          },
        });
      }
    }
    
    return blocks;
  }

  /**
   * 将飞书 Block 转换为 Markdown
   */
  private parseBlocksToMarkdown(blocks: any[]): string {
    const lines: string[] = [];
    
    for (const block of blocks) {
      if (block.block_type === 1) {
        // 标题1
        lines.push(`# ${block.heading1?.text?.[0]?.text || ''}`);
      } else if (block.block_type === 2) {
        // 标题2 或普通文本
        if (block.heading2) {
          lines.push(`## ${block.heading2?.text?.[0]?.text || ''}`);
        } else if (block.text) {
          lines.push(block.text?.text?.[0]?.text || '');
        }
      } else if (block.block_type === 4) {
        // 无序列表
        lines.push(`- ${block.bullet?.text?.[0]?.text || ''}`);
      } else if (block.block_type === 14) {
        // 分割线
        lines.push('---');
      }
    }
    
    return lines.join('\n');
  }
}