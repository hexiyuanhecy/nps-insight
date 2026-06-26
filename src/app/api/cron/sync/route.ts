/**
 * 定时同步任务API
 * GET /api/cron/sync
 * 由Vercel Cron触发，执行数据同步、AI打标、通知发送
 *
 * 多用户支持：
 * - 遍历所有 KV 中的配置，为每个用户执行同步任务
 * - 若无 KV 配置，回退到环境变量配置（向后兼容）
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdapterFactory } from '@/lib/data-sources/adapter-factory';
import { LLMProviderFactory } from '@/lib/llm/provider-factory';
import { bitableClient, initializeBitableConfig } from '@/lib/feishu/bitable';
import { extractMultiSelectFieldValue } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, TENANT_FIELDS } from '@/lib/feishu/constants';
import { feishuBot, createWeeklyReportCard } from '@/lib/feishu/bot';
import { tagger } from '@/lib/ai/tagger';
import { SyncResult } from '@/lib/types';
import { listAllConfigKeys, getConfig } from '@/lib/storage/kv-storage';

// ============================================
// Cron任务处理
// ============================================

/**
 * GET /api/cron/sync
 * Vercel Cron定时触发
 */
export async function GET(request: NextRequest) {
  try {
    // 验证Cron密钥
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const token = authHeader?.replace('Bearer ', '');
      if (token !== cronSecret) {
        return NextResponse.json(
          { success: false, error: '未授权的访问' },
          { status: 401 }
        );
      }
    }

    console.log('[Cron] 定时同步任务开始执行');

    const result = await runSyncTask();

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Cron] 定时任务执行失败', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/sync
 * 手动触发同步（用于测试）
 */
// Increase timeout for sync task (200 records + AI tagging + notification)
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    // 验证Cron密钥
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const token = authHeader?.replace('Bearer ', '');
      if (token !== cronSecret) {
        return NextResponse.json(
          { success: false, error: '未授权的访问' },
          { status: 401 }
        );
      }
    }

    console.log('[Cron] 手动触发同步任务');

    const result = await runSyncTask();

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Cron] 手动同步失败', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// 同步任务逻辑
// ============================================

/**
 * 执行完整的同步任务（多用户版本）
 * 遍历所有用户配置，为每个用户执行同步
 */
async function runSyncTask(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  // 多用户支持：尝试从 KV 获取所有配置（带超时保护）
  try {
    const kvPromise = listAllConfigKeys();
    const timeoutPromise = new Promise<string[]>((resolve) => {
      setTimeout(() => resolve([]), 3000);
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
  // 变量初始化（在 try 外部，确保 catch 块可访问）
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
      const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`[${name}] 操作超时 (${ms}ms)`)), ms)
          ),
        ]);
      };

      // 步骤1：拉取外部数据（多数据源适配器）
      const externalDataResult = await withTimeout(syncExternalData(), 30000, 'syncExternalData');
      if (externalDataResult > 0) {
        details.push(`从外部数据源同步了 ${externalDataResult} 条反馈`);
        syncedCount += externalDataResult;
      }

      // 步骤2：对未打标的反馈进行AI批量打标
      const tagResult = await withTimeout(autoTagFeedbacks(50), 30000, 'autoTagFeedbacks');
      if (tagResult > 0) {
        details.push(`AI自动打标 ${tagResult} 条反馈`);
        syncedCount += tagResult;
      }

      // 步骤3：生成周期报告
      const reportResult = await withTimeout(generateDailyReport(), 15000, 'generateDailyReport');
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
        console.error('[Cron] 周报文档生成失败', docErr);
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
 * 为单个用户执行同步任务（未来扩展用）
 * 目前内部仍使用全局环境变量，需要后续改进
 */
async function runSyncTaskForUser(ownerId: string): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // 初始化飞书配置（从 KV 加载）
    await initializeBitableConfig();

    if (process.env.CRON_DEV_MODE === 'true') {
      const mockResult = await runSyncWithMockData();
      return { ...mockResult, details };
    }

    // TODO: 使用 ownerId 对应的用户配置执行同步
    // 目前暂时复用单用户逻辑，未来需要重构为用户隔离模式

    const externalDataResult = await syncExternalData();
    if (externalDataResult > 0) {
      syncedCount += externalDataResult;
    }

    const tagResult = await autoTagFeedbacks(50, ownerId);
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

// ============================================
// 各步骤实现
// ============================================

/**
 * 从外部数据源同步数据（多数据源适配器）
 * @returns 同步的数据条数
 */
