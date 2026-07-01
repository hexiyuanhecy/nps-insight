/**
 * 周同步任务核心逻辑
 * 供内部直接调用，避免 HTTP fetch 死锁问题
 * 
 * 使用方式:
 * import { runSyncTask } from '@/app/api/cron/sync/sync-task';
 */

import { AdapterFactory } from '@/lib/data-sources/adapter-factory';
import { bitableClient, initializeBitableConfig, parseBitableDate } from '@/lib/feishu/bitable';
import { extractMultiSelectFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TENANT_FIELDS } from '@/lib/feishu/constants';
import { feishuBot, createWeeklyReportCard, sendErrorNotify } from '@/lib/feishu/bot';
import { tagger } from '@/lib/ai/tagger';
import { SyncResult } from '@/lib/types';
import { listAllConfigKeys, getConfig } from '@/lib/storage/kv-storage';
import { generateWeeklyReport } from '@/lib/documents/weekly-generator';
import {
  DEFAULT_PAGE_SIZE,
  LARGE_PAGE_SIZE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_TOP_N,
  MILLISECONDS_PER_DAY,
  TIMEOUT_SHORT_MS,
  TIMEOUT_MEDIUM_MS,
  TIMEOUT_LONG_MS,
  END_OF_DAY,
  MOCK_FEEDBACK_ID_PREFIX,
  MOCK_IRRELEVANT_FEEDBACK_TEXT,
  DEFAULT_MOCK_COUNT,
  MOCK_BATCH_SIZE,
  MOCK_MAX_FEEDBACK_SEQ,
  MOCK_MAX_TENANT_SEQ,
  MOCK_MAX_USER_SEQ,
  MOCK_MAX_MONTH,
  MOCK_MAX_DAY,
} from '@/constants/app-constants';

