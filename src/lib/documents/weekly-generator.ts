/**
 * 周报文档生成服务
 * 提供周报数据统计、文档生成等功能
 */

import { bitableClient, extractFieldValue, extractMultiSelectFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TOP_ISSUES_FIELDS } from '@/lib/feishu/constants';
import { AdapterFactory, getDefaultDocument } from '@/lib/adapter-factory';
import { DocumentAdapter } from '@/lib/document/base-document';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import { DEFAULT_PAGE_SIZE, DEFAULT_TOP_N } from '@/constants/app-constants';

/**
 * 生成周报
 * @param weekOffset 周偏移量（0=本周，1=上周）
 */
export async function generateWeeklyReport(weekOffset: number = 0): Promise<{
  success: boolean;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  topIssues: { tag1: string; count: number }[];
  documentUrl?: string;
  error?: string;
}> {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const year = now.getFullYear();

  // 计算指定周的起始日期
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - (7 * weekOffset + now.getDay() + 6));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startDate = weekStart.toISOString();
  const endDate = weekEnd.toISOString();

  try {
    // 获取该周的所有反馈
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });

    const weekFeedbacks = records.filter((r) => {
      const createTime = extractFieldValue(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!createTime) return false;
      const time = new Date(createTime);
      return time >= weekStart && time <= weekEnd;
    });

    const totalFeedbacks = weekFeedbacks.length;

    // 计算NPS
    let promoter = 0, passive = 0, detractor = 0;
    weekFeedbacks.forEach((f) => {
      const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score >= 4) promoter++;
      else if (score === 3) passive++;
      else detractor++;
    });

    const npsScore = totalFeedbacks > 0
      ? Math.round(((promoter - detractor) / totalFeedbacks) * 100)
      : 0;

    // 统计Top问题
    const tagCounts: Record<string, number> = {};
    weekFeedbacks.forEach((f) => {
      const tag1Arr = extractMultiSelectFieldValue(f.fields[FEEDBACK_FIELDS.TAG1]);
      for (const tag1 of tag1Arr) {
        if (tag1) {
          tagCounts[tag1] = (tagCounts[tag1] || 0) + 1;
        }
      }
    });

    const topIssues = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, DEFAULT_TOP_N)
      .map(([tag1, count]) => ({ tag1, count }));

    // 生成文档
    // 从用户资源中读取周报归档文件夹token和用户token
    const userResourceStore = createUserResourceStore();
    const userResource = await userResourceStore.get();
    const reportFolderToken = userResource?.reportFolderToken;
    const userAccessToken = userResource?.userAccessToken;
    const userRefreshToken = userResource?.refreshToken;
    const tokenExpiresAt = userResource?.tokenExpiresAt;

    // 根据用户是否授权，选择文档适配器
    let document: DocumentAdapter;
    if (userAccessToken) {
      console.log('[周报] 使用用户身份创建文档');
      document = AdapterFactory.createDocument('feishu', {
        userAccessToken,
        userRefreshToken,
        tokenExpiresAt,
      });
    } else {
      console.log('[周报] 使用应用身份创建文档');
      document = getDefaultDocument();
    }

    const weekTitle = `第${currentWeek}周周报`;
    const docContent = generateWeeklyDocContent({
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks,
      npsScore,
      promoter,
      passive,
      detractor,
      topIssues,
    });

    let documentUrl: string | undefined;
    try {
      if (reportFolderToken) {
        console.log('[周报] 使用周报归档文件夹:', reportFolderToken);
      } else {
        console.warn('[周报] 未配置周报归档文件夹，将创建在默认位置');
      }
      
      const doc = await document.create(weekTitle, docContent, reportFolderToken);
      documentUrl = doc.url;
    } catch (docError) {
      console.error('[周报] 生成文档失败', docError);
    }

    return {
      success: true,
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks,
      npsScore,
      topIssues,
      documentUrl,
    };
  } catch (error) {
    return {
      success: false,
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks: 0,
      npsScore: 0,
      topIssues: [],
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 生成周报文档内容
 */
function generateWeeklyDocContent(data: {
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  totalFeedbacks: number;
  npsScore: number;
  promoter: number;
  passive: number;
  detractor: number;
  topIssues: { tag1: string; count: number }[];
}): string {
  const startDateStr = new Date(data.startDate).toLocaleDateString('zh-CN');
  const endDateStr = new Date(data.endDate).toLocaleDateString('zh-CN');

  let content = `# 第${data.weekNumber}周周报\n\n`;
  content += `**周期**: ${startDateStr} - ${endDateStr}\n\n`;

  content += `## 📊 数据概览\n\n`;
  content += `- 新增反馈: ${data.totalFeedbacks} 条\n`;
  content += `- NPS 分数: ${data.npsScore}%\n`;
  content += `- 推荐者: ${data.promoter} 人\n`;
  content += `- 被动者: ${data.passive} 人\n`;
  content += `- 贬损者: ${data.detractor} 人\n\n`;

  if (data.topIssues.length > 0) {
    content += `## 🔥 Top 问题\n\n`;
    data.topIssues.forEach((item, index) => {
      content += `${index + 1}. **${item.tag1}**: ${item.count} 条反馈\n`;
    });
    content += '\n';
  }

  content += `---\n\n`;
  content += `*由 NPS Insight 自动生成于 ${new Date().toLocaleString('zh-CN')}*\n`;

  // ========== 日志：打印周报文档内容 ==========
  console.log('\n' + '='.repeat(60));
  console.log('【周报文档 - 生成内容预览】');
  console.log('='.repeat(60));
  console.log(content);
  console.log('='.repeat(60) + '\n');
  // ========================================================

  return content;
}

/**
 * 获取ISO周数
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