async function syncExternalData(): Promise<number> {
  // 检查数据源配置
  const dataSourceConfig = process.env.DATA_SOURCE_CONFIG;
  if (!dataSourceConfig) {
    console.log('[Cron] 未配置数据源，跳过外部同步');
    return 0;
  }

  try {
    const config = JSON.parse(dataSourceConfig);
    const adapter = AdapterFactory.create(config);

    console.log(`[Cron] 使用数据源: ${adapter.getType()}`);

    // 计算上周时间范围
    const now = new Date();
    const lastWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    lastWeekStart.setHours(0, 0, 0, 0);
    const lastWeekEnd = new Date(now.getTime() - 1);
    lastWeekEnd.setHours(23, 59, 59, 999);

    const startDate = lastWeekStart.toISOString();
    const endDate = lastWeekEnd.toISOString();

    // 拉取数据
    const feedbacks = await adapter.fetchData(startDate, endDate);

    if (feedbacks.length === 0) {
      console.log('[Cron] 本周暂无新增反馈');
      return 0;
    }

    // 步骤2：去重 — 获取本周已有 feedbackId
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
    console.log(`[Cron] 去重后新增 ${filteredFeedbacks.length} 条反馈（跳过 ${existingFeedbackIds.size} 条重复）`);

    // 步骤2.5：租户信息查询 — 补充新租户名称
    const tenantNameMap = await enrichTenantInfo(filteredFeedbacks);

    // 步骤3：批量写入（注意：租户名称是自动计算字段，不写入）
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

/**
 * 自动对未打标的反馈进行AI打标（批量打包，使用 tagger 统一逻辑）
 * @param batchSize 每批处理条数
 * @param ownerId 用户配置 ID（用于读取置信度阈值）
 * @returns 打标的反馈条数
 */
async function autoTagFeedbacks(batchSize: number = 50, ownerId?: string): Promise<number> {
  try {
    // 从 KV 配置读取置信度阈值
    const confidenceThreshold = await getConfidenceThreshold(ownerId);

    // 获取所有记录（listRecords 已自动处理分页）
    const allRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    // 代码过滤：只处理状态为 '未打标' 的记录
    const untaggedRecords = allRecords.filter((r) => {
      const status = String(r.fields[FEEDBACK_FIELDS.STATUS] || '');
      return status !== '已打标';
    });

    console.log('==============================>hxyuntaggedRecords == ', untaggedRecords)

    if (untaggedRecords.length === 0) {
      console.log('[Cron] 没有需要打标的反馈');
      return 0;
    }

    console.log(`[Cron] 发现 ${untaggedRecords.length} 条未打标反馈（status=new），开始批量AI打标（每批 ${batchSize} 条）`);

    // 预加载标签（缓存 5 分钟）
    const existingTags = await tagger.getCachedTags();
    const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
    const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
    const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);
    console.log(`[Cron] 标签体系: Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`);

    let successCount = 0;
    let failCount = 0;

    // 分批处理
    for (let i = 0; i < untaggedRecords.length; i += batchSize) {
      const batch = untaggedRecords.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(untaggedRecords.length / batchSize);
      console.log(`[Cron] 打标批次 ${batchNum}/${totalBatches}（${batch.length} 条）`);

      const t0 = Date.now();

      // 构建批量输入
      const feedbacks = batch.map((record, idx) => ({
        record_id: record.record_id,
        content: String(record.fields[FEEDBACK_FIELDS.CONTENT] || ''),
        score: Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0),
        source: String(record.fields[FEEDBACK_FIELDS.SOURCE] || ''),
        unsatReason: String(record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || ''),
      }));

      // 使用 tagger 统一打标逻辑（传入动态置信度阈值）
      const results = await tagger.batchAnalyzeFeedbacks(feedbacks, existingTags, confidenceThreshold);

      const elapsed = Date.now() - t0;
      const batchSuccess = results.filter(r => r.success).length;
      console.log(`[Cron] 批次 ${batchNum} AI分析完成 (${elapsed}ms, 成功 ${batchSuccess}/${results.length})`);

      // 第一步：收集本批次所有标签名
      const allTag1Names = new Set<string>();
      const allTag2Names = new Set<string>();
      const allTag3Names = new Set<string>();

      for (const result of results) {
        if (!result.success || !result.result) continue;
        result.result.tag1.forEach(t => t && allTag1Names.add(t));
        result.result.tag2.forEach(t => t && allTag2Names.add(t));
        result.result.tag3.forEach(t => t && allTag3Names.add(t));
      }

      // ========== 日志：打印本批次所有标签 ==========
      console.log(`[Cron] 批次 ${batchNum} 标签汇总: Tag1=${allTag1Names.size}, Tag2=${allTag2Names.size}, Tag3=${allTag3Names.size}`);
      console.log(`  Tag1: ${Array.from(allTag1Names).join(', ')}`);
      console.log(`  Tag2: ${Array.from(allTag2Names).join(', ')}`);
      console.log(`  Tag3: ${Array.from(allTag3Names).join(', ')}`);
      // ========================================================

      // 第二步：确保反馈表多选字段的选项存在（动态添加新选项）
      console.log(`[Cron] 批次 ${batchNum} 确保多选字段选项存在...`);
      try {
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG1, Array.from(allTag1Names));
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG2, Array.from(allTag2Names));
        await bitableClient.addMultiSelectOptions(TABLE_NAMES.FEEDBACK, FEEDBACK_FIELDS.TAG3, Array.from(allTag3Names));
      } catch (optErr) {
        console.error(`[Cron] 批次 ${batchNum} 添加多选选项失败:`, optErr);
      }

      // 第三步：同时确保标签表中的记录存在（用于统计和关联）
      console.log(`[Cron] 批次 ${batchNum} 确保标签表记录存在: Tag1=${allTag1Names.size}, Tag2=${allTag2Names.size}, Tag3=${allTag3Names.size}`);
      for (const name of Array.from(allTag1Names)) {
        try {
          await tagger.ensureTagExists(name, 'tag1');
        } catch (e) {
          console.error(`[Cron] 确保Tag1存在失败 ${name}:`, e);
        }
      }
      for (const name of Array.from(allTag2Names)) {
        try {
          await tagger.ensureTagExists(name, 'tag2');
        } catch (e) {
          console.error(`[Cron] 确保Tag2存在失败 ${name}:`, e);
        }
      }
      for (const name of Array.from(allTag3Names)) {
        try {
          await tagger.ensureTagExists(name, 'tag3');
        } catch (e) {
          console.error(`[Cron] 确保Tag3存在失败 ${name}:`, e);
        }
      }

      // 第四步：写入标签名称到反馈表（tag1/tag2/tag3 是 MultiSelect 多选字段）
      const updates = results
        .filter(r => r.success && r.result)
        .map(r => {
          return {
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
          };
        });

      if (updates.length > 0) {
        try {
          await bitableClient.batchUpdateRecords(TABLE_NAMES.FEEDBACK, updates);
          successCount += updates.length;
        } catch (updateErr) {
          console.error(`[Cron] 批量更新失败，逐条更新:`, updateErr);
          for (const update of updates) {
            try {
              await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, update.record_id, update.fields);
              successCount++;
            } catch {
              failCount++;
            }
          }
        }
      }

      // 第三步：标签统计数据由飞书公式字段自动计算，无需手动更新
      // （总使用次数、大租户使用次数等通过关联字段公式自动统计）

      failCount += results.filter(r => !r.success).length;
    }

    console.log(`[Cron] AI打标完成，总计成功 ${successCount}/${untaggedRecords.length}，失败 ${failCount}`);
    return successCount;
  } catch (error) {
    console.error('[Cron] 自动打标失败', error);
    return 0;
  }
}

