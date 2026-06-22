/**
 * 定时同步任务API
 * GET /api/cron/sync
 * 由Vercel Cron触发，执行数据同步、AI打标、通知发送
 */

import { NextRequest, NextResponse } from 'next/server';
import { AdapterFactory } from '@/lib/data-sources/adapter-factory';
import { LLMProviderFactory } from '@/lib/llm/provider-factory';
import { bitableClient } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { feishuBot, createWeeklyReportCard } from '@/lib/feishu/bot';
import { tagger } from '@/lib/ai/tagger';
import { SyncResult } from '@/lib/types';

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
 * 执行完整的同步任务
 * 1. 拉取外部数据（多数据源适配器）
 * 2. 对未打标的反馈进行AI打标（多模型LLM）
 * 3. 生成周期报告
 * 4. 发送通知到群
 */
async function runSyncTask(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // DEV_MODE: 开发阶段使用 Mock 数据
    if (process.env.CRON_DEV_MODE === 'true') {
      console.log('[Cron DEV] 开发模式：使用 Mock 数据');
      const mockResult = await runSyncWithMockData();
      details.push(`[Mock] 同步了 ${mockResult.syncedCount} 条反馈`);
      syncedCount += mockResult.syncedCount;
      failedCount += mockResult.failedCount;
      return { ...mockResult, details };
    }

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

    // 步骤4：发送通知
    const notificationResult = await withTimeout(sendNotification(syncedCount), 30000, 'sendNotification');
    if (notificationResult) {
      details.push('发送通知成功');
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

    // 步骤3：批量写入
    const records = filteredFeedbacks.map((f) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: f.feedbackId,
        [FEEDBACK_FIELDS.CONTENT]: f.content,
        [FEEDBACK_FIELDS.NPS_SCORE]: f.score,
        [FEEDBACK_FIELDS.CREATE_TIME]: f.createTime,
        [FEEDBACK_FIELDS.UNSATISFACTION_REASON]: f.module || '',
        [FEEDBACK_FIELDS.SOURCE]: f.source || '',
        [FEEDBACK_FIELDS.TENANT_ID]: f.tenantId || '',
        [FEEDBACK_FIELDS.TENANT_NAME]: f.tenantName || '',
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
 * @returns 打标的反馈条数
 */
async function autoTagFeedbacks(batchSize: number = 50): Promise<number> {
  try {
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [
        { field_name: FEEDBACK_FIELDS.STATUS, operator: 'is', value: ['未打标'] },
      ],
    });

    const allRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      filter,
      pageSize: 500,
    });

    if (allRecords.length === 0) {
      console.log('[Cron] 没有需要打标的反馈');
      return 0;
    }

    console.log(`[Cron] 发现 ${allRecords.length} 条未打标反馈，开始批量AI打标（每批 ${batchSize} 条）`);

    // 预加载标签（缓存 5 分钟）
    const existingTags = await tagger.getCachedTags();
    const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
    const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
    const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);
    console.log(`[Cron] 标签体系: Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`);

    let successCount = 0;
    let failCount = 0;

    // 分批处理
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allRecords.length / batchSize);
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

      // 使用 tagger 统一打标逻辑
      const results = await tagger.batchAnalyzeFeedbacks(feedbacks, existingTags);

      const elapsed = Date.now() - t0;
      const batchSuccess = results.filter(r => r.success).length;
      console.log(`[Cron] 批次 ${batchNum} AI分析完成 (${elapsed}ms, 成功 ${batchSuccess}/${results.length})`);

      // 批量更新飞书
      const updates = results
        .filter(r => r.success && r.result)
        .map(r => ({
          record_id: r.recordId,
          fields: {
            [FEEDBACK_FIELDS.TAG1]: r.result!.tag1,
            [FEEDBACK_FIELDS.TAG2]: r.result!.tag2,
            [FEEDBACK_FIELDS.TAG3]: r.result!.tag3,
            [FEEDBACK_FIELDS.CONFIDENCE]: r.result!.confidence,
            [FEEDBACK_FIELDS.NEED_LOG_CHECK]: r.result!.needLogCheck,
            [FEEDBACK_FIELDS.REVIEW_NEEDED]: r.result!.reviewNeeded,
            [FEEDBACK_FIELDS.STATUS]: '已打标',
          },
        }));

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

      failCount += results.filter(r => !r.success).length;
    }

    console.log(`[Cron] AI打标完成，总计成功 ${successCount}/${allRecords.length}，失败 ${failCount}`);
    return successCount;
  } catch (error) {
    console.error('[Cron] 自动打标失败', error);
    return 0;
  }
}