const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${name}] 操作超时 (${ms}ms)`)), ms)
    ),
  ]);
};

/**
 * 执行完整的同步任务（多用户版本）
 * 遍历所有用户配置，为每个用户执行同步
 */
export async function runSyncTask(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  // 多用户支持：尝试从 KV 获取所有配置（带超时保护）
  try {
    const kvPromise = listAllConfigKeys();
    const timeoutPromise = new Promise<string[]>((resolve) => {
      setTimeout(() => resolve([]), TIMEOUT_SHORT_MS);
    });
    const configKeys = await Promise.race([kvPromise, timeoutPromise]);

    if (configKeys.length > 0) {
      console.log(`[Cron] 发现 ${configKeys.length} 个用户配置，开始多用户同步`);

      // 遍历每个用户的配置执行同步（只做数据同步+打标，不发通知）
      for (const key of configKeys) {
        const ownerId = key.replace('config:', '');
        console.log(`[Cron] 正在同步用户: ${ownerId}`);

        try {
          const userConfig = await getConfig(ownerId);
          if (userConfig) {
            const result = await runSyncTaskForUser(ownerId);
            syncedCount += result.syncedCount;
            failedCount += result.failedCount;
            details.push(`[${ownerId}] 同步了 ${result.syncedCount} 条反馈`);
          }
        } catch (userErr) {
          console.error(`[Cron] 用户 ${ownerId} 同步失败:`, userErr);
          details.push(`[${ownerId}] 同步失败: ${userErr instanceof Error ? userErr.message : '未知错误'}`);
        }
      }

      // 所有用户同步完成后，统一发送一次通知
      console.log(`[Cron] 所有用户同步完成，统一发送通知，本次新增 ${syncedCount} 条`);
      const notificationResult = await sendNotification(syncedCount);
      if (notificationResult) {
        details.push('发送通知成功');
        // 生成周报文档
        try {
          const docResult = await generateWeeklyDoc();
          if (docResult) {
            details.push('生成周报文档成功');
          }
        } catch (docErr) {
          console.error('[Cron] 周报文档生成失败', docErr);
        }
      }

      return {
        success: true,
        syncedCount,
        failedCount,
        details,
        executedAt: new Date().toISOString(),
      };
    }
  } catch (kvErr) {
    console.warn('[Cron] KV 查询失败，回退到环境变量模式:', kvErr);
  }

  // 回退到单用户模式（使用环境变量）
  return runSyncTaskSingleUser();
}

/**
 * 单用户同步（使用环境变量，向后兼容）
 */
async function runSyncTaskSingleUser(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // 初始化飞书配置（从 KV 加载）
    await initializeBitableConfig();

    // DEV_MODE: 开发阶段使用 Mock 数据
    if (process.env.CRON_DEV_MODE === 'true') {
      console.log('[Cron DEV] 开发模式：使用 Mock 数据');
      const mockResult = await runSyncWithMockData();
      console.log(`[Cron DEV] Mock 结果: synced=${mockResult.syncedCount}, failed=${mockResult.failedCount}`);
      syncedCount = mockResult.syncedCount;
      failedCount = mockResult.failedCount;
      details.push(...mockResult.details);
    } else {
      // 非 DEV_MODE 下增加超时保护（60s）
      // 步骤1：拉取外部数据（多数据源适配器）
      const externalDataResult = await withTimeout(syncExternalData(), TIMEOUT_LONG_MS, 'syncExternalData');
      if (externalDataResult > 0) {
        details.push(`从外部数据源同步了 ${externalDataResult} 条反馈`);
        syncedCount += externalDataResult;
      }

      // 步骤2：对未打标的反馈进行AI批量打标
      const tagResult = await withTimeout(autoTagFeedbacks(DEFAULT_BATCH_SIZE), TIMEOUT_LONG_MS, 'autoTagFeedbacks');
      if (tagResult > 0) {
        details.push(`AI自动打标 ${tagResult} 条反馈`);
        syncedCount += tagResult;
      }

      // 步骤3：生成周期报告
      const reportResult = await withTimeout(generateDailyReport(), TIMEOUT_MEDIUM_MS, 'generateDailyReport');
      if (reportResult) {
        details.push('生成每日报告成功');
      }
    }

    // 步骤4：发送通知（只发一次，所有打标完成后）
    console.log(`[Cron] 所有打标完成，开始发送通知，本次新增 ${syncedCount} 条`);
    const notificationResult = await sendNotification(syncedCount);
    if (notificationResult) {
      details.push('发送通知成功');
    }

    // 步骤5：生成周报文档
    if (notificationResult) {
      try {
        const docResult = await generateWeeklyDoc();
        if (docResult) {
          details.push('生成周报文档成功');
        } else {
          details.push('生成周报文档失败');
        }
      } catch (docErr) {
        console.error('[Cron] 周报文档生成异常', docErr);
        details.push(`生成周报文档失败: ${docErr instanceof Error ? docErr.message : '未知错误'}`);
      }
    }

    // 更新最后同步时间
    try { await updateLastSyncTime(); } catch { /* skip */ }

    console.log('[Cron] 同步任务完成');

    return {
      success: true,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    details.push(`同步失败: ${errorMessage}`);

    // 发送错误通知到飞书群
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    if (chatId) {
      await sendErrorNotify(chatId, '周打标', errorMessage);
    }

    return {
      success: false,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  }
}

/**
 * 为单个用户执行同步任务
 */
async function runSyncTaskForUser(ownerId: string): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    await initializeBitableConfig(ownerId, true);

    if (process.env.CRON_DEV_MODE === 'true') {
      const mockResult = await runSyncWithMockData();
      return { ...mockResult, details };
    }

    const externalDataResult = await syncExternalData();
    if (externalDataResult > 0) {
      syncedCount += externalDataResult;
    }

    const tagResult = await autoTagFeedbacks(DEFAULT_BATCH_SIZE, ownerId);
    if (tagResult > 0) {
      syncedCount += tagResult;
    }

    await generateDailyReport();

    return {
      success: true,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      syncedCount,
      failedCount,
      details: [error instanceof Error ? error.message : '未知错误'],
      executedAt: new Date().toISOString(),
    };
  }
}

// ========== 各步骤实现 ==========

async function syncExternalData(): Promise<number> {
  const dataSourceConfig = process.env.DATA_SOURCE_CONFIG;
  if (!dataSourceConfig) {
    console.log('[Cron] 未配置数据源，跳过外部同步');
    return 0;
  }

  try {
    const config = JSON.parse(dataSourceConfig);
    const adapter = AdapterFactory.create(config);
    console.log(`[Cron] 使用数据源: ${adapter.getType()}`);

    const now = new Date();
    const lastWeekStart = new Date(now.getTime() - 7 * MILLISECONDS_PER_DAY);
    lastWeekStart.setHours(0, 0, 0, 0);
    const lastWeekEnd = new Date(now.getTime() - 1);
    lastWeekEnd.setHours(END_OF_DAY.hours, END_OF_DAY.minutes, END_OF_DAY.seconds, END_OF_DAY.milliseconds);

    const feedbacks = await adapter.fetchData(lastWeekStart.toISOString(), lastWeekEnd.toISOString());

    if (feedbacks.length === 0) {
      console.log('[Cron] 本周暂无新增反馈');
      return 0;
    }

    const syncNow = new Date();
    const thisWeekStart = new Date(syncNow);
    thisWeekStart.setDate(syncNow.getDate() - syncNow.getDay() + 1);
    thisWeekStart.setHours(0, 0, 0, 0);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 7);
    thisWeekEnd.setHours(23, 59, 59, 999);

    const existingFeedbackIds = await getExistingFeedbackIds(thisWeekStart, thisWeekEnd);
    const filteredFeedbacks = feedbacks.filter(f => !existingFeedbackIds.has(f.feedbackId));

    if (filteredFeedbacks.length === 0) {
      console.log('[Cron] 本周无新增反馈（全部去重）');
      return 0;
    }
    console.log(`[Cron] 去重后新增 ${filteredFeedbacks.length} 条反馈`);

    const tenantNameMap = await enrichTenantInfo(filteredFeedbacks);

    const records = filteredFeedbacks.map((f) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: f.feedbackId,
        [FEEDBACK_FIELDS.CONTENT]: f.content,
        [FEEDBACK_FIELDS.NPS_SCORE]: f.score,
        [FEEDBACK_FIELDS.CREATE_TIME]: f.createTime,
        [FEEDBACK_FIELDS.UNSATISFACTION_REASON]: f.module || '',
        [FEEDBACK_FIELDS.SOURCE]: f.source || '',
        [FEEDBACK_FIELDS.TENANT_ID]: f.tenantId || '',
        [FEEDBACK_FIELDS.TENANT_SCALE]: f.tenantScale || '',
        [FEEDBACK_FIELDS.USER_ID]: f.larkUserId || '',
        [FEEDBACK_FIELDS.STATUS]: '未打标',
      },
    }));

    await bitableClient.batchCreateRecords(TABLE_NAMES.FEEDBACK, records);
    console.log(`[Cron] 外部数据同步完成，共写入 ${filteredFeedbacks.length} 条`);
    return filteredFeedbacks.length;
  } catch (error) {
    console.error('[Cron] 外部数据同步失败', error);
    return 0;
  }
}

async function autoTagFeedbacks(batchSize: number = DEFAULT_BATCH_SIZE, ownerId?: string): Promise<number> {
  try {
    const confidenceThreshold = await getConfidenceThreshold(ownerId);
    const allRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    const untaggedRecords = allRecords.filter((r) => {
      const status = String(r.fields[FEEDBACK_FIELDS.STATUS] || '');
      return status !== '已打标';
    });

    if (untaggedRecords.length === 0) {
      console.log('[Cron] 没有需要打标的反馈');
      return 0;
    }

    console.log(`[Cron] 发现 ${untaggedRecords.length} 条未打标反馈，开始批量AI打标`);
    const existingTags = await tagger.getCachedTags();
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < untaggedRecords.length; i += batchSize) {
      const batch = untaggedRecords.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(untaggedRecords.length / batchSize);
      console.log(`[Cron] 打标批次 ${batchNum}/${totalBatches}`);

      const t0 = Date.now();
      const feedbacks = batch.map((record) => ({
        record_id: record.record_id,
        content: String(record.fields[FEEDBACK_FIELDS.CONTENT] || ''),
        score: Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0),
        source: String(record.fields[FEEDBACK_FIELDS.SOURCE] || ''),
        unsatReason: String(record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || ''),
      }));

      const results = await tagger.batchAnalyzeFeedbacks(feedbacks, existingTags, confidenceThreshold);
      const elapsed = Date.now() - t0;
      const batchSuccess = results.filter(r => r.success).length;
      console.log(`[Cron] 批次 ${batchNum} AI分析完成 (${elapsed}ms, 成功 ${batchSuccess}/${results.length})`);

      // 收集标签
      const allTag1Names = new Set<string>();
      const allTag2Names = new Set<string>();
      const allTag3Names = new Set<string>();

      for (const result of results) {
        if (!result.success || !result.result) continue;
        result.result.tag1.forEach(t => t && allTag1Names.add(t));
        result.result.tag2.forEach(t => t && allTag2Names.add(t));
        result.result.tag3.forEach(t => t && allTag3Names.add(t));
      }

      // 确保多选字段选项存在
      try {
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG1, Array.from(allTag1Names));
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG2, Array.from(allTag2Names));
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG3, Array.from(allTag3Names));
      } catch (optErr) {
        console.error(`[Cron] 添加多选选项失败:`, optErr);
      }

      // 确保标签表记录存在
      for (const name of Array.from(allTag1Names)) {
        try { await tagger.ensureTagExists(name, 'tag1'); } catch (e) { /* skip */ }
      }
      for (const name of Array.from(allTag2Names)) {
        try { await tagger.ensureTagExists(name, 'tag2'); } catch (e) { /* skip */ }
      }
      for (const name of Array.from(allTag3Names)) {
        try { await tagger.ensureTagExists(name, 'tag3'); } catch (e) { /* skip */ }
      }

      // 写入标签
      const updates = results
        .filter(r => r.success && r.result)
        .map(r => ({
          record_id: r.recordId,
          fields: {
            [FEEDBACK_FIELDS.TAG1]: r.result!.tag1 || [],
            [FEEDBACK_FIELDS.TAG2]: r.result!.tag2 || [],
            [FEEDBACK_FIELDS.TAG3]: r.result!.tag3 || [],
            [FEEDBACK_FIELDS.CONFIDENCE]: r.result!.confidence,
            [FEEDBACK_FIELDS.NEED_LOG_CHECK]: r.result!.needLogCheck,
            [FEEDBACK_FIELDS.REVIEW_NEEDED]: r.result!.reviewNeeded,
            [FEEDBACK_FIELDS.TRANSLATED_CONTENT]: r.result!.translatedContent || '',
            [FEEDBACK_FIELDS.STATUS]: '已打标',
          },
        }));

      if (updates.length > 0) {
        try {
          await bitableClient.batchUpdateRecords(TABLE_NAMES.FEEDBACK, updates);
          successCount += updates.length;
        } catch (updateErr) {
          console.error(`[Cron] 批量更新失败:`, updateErr);
          for (const update of updates) {
            try {
              await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, update.record_id, update.fields);
              successCount++;
            } catch { failCount++; }
          }
        }
      }
      failCount += results.filter(r => !r.success).length;
    }

    console.log(`[Cron] AI打标完成，总计成功 ${successCount}/${untaggedRecords.length}`);
    return successCount;
  } catch (error) {
    console.error('[Cron] 自动打标失败', error);
    return 0;
  }
}

async function generateDailyReport(): Promise<boolean> {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    const yesterdayFeedbacks = records.filter((r) => {
      const createTime = parseBitableDate(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      return createTime && createTime >= yesterday && createTime < today;
    });

    if (yesterdayFeedbacks.length === 0) {
      console.log('[Cron] 昨日无新反馈，跳过报告生成');
      return true;
    }

    const total = yesterdayFeedbacks.length;
    const avgScore = total > 0
      ? yesterdayFeedbacks.reduce((sum, f) => sum + Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0), 0) / total
      : 0;

    console.log(`[Cron] 昨日反馈统计: 总计${total}, 均分=${avgScore.toFixed(2)}`);
    return true;
  } catch (error) {
    console.error('[Cron] 生成每日报告失败', error);
    return false;
  }
}

async function sendNotification(syncedCount: number): Promise<boolean> {
  const chatId = process.env.NOTIFICATION_CHAT_ID;
  if (!chatId) {
    console.log('[Cron] 未配置通知群ID，跳过通知');
    return false;
  }

  try {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const allTags = await tagger.getCachedTags();
    const tag3RecordIdToName = new Map<string, string>();
    for (const tag of allTags) {
      if (tag.table === 'tag3' && tag.recordId && tag.tag3Name) {
        tag3RecordIdToName.set(tag.recordId, tag.tag3Name);
      }
    }

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });

    // 构建 Tag2 recordId -> name 映射
    const tag2RecordIdToName = new Map<string, string>();
    for (const tag of allTags) {
      if (tag.table === 'tag2' && tag.recordId && tag.tag2Name) {
        tag2RecordIdToName.set(tag.recordId, tag.tag2Name);
      }
    }

    let reviewCount = 0;
    let needLogCheckCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    const tag3Counts = new Map<string, number>();
    const tag2Counts = new Map<string, number>();
    const scoreCounts = new Map<number, number>();

    for (const r of records) {
      const fields = r.fields || {};
      const createTime = parseBitableDate(fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!createTime || createTime < weekStart || createTime >= weekEnd) continue;

      // 待审核字段可能是布尔值 true/false 或字符串 '是'/'否'
      const reviewNeededVal = fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
      const reviewNeeded = reviewNeededVal === true || reviewNeededVal === '是' || String(reviewNeededVal).toLowerCase() === 'true';
      // 需查日志字段同上
      const needLogVal = fields[FEEDBACK_FIELDS.NEED_LOG_CHECK];
      const needLog = needLogVal === true || needLogVal === '是' || String(needLogVal).toLowerCase() === 'true';
      if (reviewNeeded) reviewCount++;
      if (needLog) needLogCheckCount++;

      // 提取 Tag2（二级标签）
      const tag2RecordIds = extractMultiSelectFieldValue(fields[FEEDBACK_FIELDS.TAG2]);
      let tag2Name = '';
      for (const recordId of tag2RecordIds) {
        if (!recordId) continue;
        const name = tag2RecordIdToName.get(recordId) || recordId;
        if (!tag2Name) tag2Name = name;
        tag2Counts.set(name, (tag2Counts.get(name) || 0) + 1);
      }

      // 提取 Tag3（三级标签）
      const tag3RecordIds = extractMultiSelectFieldValue(fields[FEEDBACK_FIELDS.TAG3]);
      for (const recordId of tag3RecordIds) {
        if (!recordId) continue;
        const tag3Name = tag3RecordIdToName.get(recordId) || recordId;
        tag3Counts.set(tag3Name, (tag3Counts.get(tag3Name) || 0) + 1);
      }

      const score = Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score > 0) {
        scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
        scoreSum += score;
        scoreCount++;
      }
    }

    const sortedTag3 = Array.from(tag3Counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, DEFAULT_TOP_N);
    const topIssues = sortedTag3.map(([tag3Name, count]) => {
      // 查找这个 Tag3 对应的 Tag2（取出现次数最多的 Tag2）
      let tag2Name = '';
      let maxTag2Count = 0;
      for (const [t2name, t2count] of Array.from(tag2Counts.entries())) {
        if (t2count > maxTag2Count) {
          maxTag2Count = t2count;
          tag2Name = t2name;
        }
      }
      return {
        tag1: '',
        tag2: tag2Name,
        tag3: tag3Name,
        count,
        pct: scoreCount > 0 ? Math.round((count / scoreCount) * 100) : 0
      };
    });

    const s1 = scoreCounts.get(1) || 0;
    const s23 = (scoreCounts.get(2) || 0) + (scoreCounts.get(3) || 0);
    const s45 = (scoreCounts.get(4) || 0) + (scoreCounts.get(5) || 0);
    const total = scoreCount > 0 ? scoreCount : 1;
    const scoreDistribution = [
      { score: '1', pct: Math.round((s1 / total) * 100) },
      { score: '2-3', pct: Math.round((s23 / total) * 100) },
      { score: '4-5', pct: Math.round((s45 / total) * 100) }
    ];

    const avgScore = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : '0';
    const weekNum = `第${getISOWeek(today)}周`;

    await feishuBot.sendCardMessage(
      chatId,
      createWeeklyReportCard({
        weekNumber: `${today.getFullYear()}年${weekNum}`,
        totalFeedbacks: scoreCount,
        newFeedbacks: syncedCount,
        avgScore: Number(avgScore),
        reviewCount,
        topIssues,
        scoreDistribution,
        bitableUrl: process.env.FEISHU_BITABLE_URL || process.env.BITABLE_URL || '',
        feedbackTableId: process.env.BITABLE_FEEDBACK_TABLE_ID || '',
        logPlatformUrl: process.env.LOG_PLATFORM_URL_TEMPLATE || process.env.LOG_PLATFORM_URL || '',
        hasNeedLogCheck: needLogCheckCount > 0,
        hasReviewNeeded: reviewCount > 0
      })
    );

    console.log(`[Cron] 通知发送成功`);
    return true;
  } catch (error) {
    console.error('[Cron] 发送通知失败', error);
    return false;
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / MILLISECONDS_PER_DAY) + 1) / 7);
}

async function enrichTenantInfo(feedbacks: Array<{ tenantId?: string; tenantName?: string; tenantScale?: string }>): Promise<Map<string, { name: string; scale: string }>> {
  const tenantIds = new Set<string>();
  // 按 tenantId 聚合租户信息（取第一个非空值）
  const tenantInfoMap = new Map<string, { name: string; scale: string }>();
  for (const f of feedbacks) {
    if (f.tenantId) {
      tenantIds.add(f.tenantId);
      const existing = tenantInfoMap.get(f.tenantId) || { name: '', scale: '' };
      tenantInfoMap.set(f.tenantId, {
        name: existing.name || f.tenantName || '',
        scale: existing.scale || f.tenantScale || '',
      });
    }
  }

  if (tenantIds.size === 0) return new Map();

  let existingTenants: Array<{ record_id: string; tenantId: string; tenantName: string; tenantScale: string }> = [];
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TENANTS, { pageSize: DEFAULT_PAGE_SIZE });
    existingTenants = records.filter((r) => String(r.fields[TENANT_FIELDS.TENANT_ID])).map((r) => ({
      record_id: r.record_id,
      tenantId: String(r.fields[TENANT_FIELDS.TENANT_ID]),
      tenantName: String(r.fields[TENANT_FIELDS.TENANT_NAME] || ''),
      tenantScale: String(r.fields[TENANT_FIELDS.SCALE] || ''),
    }));
  } catch (error) { console.error('[Cron] 读取租户表失败', error); }

  const knownMap = new Map(existingTenants.map((t) => [t.tenantId, { name: t.tenantName, scale: t.tenantScale }]));
  const unknownIds: string[] = [];
  for (const id of Array.from(tenantIds)) { if (!knownMap.has(id)) unknownIds.push(id); }

  if (unknownIds.length === 0) return knownMap;

  console.log(`[Cron] 发现 ${unknownIds.length} 个新租户`);
  for (const id of unknownIds) {
    const info = tenantInfoMap.get(id) || { name: '', scale: '' };
    knownMap.set(id, info);
    try {
      const fields: Record<string, unknown> = {
        [TENANT_FIELDS.TENANT_ID]: id,
        [TENANT_FIELDS.TENANT_NAME]: info.name,
      };
      // 只有租户规模有值时才写入（避免单选字段空值报错）
      if (info.scale) {
        fields[TENANT_FIELDS.SCALE] = info.scale;
      }
      await bitableClient.createRecord(TABLE_NAMES.TENANTS, fields);
    } catch (err) { console.error(`[Cron] 写入新租户 ${id} 失败:`, err); }
  }
  return knownMap;
}

async function getExistingFeedbackIds(startDate: Date, endDate: Date): Promise<Set<string>> {
  try {
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [
        { field_name: FEEDBACK_FIELDS.CREATE_TIME, operator: '>=', value: [startDate.toISOString()] },
        { field_name: FEEDBACK_FIELDS.CREATE_TIME, operator: '<=', value: [endDate.toISOString()] },
      ],
    });
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { filter, pageSize: LARGE_PAGE_SIZE });
    const existingIds = new Set<string>();
    for (const r of records) {
      const fid = String(r.fields[FEEDBACK_FIELDS.FEEDBACK_ID] || '');
      if (fid) existingIds.add(fid);
    }
    return existingIds;
  } catch (error) {
    console.error('[Cron] 获取已有反馈ID失败', error);
    return new Set<string>();
  }
}

async function generateWeeklyDoc(): Promise<boolean> {
  try {
    const result = await generateWeeklyReport(0);
    console.log(`[Cron] 周报文档生成结果: success=${result.success}, documentUrl=${result.documentUrl}, error=${result.error}`);
    if (result.success && result.documentUrl) {
      console.log(`[Cron] 周报文档生成成功: ${result.documentUrl}`);
      return true;
    } else {
      console.error(`[Cron] 周报文档生成失败: ${result.error || 'unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('[Cron] 周报文档生成异常', error);
    return false;
  }
}