/**
 * 生成每日报告
 * 注意：Top问题表的统计字段（总反馈数等）由飞书自动计算，不再手动写入
 * @returns 是否成功
 */
async function generateDailyReport(): Promise<boolean> {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 获取昨日反馈
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    const yesterdayFeedbacks = records.filter((r) => {
      const createTime = new Date(String(r.fields[FEEDBACK_FIELDS.CREATE_TIME] || ''));
      return createTime >= yesterday && createTime < today;
    });

    if (yesterdayFeedbacks.length === 0) {
      console.log('[Cron] 昨日无新反馈，跳过报告生成');
      return true;
    }

    // 统计数据（仅用于日志输出，不写入多维表格）
    const total = yesterdayFeedbacks.length;
    const avgScore =
      total > 0
        ? yesterdayFeedbacks.reduce((sum, f) => sum + Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0), 0) / total
        : 0;

    console.log(`[Cron] 昨日反馈统计: 总计${total}, 均分=${avgScore.toFixed(2)}`);
    console.log('[Cron] 每日报告统计数据仅用于日志，Top问题表统计字段由飞书自动计算');

    return true;
  } catch (error) {
    console.error('[Cron] 生成每日报告失败', error);
    return false;
  }
}

/**
 * 发送通知到群
 * @returns 是否成功
 */