/**
 * 生成每日报告
 * @returns 是否成功
 */
async function generateDailyReport(): Promise<boolean> {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = yesterday.toISOString().split('T')[0];

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

    // 统计数据
    const total = yesterdayFeedbacks.length;
    const avgScore =
      total > 0
        ? yesterdayFeedbacks.reduce((sum, f) => sum + Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0), 0) / total
        : 0;

    console.log(`[Cron] 昨日反馈统计: 总计${total}, 均分=${avgScore.toFixed(2)}`);

    // 保存到分析表
    const { TABLE_NAMES: TOP_ISSUES_TABLE, TOP_ISSUES_FIELDS: AF } = await import('@/lib/feishu/constants');
    await bitableClient.createRecord(TOP_ISSUES_TABLE.TOP_ISSUES, {
      [AF.TAG2_NAME]: '周期分析',
      [AF.TAG3_NAMES]: '自动生成',
      [AF.TOTAL_COUNT]: total,
      [AF.PERIOD_NEW_COUNT]: Math.round(avgScore * 100) / 100,
      [AF.ISSUE_KEY]: JSON.stringify(['查看多维表格获取详细分析']),
    });

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
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    // 统计待审核数和需要查日志数
    let reviewCount = 0;
    let needLogCheckCount = 0;
    const tag3Counts = new Map<string, number>();
    const scoreCounts = new Map<number, number>();

    for (const r of records) {
      const fields = r.fields || {};
      const reviewNeeded = String(fields[FEEDBACK_FIELDS.REVIEW_NEEDED] || '').toLowerCase() === 'true' || fields[FEEDBACK_FIELDS.REVIEW_NEEDED] === true;
      const needLog = String(fields[FEEDBACK_FIELDS.NEED_LOG_CHECK] || '').toLowerCase() === 'true' || fields[FEEDBACK_FIELDS.NEED_LOG_CHECK] === true;
      if (reviewNeeded) reviewCount++;
      if (needLog) needLogCheckCount++;

      // 统计Tag3频次
      const tag3Val = String(fields[FEEDBACK_FIELDS.TAG3] || '');
      if (tag3Val) {
        tag3Counts.set(tag3Val, (tag3Counts.get(tag3Val) || 0) + 1);
      }

      // 统计评分
      const score = Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score) scoreCounts.set(score, (scoreCounts.get(score) || 0) + 1);
    }

    // 构建Top 5问题
    const sortedTag3 = Array.from(tag3Counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topIssues = sortedTag3.map(([tag3, count]) => ({
      tag1: '',
      tag2: '',
      tag3,
      count,
      pct: syncedCount > 0 ? Math.round((count / syncedCount) * 100) : 0,
    }));

    // 评分分布：1分/2-3分/4-5分
    const s1 = scoreCounts.get(1) || 0;
    const s23 = (scoreCounts.get(2) || 0) + (scoreCounts.get(3) || 0);
    const s45 = (scoreCounts.get(4) || 0) + (scoreCounts.get(5) || 0);
    const total = syncedCount > 0 ? syncedCount : 1;
    const scoreDistribution = [
      { score: '1', pct: Math.round((s1 / total) * 100) },
      { score: '2-3', pct: Math.round((s23 / total) * 100) },
      { score: '4-5', pct: Math.round((s45 / total) * 100) },
    ];

    const now = new Date();
    const weekNum = `第${getISOWeek(now)}周`;

    await feishuBot.sendCardMessage(
      chatId,
      createWeeklyReportCard({
        weekNumber: `${now.getFullYear()}年${weekNum}`,
        totalFeedbacks: syncedCount,
        reviewCount,
        topIssues,
        scoreDistribution,
        bitableUrl: process.env.FEISHU_BITABLE_URL || '',
        logPlatformUrl: process.env.LOG_PLATFORM_URL || '',
        hasNeedLogCheck: needLogCheckCount > 0,
        hasReviewNeeded: reviewCount > 0,
      })
    );

    console.log(`[Cron] 通知发送成功（待审核：${reviewCount}，需查日志：${needLogCheckCount}）`);
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
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
 * 更新最后同步时间（本地记录，不写入多维表格）
 */
async function updateLastSyncTime(): Promise<void> {
  // 开发阶段跳过，避免不必要的 API 调用
  console.log('[Cron] 跳过同步时间记录（DEV_MODE）');
}

// ============================================
// DEV_MODE: Mock 同步任务
// ============================================

async function runSyncWithMockData(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // Mock: 生成 50 条模拟反馈（减少 API 调用量）
    const mockFeedbacks = generateMockFeedbacks(50);
    console.log(`[Cron DEV] 生成了 ${mockFeedbacks.length} 条 Mock 反馈`);

    // Mock: 写入多维表格（批量写入，使用时间戳避免重复）
    const ts = Date.now();
    const records = mockFeedbacks.map((fb, i) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: `MOCK_${ts}_${i + 1}`,
        [FEEDBACK_FIELDS.CONTENT]: fb.content,
        [FEEDBACK_FIELDS.NPS_SCORE]: fb.score,
        [FEEDBACK_FIELDS.CREATE_TIME]: new Date(fb.created_at).getTime(),
        [FEEDBACK_FIELDS.SOURCE]: 'Mock',
        [FEEDBACK_FIELDS.TENANT_ID]: fb.tenantId,
        [FEEDBACK_FIELDS.TENANT_NAME]: fb.tenantName,
        [FEEDBACK_FIELDS.TENANT_SCALE]: fb.tenantScale,
        [FEEDBACK_FIELDS.USER_ID]: fb.userId,
        [FEEDBACK_FIELDS.USER_NAME]: 'Mock用户',
        '审核状态': '已打标',
      },
    }));

    try {
      await bitableClient.batchCreateRecords(TABLE_NAMES.FEEDBACK, records);
      syncedCount = records.length;
      console.log(`[Cron DEV] 批量写入 ${syncedCount} 条 Mock 反馈`);
    } catch (err) {
      console.error('[Cron DEV] 批量写入失败:', err);
      // 回退：逐条写入
      for (const rec of records) {
        try {
          await bitableClient.createRecord(TABLE_NAMES.FEEDBACK, rec.fields);
          syncedCount++;
        } catch {
          failedCount++;
        }
      }
    }

    // Mock: AI 打标（跳过实际更新）
    details.push('[Mock] AI 打标已跳过（Mock 模式）');

    // Mock: 生成报告
    details.push('[Mock] 报告生成成功');

    // Mock: 发送通知
    details.push('[Mock] 通知发送成功');

    return {
      success: true,
      syncedCount,
      failedCount,
      details,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
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

function generateMockFeedbacks(count: number) {
  const modules = ['极速打卡', '审批流程', '考勤统计', '薪资查询', '请假管理'];
  const templates: Record<number, string[]> = {
    5: ['功能非常好用，解决了实际问题', '界面设计很清晰，操作方便'],
    4: ['整体不错，小细节可改进', '功能挺实用的，偶尔有小问题'],
    3: ['能用的水平，没有太多惊喜', '中规中矩，和竞品比没有明显优势'],
    2: ['最近经常崩溃，严重影响使用', '响应速度太慢了'],
    1: ['太难用了，浪费时间', '全是bug，没法正常使用'],
  };
  const scores = [1, 2, 3, 4, 5];
  const weights = [15, 20, 30, 20, 15];
  const rand = (w: number[]) => {
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) return scores[i];
    }
    return 3;
  };

  return Array.from({ length: count }, (_, i) => {
    const score = rand(weights);
    const module = modules[Math.floor(Math.random() * modules.length)];
    const content = templates[score][Math.floor(Math.random() * templates[score].length)];
    return {
      id: i + 1,
      content,
      module,
      score,
      created_at: `2026-06-${String(Math.floor(Math.random() * 15) + 1).padStart(2, '0')} ${String(Math.floor(Math.random() * 12) + 8).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      tenantId: `T${String(Math.floor(Math.random() * 10) + 1).padStart(3, '0')}`,
      tenantName: `租户${Math.floor(Math.random() * 10) + 1}`,
      tenantScale: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'][Math.floor(Math.random() * 6)],
      userId: `U${String(i + 1).padStart(4, '0')}`,
    };
  });
}

async function mockAutoTag(count: number): Promise<number> {
  // Mock 打标：简单返回，不实际更新（避免大量 API 调用）
  console.log(`[Cron DEV] Mock 打标跳过（${count} 条待处理）`);
  return 0;
}