async function updateLastSyncTime(): Promise<void> {
  console.log('[Cron] 跳过同步时间记录（DEV_MODE）');
}

async function getConfidenceThreshold(ownerId?: string): Promise<number> {
  const defaultThreshold = 0.8;
  const effectiveOwnerId = ownerId || process.env.DEFAULT_OWNER_ID || 'default_owner';
  try {
    const config = await getConfig(effectiveOwnerId);
    if (config && typeof config === 'object') {
      const tagging = (config as Record<string, unknown>).tagging as Record<string, unknown> | undefined;
      if (tagging && typeof tagging.confidenceThreshold === 'number') {
        return tagging.confidenceThreshold;
      }
    }
  } catch (err) { /* skip */ }
  return defaultThreshold;
}

// ========== DEV_MODE: Mock 数据同步 ==========

async function runSyncWithMockData(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    console.log('\n========== [Mock同步] 开始 ==========');
    const mockCount = DEFAULT_MOCK_COUNT;
    const { feedbackList, uniqueTenantIds } = batchGenFeedback(mockCount);
    console.log(`[Mock] 生成 ${feedbackList.length} 条反馈，${uniqueTenantIds.length} 个租户`);

    // 补全租户信息
    const mockFeedbacksForEnrich = feedbackList.map(fb => ({
      tenantId: fb.租户ID,
      tenantName: fb.租户名称,
      tenantScale: fb.租户规模,
    }));
    const tenantNameMap = await enrichTenantInfo(mockFeedbacksForEnrich);
    details.push(`[Mock] 租户补全完成：${tenantNameMap.size} 个租户`);

    const records = feedbackList.map((fb, i) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: `MOCK_${Date.now()}_${i + 1}`,
        [FEEDBACK_FIELDS.TENANT_ID]: fb.租户ID,
        [FEEDBACK_FIELDS.TENANT_SCALE]: fb.租户规模,
        [FEEDBACK_FIELDS.USER_ID]: fb.用户ID,
        [FEEDBACK_FIELDS.CREATE_TIME]: new Date(fb.创建时间).getTime(),
        [FEEDBACK_FIELDS.UNSATISFACTION_REASON]: fb.不满意原因.split(','),
        [FEEDBACK_FIELDS.CONTENT]: fb.反馈原文,
        [FEEDBACK_FIELDS.NPS_SCORE]: fb.评分,
        [FEEDBACK_FIELDS.SOURCE]: fb.反馈平台,
        [FEEDBACK_FIELDS.STATUS]: '未打标',
      },
    }));

    try {
      await bitableClient.batchCreateRecords(TABLE_NAMES.FEEDBACK, records);
      syncedCount = records.length;
      details.push(`[Mock] 写入 ${syncedCount} 条反馈`);
    } catch (err) {
      console.error('[Mock] 批量写入失败:', err);
      for (const rec of records) {
        try {
          await bitableClient.createRecord(TABLE_NAMES.FEEDBACK, rec.fields);
          syncedCount++;
        } catch { failedCount++; }
      }
    }

    const tagResult = await autoTagFeedbacks(DEFAULT_BATCH_SIZE);
    if (tagResult > 0) {
      details.push(`[Mock] AI打标完成 ${tagResult} 条`);
    }

    console.log('\n========== [Mock同步] 完成 ==========');
    return { success: true, syncedCount, failedCount, details, executedAt: new Date().toISOString() };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    details.push(`[Mock] 同步失败: ${errorMessage}`);
    return { success: false, syncedCount, failedCount, details, executedAt: new Date().toISOString() };
  }
}

