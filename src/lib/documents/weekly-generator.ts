/**
 * 周报文档生成服务
 * 提供周报数据统计、文档生成等功能
 */

import { bitableClient, extractFieldValue, extractMultiSelectFieldValue, parseBitableDate } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TOP_ISSUES_FIELDS } from '@/lib/feishu/constants';
import { AdapterFactory, getDefaultDocument } from '@/lib/adapter-factory';
import { DocumentAdapter } from '@/lib/document/base-document';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import { DEFAULT_PAGE_SIZE, DEFAULT_TOP_N, getCurrentTimestampSeconds } from '@/constants/app-constants';
import { refreshAccessToken } from '@/lib/feishu/user-auth';

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
  topIssues: { tag3: string; tag2: string; count: number; ratio: number }[];
  documentUrl?: string;
  error?: string;
}> {
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const year = now.getFullYear();

  // 计算指定周的起始日期（ISO 周，周一为一周起始）
  // 修复：原逻辑 now.getDay() + 6 会多减 6 天，导致查询上周而非本周
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 周日(0)转为7，符合ISO周
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - (7 * weekOffset + dayOfWeek - 1));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startDate = weekStart.toISOString();
  const endDate = weekEnd.toISOString();

  try {
    // 获取该周的所有反馈
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });

    console.log(`[周报] 总记录数: ${records.length}, 周时间范围: ${weekStart.toISOString()} ~ ${weekEnd.toISOString()}`);

    const weekFeedbacks = records.filter((r) => {
      // 修复：原使用 extractFieldValue 把 number 时间戳转成字符串，
      // 导致 new Date("1782816000000") 解析为 Invalid Date，所有记录被过滤掉。
      // 改用 parseBitableDate 与 sync-task.ts 保持一致，正确处理 number 时间戳。
      const time = parseBitableDate(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!time) return false;
      return time >= weekStart && time <= weekEnd;
    });

    console.log(`[周报] 过滤后本周反馈数: ${weekFeedbacks.length}`);

    const totalFeedbacks = weekFeedbacks.length;

    // 计算NPS
    let promoter = 0, passive = 0, detractor = 0;
    // 评分分布（PRD-BOT-003）：1分 / 2-3分 / 4-5分 三档
    let score1Count = 0, score23Count = 0, score45Count = 0;
    // 待审核数、需查日志数（PRD-BOT-001/BOT-004）
    let reviewNeededCount = 0, needLogCheckCount = 0;

    weekFeedbacks.forEach((f) => {
      const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score >= 4) promoter++;
      else if (score === 3) passive++;
      else detractor++;

      // 评分分布三档（PRD-BOT-003）：适配整数和浮点数评分
      // 1 分档：1.0-1.9，2-3 分档：2.0-3.9，4-5 分档：4.0-5.0
      if (score > 0 && score < 2) score1Count++;
      else if (score >= 2 && score < 4) score23Count++;
      else if (score >= 4) score45Count++;

      // 待审核字段可能是布尔值 true/false 或字符串 '是'/'否'（与 sync-task.ts 保持一致）
      const reviewNeededVal = f.fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
      const reviewNeeded = reviewNeededVal === true || reviewNeededVal === '是' || String(reviewNeededVal).toLowerCase() === 'true';
      if (reviewNeeded) reviewNeededCount++;

      // 需查日志字段同上
      const needLogVal = f.fields[FEEDBACK_FIELDS.NEED_LOG_CHECK];
      const needLog = needLogVal === true || needLogVal === '是' || String(needLogVal).toLowerCase() === 'true';
      if (needLog) needLogCheckCount++;
    });

    const npsScore = totalFeedbacks > 0
      ? Math.round(((promoter - detractor) / totalFeedbacks) * 100)
      : 0;

    // 评分分布百分比（合计 100%）
    const score1Pct = totalFeedbacks > 0 ? Math.round((score1Count / totalFeedbacks) * 100) : 0;
    const score23Pct = totalFeedbacks > 0 ? Math.round((score23Count / totalFeedbacks) * 100) : 0;
    const score45Pct = totalFeedbacks > 0 ? 100 - score1Pct - score23Pct : 0;

    // 统计Top问题（按 Tag3 聚合，与周报卡片维度一致 PRD-BOT-002）
    const tag3Counts: Record<string, number> = {};
    // 记录每个 Tag3 关联的 Tag2 分布，用于找所属模块
    const tag3ToTag2: Record<string, Record<string, number>> = {};
    weekFeedbacks.forEach((f) => {
      const tag3Arr = extractMultiSelectFieldValue(f.fields[FEEDBACK_FIELDS.TAG3]);
      const tag2Arr = extractMultiSelectFieldValue(f.fields[FEEDBACK_FIELDS.TAG2]);
      for (const tag3 of tag3Arr) {
        if (tag3) {
          tag3Counts[tag3] = (tag3Counts[tag3] || 0) + 1;
          if (!tag3ToTag2[tag3]) tag3ToTag2[tag3] = {};
          for (const tag2 of tag2Arr) {
            if (tag2) {
              tag3ToTag2[tag3][tag2] = (tag3ToTag2[tag3][tag2] || 0) + 1;
            }
          }
        }
      }
    });

    const topIssues = Object.entries(tag3Counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, DEFAULT_TOP_N)
      .map(([tag3, count]) => {
        // 取该 Tag3 关联频率最高的 Tag2 作为所属模块
        const tag2Map = tag3ToTag2[tag3] || {};
        const tag2 = Object.entries(tag2Map).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
        const ratio = totalFeedbacks > 0 ? Math.round((count / totalFeedbacks) * 100) : 0;
        return { tag3, tag2, count, ratio };
      });

    // 生成文档
    // 从用户资源中读取周报归档文件夹token和用户token
    const userResourceStore = createUserResourceStore();
    const userResource = await userResourceStore.get();
    const reportFolderToken = userResource?.reportFolderToken;
    
    // 获取有效的用户 access_token（检查过期）
    let userAccessToken: string | null;
    let userRefreshToken = userResource?.refreshToken;
    let tokenExpiresAt = userResource?.tokenExpiresAt;
    
    // 尝试调用 getValidAccessToken（如果存在）
    if (userResourceStore.getValidAccessToken) {
      userAccessToken = await userResourceStore.getValidAccessToken();
    } else {
      // 回退到直接使用 userAccessToken（不检查过期）
      userAccessToken = userResource?.userAccessToken || null;
    }
    
    // 如果 token 无效（过期或即将过期），尝试刷新
    if (!userAccessToken && userRefreshToken) {
      console.log('[周报] 用户Token无效，尝试刷新...');
      try {
        const newToken = await refreshAccessToken(userRefreshToken);
        if (newToken) {
          userAccessToken = newToken.access_token;
          tokenExpiresAt = getCurrentTimestampSeconds() + newToken.expires_in;
          console.log('[周报] Token刷新成功');
          
          // 保存新token到存储，供下次使用
          try {
            if (userResourceStore.save) {
              await userResourceStore.save({
                ...(userResource || {} as any),
                userAccessToken: newToken.access_token,
                refreshToken: newToken.refresh_token || userRefreshToken,
                tokenExpiresAt: getCurrentTimestampSeconds() + newToken.expires_in,
              });
              console.log('[周报] 新Token已保存到存储');
            }
          } catch (saveErr) {
            console.warn('[周报] 保存Token失败:', saveErr instanceof Error ? saveErr.message : '未知错误');
          }
        }
      } catch (refreshErr) {
        console.error('[周报] Token刷新失败:', refreshErr);
      }
    }
    
    // 根据用户是否授权，选择文档适配器
    let document: DocumentAdapter;
    
    if (userAccessToken) {
      try {
        document = AdapterFactory.createDocument('feishu', {
          userAccessToken,
          userRefreshToken,
          tokenExpiresAt,
        });
      } catch (createErr) {
        console.warn('[周报] 用户身份创建文档失败，使用应用身份:', createErr instanceof Error ? createErr.message : '未知错误');
        document = getDefaultDocument();
      }
    } else {
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
      reviewNeededCount,
      needLogCheckCount,
      score1Count, score23Count, score45Count,
      score1Pct, score23Pct, score45Pct,
    });

    let documentUrl: string | undefined;
    let docError: string | undefined;
    
    try {
      const doc = await document.create(weekTitle, docContent, reportFolderToken);
      documentUrl = doc.url;
    } catch (err) {
      docError = err instanceof Error ? err.message : '未知错误';
      console.error('[周报] 生成文档失败:', docError);
    }

    return {
      success: !docError,
      weekNumber: currentWeek,
      year,
      startDate,
      endDate,
      totalFeedbacks,
      npsScore,
      topIssues,
      documentUrl,
      error: docError,
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
 * 字段对齐 PRD-BOT-001~005 周报消息卡片规范
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
  topIssues: { tag3: string; tag2: string; count: number; ratio: number }[];
  reviewNeededCount: number;
  needLogCheckCount: number;
  score1Count: number; score23Count: number; score45Count: number;
  score1Pct: number; score23Pct: number; score45Pct: number;
}): string {
  const startDateStr = new Date(data.startDate).toLocaleDateString('zh-CN');
  const endDateStr = new Date(data.endDate).toLocaleDateString('zh-CN');

  let content = `# 第${data.weekNumber}周周报\n\n`;
  content += `**周期**: ${startDateStr} - ${endDateStr}\n\n`;

  // ========== 数据概览（对齐 PRD-BOT-001）==========
  content += `## 📊 数据概览\n\n`;
  content += `- 本周拉取：${data.totalFeedbacks} 条负反馈\n`;
  content += `- AI 已完成打标，待审核：${data.reviewNeededCount} 条\n`;
  content += `- 需查日志：${data.needLogCheckCount} 条\n`;
  content += `- NPS 分数：${data.npsScore}%\n`;
  content += `- 推荐者：${data.promoter} 人\n`;
  content += `- 被动者：${data.passive} 人\n`;
  content += `- 贬损者：${data.detractor} 人\n\n`;

  // ========== 评分分布（对齐 PRD-BOT-003）==========
  content += `## 📈 评分分布\n\n`;
  content += `- 1 分：${data.score1Count} 条 (${data.score1Pct}%)\n`;
  content += `- 2-3 分：${data.score23Count} 条 (${data.score23Pct}%)\n`;
  content += `- 4-5 分：${data.score45Count} 条 (${data.score45Pct}%)\n\n`;

  // ========== 待审核警告（对齐 PRD-BOT-005，>100 条时显示）==========
  if (data.reviewNeededCount > 100) {
    content += `## ⚠️ 待审核警告\n\n`;
    content += `> 本周待审核量超过 100 条（当前 ${data.reviewNeededCount} 条），请及时处理！\n\n`;
  }

  // ========== Top 问题（对齐 PRD-BOT-002）==========
  if (data.topIssues.length > 0) {
    content += `## 🔥 Top 问题\n\n`;
    data.topIssues.forEach((item, index) => {
      content += `${index + 1}. **${item.tag3}** (${item.tag2}) - ${item.count} 次 (${item.ratio}%)\n`;
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