async function sendNotification(syncedCount: number): Promise<boolean> {
  const chatId = process.env.NOTIFICATION_CHAT_ID;
  if (!chatId) {
    console.log('[Cron] 未配置通知群ID，跳过通知');
    return false;
  }

  try {
    // 计算本周时间范围（用于过滤本周数据）
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay() + 1)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    // 预加载标签缓存（用于 record_id -> 名称 转换）
    const allTags = await tagger.getCachedTags();
    const tag3RecordIdToName = new Map<string, string>();
    const tag2RecordIdToName = new Map<string, string>();
    const tag1RecordIdToName = new Map<string, string>();
    for (const tag of allTags) {
      if (tag.table === 'tag3' && tag.recordId && tag.tag3Name) {
        tag3RecordIdToName.set(tag.recordId, tag.tag3Name);
      }
      if (tag.table === 'tag2' && tag.recordId && tag.tag2Name) {
        tag2RecordIdToName.set(tag.recordId, tag.tag2Name);
      }
      if (tag.table === 'tag1' && tag.recordId && tag.tag1Name) {
        tag1RecordIdToName.set(tag.recordId, tag.tag1Name);
      }
    }
    console.log(`[Cron] 标签映射: Tag1=${tag1RecordIdToName.size}, Tag2=${tag2RecordIdToName.size}, Tag3=${tag3RecordIdToName.size}`);

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500
    })

    // 统计待审核数和需要查日志数（只统计本周）
    let reviewCount = 0
    let needLogCheckCount = 0
    let totalScore = 0
    let scoreCount = 0
    const tag3Counts = new Map<string, number>()
    const scoreCounts = new Map<number, number>()

    for (const r of records) {
      const fields = r.fields || {}
      const createTime = new Date(
        String(fields[FEEDBACK_FIELDS.CREATE_TIME] || '')
      )

      // 只统计本周的反馈
      if (createTime < weekStart || createTime >= weekEnd) {
        continue
      }

      const reviewNeeded =
        String(fields[FEEDBACK_FIELDS.REVIEW_NEEDED] || '').toLowerCase() === '是' ||
        String(fields[FEEDBACK_FIELDS.REVIEW_NEEDED] || '').toLowerCase() === 'true' ||
        fields[FEEDBACK_FIELDS.REVIEW_NEEDED] === true
      const needLog =
        String(fields[FEEDBACK_FIELDS.NEED_LOG_CHECK] || '').toLowerCase() === '是' ||
        String(fields[FEEDBACK_FIELDS.NEED_LOG_CHECK] || '').toLowerCase() === 'true' ||
        fields[FEEDBACK_FIELDS.NEED_LOG_CHECK] === true
      if (reviewNeeded) reviewCount++
      if (needLog) needLogCheckCount++

      // 统计Tag3频次（关联字段存的是 record_id，需要转成标签名）
      const tag3RecordIds = extractMultiSelectFieldValue(fields[FEEDBACK_FIELDS.TAG3])
      for (const recordId of tag3RecordIds) {
        if (!recordId) continue;
        const tag3Name = tag3RecordIdToName.get(recordId) || recordId;
        tag3Counts.set(tag3Name, (tag3Counts.get(tag3Name) || 0) + 1)
      }

      // 统计评分
      const score = Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0)
      if (score) {
        scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1)
        totalScore += score
        scoreCount++
      }
    }

    // 构建Top 5问题（基于本周统计数据）
    const sortedTag3 = Array.from(tag3Counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const topIssues = sortedTag3.map(([tag3Name, count]) => ({
      tag1: '',
      tag2: '',
      tag3: tag3Name,
      count,
      pct: scoreCount > 0 ? Math.round((count / scoreCount) * 100) : 0
    }))

    // 评分分布：1分/2-3分/4-5分（基于本周数据）
    const s1 = scoreCounts.get(1) || 0
    const s23 = (scoreCounts.get(2) || 0) + (scoreCounts.get(3) || 0)
    const s45 = (scoreCounts.get(4) || 0) + (scoreCounts.get(5) || 0)
    const total = scoreCount > 0 ? scoreCount : 1
    const scoreDistribution = [
      { score: '1', pct: Math.round((s1 / total) * 100) },
      { score: '2-3', pct: Math.round((s23 / total) * 100) },
      { score: '4-5', pct: Math.round((s45 / total) * 100) }
    ]

    // 本周平均分
    const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : '0'

    const weekNum = `第${getISOWeek(today)}周`

    // ========== 日志：打印生成的消息卡片内容 ==========
    console.log('\n' + '='.repeat(60));
    console.log('【Bot 通知 - 周报消息内容】');
    console.log('='.repeat(60));
    console.log(`📅 周报周期: ${today.getFullYear()}年第${getISOWeek(today)}周`);
    console.log(`📊 本周反馈总数: ${scoreCount} 条`);
    console.log(`🆕 新增反馈数: ${syncedCount} 条`);
    console.log(`⭐ 本周平均分: ${avgScore} 分`);
    console.log(`🔍 待审核: ${reviewCount} 条`);
    console.log(`📝 需查日志: ${needLogCheckCount} 条`);
    console.log('\n--- Top 5 问题 ---');
    topIssues.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.tag3} (${t.tag2}) - ${t.count}次 (${t.pct}%)`);
    });
    console.log('\n--- 评分分布 ---');
    scoreDistribution.forEach(s => {
      console.log(`  ${s.score}分: ${s.pct}%`);
    });
    console.log('\n--- 消息卡片文本预览 ---');
    const cardText = `📊 【Feelgood 打标周报】${today.getFullYear()}年第${getISOWeek(today)}周