// Mock 数据生成工具
const PLATFORM_CONTENT_MAP: Record<string, string[]> = {
  '打卡小程序': ['打卡定位失败', '点击打卡按钮没反应', '外勤打卡提交后页面报错', '希望支持批量打卡', '建议增加一键补卡功能', '打卡记录导出功能不好用', '请假后打卡状态没有更新', '考勤统计数据不准确', '希望支持人脸识别打卡', '加班打卡没有额外提醒'],
  '休假小程序': ['假期余额计算错误', '休假申请提交后页面报错', '审批流程卡住', '希望自定义审批模板', '年假折算规则不透明', '调休申请被驳回没有说明原因', '请假审批时间太长', '希望支持批量导入请假记录', '病假证明上传失败', '假期类型选择太少'],
};
const PLATFORM_LIST = Object.keys(PLATFORM_CONTENT_MAP);
const TENANT_SCALE_LIST = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const DISSATISFY_REASON_LIST = ['系统卡顿', '界面不美观', '功能缺失', '打开速度慢', '其他', '缺少功能'];

function batchGenFeedback(count: number) {
  const feedbackList = [];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  for (let i = 0; i < count; i++) {
    const tenantId = `T${String(Math.floor(Math.random() * 100)).padStart(3, '0')}`;
    const platform = PLATFORM_LIST[Math.floor(Math.random() * PLATFORM_LIST.length)];
    const contentPool = PLATFORM_CONTENT_MAP[platform];
    
    // 70% 的数据在当月，30% 在过去几个月
    let year = currentYear;
    let month: number;
    if (Math.random() < 0.7) {
      month = currentMonth;
    } else {
      // 过去 1-5 个月
      month = currentMonth - Math.floor(Math.random() * 5 + 1);
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
    }
    const day = Math.min(Math.floor(Math.random() * 28) + 1, new Date(year, month, 0).getDate());
    
    feedbackList.push({
      反馈ID: `MOCK_${Date.now()}_${i + 1}`,
      租户ID: tenantId,
      租户名称: '测试租户',
      租户规模: TENANT_SCALE_LIST[Math.floor(Math.random() * TENANT_SCALE_LIST.length)],
      用户ID: `U${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
      创建时间: `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
      不满意原因: DISSATISFY_REASON_LIST[Math.floor(Math.random() * DISSATISFY_REASON_LIST.length)],
      反馈原文: contentPool[Math.floor(Math.random() * contentPool.length)],
      反馈平台: platform,
      评分: Number((Math.random() * 4 + 1).toFixed(1)),
    });
  }
  return { feedbackList, uniqueTenantIds: Array.from(new Set(feedbackList.map(f => f.租户ID))) };
}
