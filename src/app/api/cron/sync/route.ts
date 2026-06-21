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

    // 步骤1：拉取外部数据（多数据源适配器）
    const externalDataResult = await syncExternalData();
    if (externalDataResult > 0) {
      details.push(`从外部数据源同步了 ${externalDataResult} 条反馈`);
      syncedCount += externalDataResult;
    }

    // 步骤2：对未打标的反馈进行AI批量打标
    const tagResult = await autoTagFeedbacks();
    if (tagResult > 0) {
      details.push(`AI自动打标 ${tagResult} 条反馈`);
      syncedCount += tagResult;
    }

    // 步骤3：生成周期报告
    const reportResult = await generateDailyReport();
    if (reportResult) {
      details.push('生成每日报告成功');
    }

    // 步骤4：发送通知
    const notificationResult = await sendNotification(syncedCount);
    if (notificationResult) {
      details.push('发送通知成功');
    }

    // 更新最后同步时间
    await updateLastSyncTime();

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
 * 自动对未打标的反馈进行AI打标（多模型LLM）
 * @returns 打标的反馈条数
 */
async function autoTagFeedbacks(): Promise<number> {
  try {
    // 获取未打标的反馈
    const filter = JSON.stringify({
      conjunction: 'and',
      conditions: [
        {
          field_name: FEEDBACK_FIELDS.STATUS,
          operator: 'is',
          value: ['未打标'],
        },
      ],
    });

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      filter,
      pageSize: 100,
    });

    if (records.length === 0) {
      console.log('[Cron] 没有需要打标的反馈');
      return 0;
    }

    console.log(`[Cron] 发现 ${records.length} 条未打标反馈，开始AI打标`);

    // 获取 LLM Provider
    const llm = LLMProviderFactory.createFromEnv();
    console.log(`[Cron] 使用 LLM: ${llm.getProviderType()}`);

    let successCount = 0;

    // 逐条打标
    for (const record of records) {
      try {
        const content = String(record.fields[FEEDBACK_FIELDS.CONTENT] || '');
        const score = Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
        const source = String(record.fields[FEEDBACK_FIELDS.SOURCE] || '');
        const unsatReason = String(record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || '');

        if (!content) continue;

        // 构建 Prompt
        const systemPrompt = `你是一个专业的用户反馈分析助手。你的任务是根据用户反馈内容，提取三个层级的标签。

## Tag1（一级标签）—— 必须从以下 7 类中选择：
1. 疑似Bug：功能异常、报错、崩溃、无法使用
2. 功能优化：功能改进、新功能建议
3. 界面改进：UI问题、交互优化
4. 性能提升：加载慢、卡顿、耗电
5. 用户教育：不知道如何使用
6. 安全：安全漏洞、隐私问题
7. 无效：无法分析、垃圾反馈

## Tag2（二级标签）—— 功能模块
根据反馈内容识别所属功能模块。

## Tag3（三级标签）—— 具体问题
从用户原话中提取最具体的问题描述。

## 输出格式
必须严格按照以下 JSON 格式输出：
{"tag1":"一级标签","tag2":"功能模块","tag3":"具体问题"}

规则：
1. Tag1 必须且只能从上述 7 个固定标签中选择
2. 如果无法确定 Tag2 或 Tag3，使用空字符串 ""
3. 如果反馈内容无法分析，Tag1 选择「无效」`;

        const userPrompt = `请分析以下用户反馈，提取标签。

评分：${score} 分（1-5分制）
反馈内容：${content}${unsatReason ? `\n不满意原因：${unsatReason}` : ''}${source ? `\n来源：${source}` : ''}

请只输出 JSON 格式结果。`;

        const response = await llm.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        // 解析 JSON 结果
        const jsonMatch = response.content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const tags = JSON.parse(jsonMatch[0]);

          await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, record.record_id, {
            tag1: tags.tag1 || '',
            tag2: tags.tag2 || '',
            tag3: tags.tag3 || '',
            [FEEDBACK_FIELDS.STATUS]: '已打标',
          });

          successCount++;
        }
      } catch (error) {
        console.error(`[Cron] 打标失败 [${record.record_id}]`, error);
      }
    }

    console.log(`[Cron] AI打标完成，成功 ${successCount}/${records.length}`);
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
 * 更新最后同步时间
 */
async function updateLastSyncTime(): Promise<void> {
  try {
    const { TABLE_NAMES: CONFIG_TABLE, CONFIG_FIELDS: CF } = await import('@/lib/feishu/constants');

    const records = await bitableClient.searchRecords(
      CONFIG_TABLE.CONFIG,
      CF.CONFIG_KEY,
      'last_sync_at'
    );

    const fields = {
      [CF.CONFIG_KEY]: 'last_sync_at',
      [CF.CONFIG_VALUE]: new Date().toISOString(),
      [CF.DESCRIPTION]: '上次同步时间',
      [CF.UPDATED_AT]: new Date().toISOString(),
    };

    if (records.length > 0) {
      await bitableClient.updateRecord(CONFIG_TABLE.CONFIG, records[0].record_id, fields);
    } else {
      await bitableClient.createRecord(CONFIG_TABLE.CONFIG, fields);
    }
  } catch (error) {
    console.error('[Cron] 更新同步时间失败', error);
  }
}

// ============================================
// DEV_MODE: Mock 同步任务
// ============================================

async function runSyncWithMockData(): Promise<SyncResult> {
  const details: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  try {
    // Mock: 生成 200 条模拟反馈
    const mockFeedbacks = generateMockFeedbacks(200);
    console.log(`[Cron DEV] 生成了 ${mockFeedbacks.length} 条 Mock 反馈`);

    // Mock: 写入多维表格
    for (const fb of mockFeedbacks) {
      try {
        await bitableClient.createRecord(TABLE_NAMES.FEEDBACK, {
          [FEEDBACK_FIELDS.FEEDBACK_ID]: `MOCK-${fb.id}`,
          [FEEDBACK_FIELDS.CONTENT]: fb.content,
          [FEEDBACK_FIELDS.NPS_SCORE]: fb.score,
          [FEEDBACK_FIELDS.CREATE_TIME]: fb.created_at,
          [FEEDBACK_FIELDS.UNSATISFACTION_REASON]: fb.module,
          [FEEDBACK_FIELDS.SOURCE]: 'Mock',
          [FEEDBACK_FIELDS.TENANT_ID]: fb.tenantId,
          [FEEDBACK_FIELDS.TENANT_NAME]: fb.tenantName,
          [FEEDBACK_FIELDS.TENANT_SCALE]: fb.tenantScale,
          [FEEDBACK_FIELDS.USER_ID]: fb.userId,
          [FEEDBACK_FIELDS.STATUS]: '未打标',
        });
        syncedCount++;
      } catch {
        failedCount++;
      }
    }

    // Mock: AI 打标（使用规则打标）
    const tagged = await mockAutoTag(syncedCount);
    details.push(`[Mock] AI 打标 ${tagged} 条反馈`);

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
  // Mock 打标：直接在多维表格中标记
  const filter = JSON.stringify({
    conjunction: 'and',
    conditions: [
      { field_name: FEEDBACK_FIELDS.STATUS, operator: 'is', value: ['未打标'] },
    ],
  });
  const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { filter, pageSize: count });
  let success = 0;
  for (const record of records.slice(0, count)) {
    try {
      await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, record.record_id, {
        tag1: '功能优化',
        tag2: record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || '',
        tag3: '一般问题',
        [FEEDBACK_FIELDS.STATUS]: '已打标',
      });
      success++;
    } catch { /* skip */ }
  }
  return success;
}