本周累计：${scoreCount}条反馈（新增${syncedCount}条）
本周平均分：${avgScore}分
AI已完成打标，待审核：${reviewCount}条

📋 Top 5 问题
${topIssues.slice(0, 5).map((t, i) => `${i + 1}. ${t.tag3} (${t.tag2}) - ${t.count}次 (${t.pct}%)`).join('\n')}

📈 评分分布
${scoreDistribution.map(s => `${s.score}分占${s.pct}%`).join(' | ')}`;
    console.log(cardText);
    console.log('='.repeat(60) + '\n');
    // ========================================================

    await feishuBot.sendCardMessage(
      chatId,
      createWeeklyReportCard({
        weekNumber: `${today.getFullYear()}年${weekNum}`,
        totalFeedbacks: scoreCount, // 本周反馈总数
        newFeedbacks: syncedCount, // 本周新增反馈数
        avgScore: Number(avgScore), // 本周平均分
        reviewCount,
        topIssues,
        scoreDistribution,
        bitableUrl: process.env.FEISHU_BITABLE_URL || '',
        logPlatformUrl: process.env.LOG_PLATFORM_URL || '',
        hasNeedLogCheck: needLogCheckCount > 0,
        hasReviewNeeded: reviewCount > 0
      })
    )

    console.log(
      `[Cron] 通知发送成功（本周反馈：${scoreCount}，新增：${syncedCount}，待审核：${reviewCount}，需查日志：${needLogCheckCount}）`
    )
    return true
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
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * 租户信息查询与补充
 * 1. 从租户表读取已有 tenantId -> tenantName 映射
 * 2. 找出新反馈中未知的租户
 * 3. 调用外部查询接口批量获取名称
 * 4. 写入新租户记录到租户表
 * @returns tenantId -> tenantName 映射
 */
async function enrichTenantInfo(
  feedbacks: Array<{ tenantId?: string; tenantName?: string }>
): Promise<Map<string, string>> {
  // 收集所有唯一的 tenantId
  const tenantIds = new Set<string>();
  for (const f of feedbacks) {
    if (f.tenantId) tenantIds.add(f.tenantId);
  }

  if (tenantIds.size === 0) {
    console.log('[Cron] 无租户信息需要查询');
    return new Map();
  }

  // 1. 读取已有租户映射
  let existingTenants: Array<{ record_id: string; tenantId: string; tenantName: string }> = [];
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.TENANTS, { pageSize: 500 });
    existingTenants = records
      .filter((r) => String(r.fields[TENANT_FIELDS.TENANT_ID]))
      .map((r) => ({
        record_id: r.record_id,
        tenantId: String(r.fields[TENANT_FIELDS.TENANT_ID]),
        tenantName: String(r.fields[TENANT_FIELDS.TENANT_NAME] || ''),
      }));
  } catch (error) {
    console.error('[Cron] 读取租户表失败', error);
  }

  const knownMap = new Map(existingTenants.map((t) => [t.tenantId, t.tenantName]));
  const unknownIds: string[] = [];
  for (const id of Array.from(tenantIds)) {
    if (!knownMap.has(id)) {
      unknownIds.push(id);
    }
  }

  if (unknownIds.length === 0) {
    console.log(`[Cron] 所有 ${tenantIds.size} 个租户已在租户信息表中`);
    return knownMap;
  }

  console.log(`[Cron] 发现 ${unknownIds.length} 个新租户，开始查询: ${unknownIds.slice(0, 5).join(', ')}...`);

  // 2. 调用外部租户查询接口
  const queryUrl = process.env.TENANT_QUERY_URL;
  if (!queryUrl) {
    console.warn('[Cron] 未配置 TENANT_QUERY_URL，跳过新租户查询');
    // 仍写入租户表，名称留空
    for (const id of unknownIds) {
      knownMap.set(id, '');
      try {
        await bitableClient.createRecord(TABLE_NAMES.TENANTS, {
          [TENANT_FIELDS.TENANT_ID]: id,
          [TENANT_FIELDS.TENANT_NAME]: '',
        });
      } catch (err) {
        console.error(`[Cron] 写入新租户 ${id} 失败:`, err);
      }
    }
    return knownMap;
  }

  // 3. 批量查询
  let queried: Record<string, string> = {};
  try {
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantIds: unknownIds }),
    });

    if (resp.ok) {
      const data = await resp.json();
      queried = data.tenants || data.data || {};
    }
  } catch (error) {
    console.error('[Cron] 租户查询接口调用失败', error);
  }

  // 4. 写入新租户记录
  for (const id of unknownIds) {
    const name = queried[id] || '';
    knownMap.set(id, name);

    try {
      await bitableClient.createRecord(TABLE_NAMES.TENANTS, {
        [TENANT_FIELDS.TENANT_ID]: id,
        [TENANT_FIELDS.TENANT_NAME]: name,
      });
      console.log(`[Cron] 新增租户: ${id} -> ${name || '(名称未知)'}`);
    } catch (err) {
      console.error(`[Cron] 写入新租户 ${id} 失败:`, err);
    }
  }

  console.log(`[Cron] 租户查询完成: ${unknownIds.length} 个新租户，${Object.keys(queried).length} 个有名称`);
  return knownMap;
}

/**
 * 获取指定时间范围内的已有 feedbackId 集合（用于去重）
 */
async function getExistingFeedbackIds(startDate: Date, endDate: Date): Promise<Set<string>> {
  try {
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [
        {
          field_name: FEEDBACK_FIELDS.CREATE_TIME,
          operator: '>=',
          value: [startDate.toISOString()],
        },
        {
          field_name: FEEDBACK_FIELDS.CREATE_TIME,
          operator: '<=',
          value: [endDate.toISOString()],
        },
      ],
    });

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      filter,
      pageSize: 5000,
    });

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

/**
 * 生成周报文档（调用 POST /api/documents/weekly）
 */
async function generateWeeklyDoc(): Promise<boolean> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/documents/weekly`;

    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.CRON_SECRET) {
      authHeaders['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      console.error(`[Cron] 周报文档 API 返回 HTTP ${response.status}`);
      return false;
    }

    const result = await response.json();
    console.log(`[Cron] 周报文档生成成功: 第${result.data?.weekNumber}周`);
    return result.success;
  } catch (error) {
    console.error('[Cron] 周报文档生成请求失败', error);
    return false;
  }
}

