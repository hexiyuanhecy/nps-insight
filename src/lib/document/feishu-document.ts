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
      // 如果有 refreshToken 且 token 即将过期或已过期，先刷新
      if (this.userRefreshToken && this.tokenExpiresAt) {
        const now = getCurrentTimestampSeconds();
        const remainingSeconds = this.tokenExpiresAt - now;

        if (remainingSeconds < 600) {
          console.log('[飞书文档] 用户 token 即将过期或已过期，先刷新...');
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
            console.error('[飞书文档] 用户 token 刷新失败:', refreshErr instanceof Error ? refreshErr.message : '未知错误');
            // 刷新失败时，不返回过期 token，而是抛出异常让调用方知道需要重新授权
            throw new Error('USER_TOKEN_EXPIRED_AND_REFRESH_FAILED');
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
      // 需要先获取文档的 root block ID
      const rootBlockId = await this.getDocumentRootBlockId(documentId, token);
      await this.appendBlocks(documentId, rootBlockId, content, 'bottom', token);
    }
    
    const url = `https://feishu.cn/docx/${documentId}`;
    return { documentId, url };
  }

  /**
   * 获取文档的 root block ID
   */
  private async getDocumentRootBlockId(documentId: string, token: string): Promise<string> {
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取文档块失败: ${data.msg}`);
    }
    
    // 返回根 block ID - 飞书文档的根block_id就是document_id
    return documentId;
  }

  /**
   * 追加内容到文档（内部方法）
   */
  private async appendBlocks(
    documentId: string,
    blockId: string,
    content: string,
    position: 'top' | 'bottom' = 'top',
    token?: string
  ): Promise<void> {
    const accessToken = token || await this.getAccessToken();
    
    // 将 Markdown 转换为飞书文档 Block
    const blocks = this.parseMarkdownToBlocks(content);
    
    const index = position === 'top' ? 0 : -1;
    
    // 注意：飞书文档 API 端点是 /blocks/{block_id}/children
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${blockId}/children`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
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
   * 追加内容到文档
   */
  async append(
    documentId: string,
    content: string,
    position: 'top' | 'bottom' = 'top'
  ): Promise<void> {
    const token = await this.getAccessToken();
    const rootBlockId = await this.getDocumentRootBlockId(documentId, token);
    await this.appendBlocks(documentId, rootBlockId, content, position, token);
  }

  /**
   * 更新文档内容
   */
  async update(documentId: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    
    // 获取文档根 Block ID
    const rootBlockId = await this.getDocumentRootBlockId(documentId, token);
    
    // 获取文档根 Block
    const blocks = this.parseMarkdownToBlocks(content);
    
    // 更新文档内容（替换所有内容）
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${rootBlockId}/children/batch_update`,
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
    
    // 获取文档根 Block ID
    const rootBlockId = await this.getDocumentRootBlockId(documentId, token);
    
    const response = await fetch(
      `${DOCX_API_BASE}/documents/${documentId}/blocks/${rootBlockId}/children`,
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
   * 飞书文档 API v1 Block 格式规范：
   * - block_type 2: text 普通文本
   * - block_type 3: heading1 一级标题
   * - block_type 4: heading2 二级标题
   * - block_type 5: heading3 三级标题
   * - block_type 12: bullet 无序列表
   * - block_type 22: divider 分割线
   */
  private parseMarkdownToBlocks(markdown: string): any[] {
    const blocks: any[] = [];
    const lines = markdown.split('\n');

    // 构建文本元素的辅助函数
    const buildTextElements = (content: string) => [
      {
        text_run: {
          content,
        },
      },
    ];

    for (const line of lines) {
      if (line.startsWith('### ')) {
        // 三级标题
        blocks.push({
          block_type: 5,
          heading3: {
            elements: buildTextElements(line.replace('### ', '')),
            style: {},
          },
        });
      } else if (line.startsWith('## ')) {
        // 二级标题
        blocks.push({
          block_type: 4,
          heading2: {
            elements: buildTextElements(line.replace('## ', '')),
            style: {},
          },
        });
      } else if (line.startsWith('# ')) {
        // 一级标题
        blocks.push({
          block_type: 3,
          heading1: {
            elements: buildTextElements(line.replace('# ', '')),
            style: {},
          },
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // 无序列表
        const content = line.startsWith('- ')
          ? line.replace('- ', '')
          : line.replace('* ', '');
        blocks.push({
          block_type: 12,
          bullet: {
            elements: buildTextElements(content),
            style: {},
          },
        });
      } else if (line.trim() === '---') {
        // 分割线
        blocks.push({ block_type: 22, divider: {} });
      } else if (line.trim()) {
        // 普通文本
        blocks.push({
          block_type: 2,
          text: {
            elements: buildTextElements(line),
            style: {},
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

    // 从 elements 中提取文本内容的辅助函数
    const extractText = (elements: any[]): string => {
      if (!elements || elements.length === 0) return '';
      return elements
        .map((el) => el.text_run?.content || '')
        .join('');
    };

    for (const block of blocks) {
      if (block.block_type === 3 && block.heading1) {
        // 一级标题
        lines.push(`# ${extractText(block.heading1.elements)}`);
      } else if (block.block_type === 4 && block.heading2) {
        // 二级标题
        lines.push(`## ${extractText(block.heading2.elements)}`);
      } else if (block.block_type === 5 && block.heading3) {
        // 三级标题
        lines.push(`### ${extractText(block.heading3.elements)}`);
      } else if (block.block_type === 12 && block.bullet) {
        // 无序列表
        lines.push(`- ${extractText(block.bullet.elements)}`);
      } else if (block.block_type === 22 && block.divider) {
        // 分割线
        lines.push('---');
      } else if (block.block_type === 2 && block.text) {
        // 普通文本
        lines.push(extractText(block.text.elements));
      }
    }

    return lines.join('\n');
  }
}