/**
 * 更新最后同步时间（本地记录，不写入多维表格）
 */
async function updateLastSyncTime(): Promise<void> {
  // 开发阶段跳过，避免不必要的 API 调用
  console.log('[Cron] 跳过同步时间记录（DEV_MODE）');
}

// ============================================
// DEV_MODE: Mock 同步任务（带详细日志）
// ============================================

// ====================== Mock常量 ======================
// 平台-专属反馈文案映射（保证内容和平台匹配）
const PLATFORM_CONTENT_MAP: Record<string, string[]> = {
  '打卡小程序': [
    '打卡定位失败，一直显示定位中', '点击打卡按钮没反应', '外勤打卡提交后页面报错',
    '希望支持批量打卡', '建议增加一键补卡功能', '希望支持多地点打卡', '建议增加打卡提醒功能',
    '打卡页面按钮太小，容易误触', '移动端页面适配有问题',
    '打卡页面加载太慢，要等5秒', '多人同时打卡时系统卡死',
    '不知道怎么申请补卡', '不了解打卡规则', '不会使用外勤打卡功能',
    '打卡位置可以伪造', '打卡记录被篡改',
    'test', '测试数据', '随便填的'
  ],
  '休假小程序': [
    '假期余额计算错误', '休假申请提交后页面报错', '审批流程卡住，无法继续',
    '希望能自定义审批模板', '希望能设置弹性工作时间',
    '休假申请流程太长，步骤太多', '深色模式下文字看不清',
    '假期余额查询响应慢',
    '找不到休假申请入口', '不清楚假期余额怎么算',
    '审批权限设置不合理',
    '111111', '无意义反馈'
  ],
  '休假员工端': [
    '假期余额刷新不出来', '调休申请提交失败',
    '希望能一键复制上次休假审批', '增加假期到期提醒',
    '休假时长选择控件不好用',
    '打开休假列表卡顿',
    '分不清事假和年假申请入口',
    'aaaaaaaa', '不知道说什么'
  ],
  '假勤管理后台': [
    '考勤数据丢失，昨天打卡记录不见了', '工资条显示乱码',
    '建议增加导出考勤报表功能',
    '审批页面排版太乱', '统计页面图表不清晰', '工资条页面颜色不统一',
    '打开统计页面卡顿严重', '审批列表滑动卡顿', '工资条页面打开速度慢',
    '不清楚如何设置审批人', '不知道怎么看工资条',
    '工资条信息泄露风险', '考勤数据访问权限过大', '敏感信息未加密'
  ],
  '考勤机': [
    '人脸打卡识别失败', '考勤机同步数据中断', '机器打卡记录不同步后台',
    '希望支持刷卡+人脸双打卡', '增加机器离线打卡缓存功能',
    '考勤机屏幕字体太小老人看不清',
    '考勤机开机加载缓慢', '多人排队打卡识别卡顿',
    '他人代刷人脸可通过验证'
  ]
};
const PLATFORM_LIST = Object.keys(PLATFORM_CONTENT_MAP);
const TENANT_SCALE_LIST = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const DISSATISFY_REASON_LIST = ['系统卡顿', '界面不美观', '功能缺失', '打开速度慢', '其他', '缺少功能'];

// 租户全局缓存：同一租户ID，名称、规模全局统一
const tenantGlobalCache = new Map<string, { tenantName: string; scale: string }>();

// ====================== Mock工具函数 ======================
// 随机数组取N个不重复元素
function randomPickArr<T>(arr: T[], min = 1, max = arr.length): T[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const copy = [...arr];
  const res: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    res.push(copy.splice(idx, 1)[0]);
  }
  return res;
}

// 随机小数保留1位
function randomFloat(min: number, max: number): number {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

// ====================== Mock数据生成 ======================
// 获取/创建租户基础信息（存入全局缓存，给租户Mock复用）
function getOrCreateTenantBase(tenantId: string): { tenantName: string; scale: string } {
  if (tenantGlobalCache.has(tenantId)) {
    return tenantGlobalCache.get(tenantId)!;
  }
  const namePool = ['租户1', '租户3', '租户7', '租户8', '租户9', '租户10'];
  const tenantName = namePool[Math.floor(Math.random() * namePool.length)];
  const scale = TENANT_SCALE_LIST[Math.floor(Math.random() * TENANT_SCALE_LIST.length)];
  const baseInfo = { tenantName, scale };
  tenantGlobalCache.set(tenantId, baseInfo);
  return baseInfo;
}

// 生成单条反馈（字段名与反馈表完全对应）
function genSingleFeedback(): {
  反馈ID: string;
  租户ID: string;
  租户名称: string;
  租户规模: string;
  用户ID: string;
  创建时间: string;
  不满意原因: string;
  反馈原文: string;
  反馈平台: string;
  评分: number;
} {
  const feedbackId = `MOCK_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const tenantId = `T${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`;
  const { tenantName, scale } = getOrCreateTenantBase(tenantId);
  const userId = `U${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
  const month = String(Math.floor(Math.random() * 6) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  const createTime = `2026/${month}/${day}`;
  const reasonArr = randomPickArr(DISSATISFY_REASON_LIST, 1, 3);
  const dissatisfyReason = reasonArr.join(',');
  const platform = PLATFORM_LIST[Math.floor(Math.random() * PLATFORM_LIST.length)];
  const contentPool = PLATFORM_CONTENT_MAP[platform];
  const feedbackText = contentPool[Math.floor(Math.random() * contentPool.length)];
  const score = randomFloat(1, 5);

  return {
    反馈ID: feedbackId,
    租户ID: tenantId,
    租户名称: tenantName,
    租户规模: scale,
    用户ID: userId,
    创建时间: createTime,
    不满意原因: dissatisfyReason,
    反馈原文: feedbackText,
    反馈平台: platform,
    评分: score
  };
}

// 批量生成反馈，返回【反馈列表 + 去重租户ID数组】
function batchGenFeedback(count = 10): {
  feedbackList: ReturnType<typeof genSingleFeedback>[];
  uniqueTenantIds: string[];
} {
  const feedbackList: ReturnType<typeof genSingleFeedback>[] = [];
  for (let i = 0; i < count; i++) {
    feedbackList.push(genSingleFeedback());
  }
  // 提取所有唯一租户ID
  const tenantIdSet = new Set(feedbackList.map(item => item.租户ID));
  const uniqueTenantIds = Array.from(tenantIdSet);
  return { feedbackList, uniqueTenantIds };
}

/**
 * Mock 同步任务：生成模拟反馈数据 → 写入多维表格 → AI打标 → 发送通知
 * 带详细日志输出，方便调试阅读
 */
async function runSyncWithMockData(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // =============== 步骤1：生成 Mock 反馈数据 ===============
    console.log('\n========== [步骤1] 生成 Mock 反馈数据 ==========');
    const MOCK_COUNT = 100; // 生成100条
    const { feedbackList, uniqueTenantIds } = batchGenFeedback(MOCK_COUNT);
    console.log(`[Mock] 生成 ${feedbackList.length} 条反馈，涉及 ${uniqueTenantIds.length} 个租户`);
    console.log('[Mock] 前3条反馈预览:');
    feedbackList.slice(0, 3).forEach((fb, i) => {
      console.log(`  ${i + 1}. [${fb.反馈平台}] ${fb.反馈原文.substring(0, 30)}... | 评分:${fb.评分} | 租户:${fb.租户名称}(${fb.租户规模})`);
    });

    // =============== 步骤2：写入多维表格 ===============
    console.log('\n========== [步骤2] 写入多维表格 ==========');
    const ts = Date.now();
    // 构建符合反馈表字段格式的记录
    const records = feedbackList.map((fb, i) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: `MOCK_${ts}_${i + 1}`,
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
      console.log(`[Mock] 批量写入成功: ${syncedCount} 条反馈`);
      details.push(`[Mock] 写入 ${syncedCount} 条反馈到飞书表格`);
    } catch (err) {
      console.error('[Mock] 批量写入失败，回退到逐条写入:', err instanceof Error ? err.message : err);
      // 回退：逐条写入
      for (const rec of records) {
        try {
          await bitableClient.createRecord(TABLE_NAMES.FEEDBACK, rec.fields);
          syncedCount++;
        } catch {
          failedCount++;
        }
      }
      console.log(`[Mock] 逐条写入完成: 成功 ${syncedCount} 条, 失败 ${failedCount} 条`);
    }

    // =============== 步骤3：AI 打标 ===============
    console.log('\n========== [步骤3] 开始 AI 打标 ==========');
    const tagResult = await autoTagFeedbacks(20);
    if (tagResult > 0) {
      details.push(`[Mock] AI 打标完成 ${tagResult} 条反馈`);
      console.log(`[Mock] AI 打标完成: ${tagResult} 条`);
    } else {
      details.push('[Mock] AI 打标无新数据');
      console.log('[Mock] AI 打标: 无新数据需要打标');
    }

    // =============== 步骤4：Mock 数据同步完成 ===============
    console.log('\n========== Mock 同步任务完成 ==========');
    console.log(`[Mock] 总同步: ${syncedCount} 条, 失败: ${failedCount} 条`);

    return {
      success: true,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[Mock] 同步任务异常:', errorMessage);
    details.push(`[Mock] 同步失败: ${errorMessage}`);
    return {
      success: false,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  }
}

// 旧函数别名（保持向后兼容）
function generateMockFeedbacks(count: number) {
  const { feedbackList } = batchGenFeedback(count);
  // 转换为旧格式（兼容其他调用）
  return feedbackList.map(fb => ({
    id: fb.反馈ID,
    content: fb.反馈原文,
    module: fb.反馈平台,
    score: fb.评分,
    created_at: fb.创建时间,
    tenantId: fb.租户ID,
    tenantName: fb.租户名称,
    tenantScale: fb.租户规模,
    userId: fb.用户ID,
  }));
}

async function mockAutoTag(count: number): Promise<number> {
  // Mock 打标：简单返回，不实际更新（避免大量 API 调用）
  console.log(`[Cron DEV] Mock 打标跳过（${count} 条待处理）`);
  return 0;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 从 KV 配置读取置信度阈值
 * @param ownerId 用户配置 ID（可选）
 * @returns 置信度阈值，默认 0.8
 */
async function getConfidenceThreshold(ownerId?: string): Promise<number> {
  const defaultThreshold = 0.8;
  const effectiveOwnerId = ownerId || process.env.DEFAULT_OWNER_ID || 'default_owner';

  try {
    const config = await getConfig(effectiveOwnerId);
    if (config && typeof config === 'object') {
      const tagging = (config as Record<string, unknown>).tagging as Record<string, unknown> | undefined;
      if (tagging && typeof tagging.confidenceThreshold === 'number') {
        const threshold = tagging.confidenceThreshold;
        console.log(`[Cron] 从配置读取置信度阈值: ${threshold} (ownerId: ${effectiveOwnerId})`);
        return threshold;
      }
    }
  } catch (err) {
    console.warn(`[Cron] 读取置信度阈值配置失败，使用默认值 ${defaultThreshold}:`, err);
  }

  console.log(`[Cron] 使用默认置信度阈值: ${defaultThreshold}`);
  return defaultThreshold;
}
