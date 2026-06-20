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
import { feishuBot, createAnalysisCard } from '@/lib/feishu/bot';
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
    const notificationResult = await sendNotification();
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

    // 写入多维表格
    const records = feedbacks.map((f) => ({
      fields: {
        [FEEDBACK_FIELDS.FEEDBACK_ID]: f.feedbackId,
        [FEEDBACK_FIELDS.CONTENT]: f.content,
        [FEEDBACK_FIELDS.NPS_SCORE]: f.score,
        [FEEDBACK_FIELDS.CREATE_TIME]: f.createTime,
        [FEEDBACK_FIELDS.MODULE]: f.module || '',
        [FEEDBACK_FIELDS.SOURCE]: f.source || '',
        [FEEDBACK_FIELDS.TENANT_ID]: f.tenantId || '',
        [FEEDBACK_FIELDS.TENANT_NAME]: f.tenantName || '',
        [FEEDBACK_FIELDS.TENANT_SCALE]: f.tenantScale || '',
        [FEEDBACK_FIELDS.USER_ID]: f.larkUserId || '',
        [FEEDBACK_FIELDS.STATUS]: '未打标',
      },
    }));

    await bitableClient.batchCreateRecords(TABLE_NAMES.FEEDBACK, records);

    console.log(`[Cron] 外部数据同步完成，共 ${feedbacks.length} 条`);
    return feedbacks.length;
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

    // 获取 LLM Provider（从环境变量）
    const llm = LLMProviderFactory.createFromEnv();
    console.log(`[Cron] 使用 LLM: ${llm.getProviderType()}`);

    let successCount = 0;

    // 逐条打标
    for (const record of records) {
      try {
        const content = String(record.fields[FEEDBACK_FIELDS.CONTENT] || '');
        const moduleName = String(record.fields[FEEDBACK_FIELDS.MODULE] || '');
        const score = Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);

        if (!content) continue;

        // 构建 Prompt
        const systemPrompt = `你是一个专业的用户反馈分析助手。你的任务是根据用户反馈内容，提取三个层级的标签。

## Tag1（一级标签）—— 必须从以下 7 类中选择：
1. 疑似Bug：功能异常、报错、无法使用
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

功能模块：${moduleName}
评分：${score} 分（1-5分制）
反馈内容：${content}

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
    const { TABLE_NAMES: ANALYSIS_TABLE, ANALYSIS_FIELDS: AF } = await import('@/lib/feishu/constants');
    await bitableClient.createRecord(ANALYSIS_TABLE.ANALYSIS, {
      [AF.PERIOD_ID]: `daily_${dateStr}`,
      [AF.PERIOD_NAME]: `${dateStr} 日报`,
      [AF.START_DATE]: yesterday.toISOString(),
      [AF.END_DATE]: today.toISOString(),
      [AF.TOTAL_FEEDBACKS]: total,
      [AF.NPS_SCORE]: Math.round(avgScore * 100) / 100,
      [AF.TOP_ISSUES]: JSON.stringify(['查看多维表格获取详细分析']),
      [AF.CREATED_AT]: new Date().toISOString(),
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
async function sendNotification(): Promise<boolean> {
  const chatId = process.env.NOTIFICATION_CHAT_ID;
  if (!chatId) {
    console.log('[Cron] 未配置通知群ID，跳过通知');
    return false;
  }

  try {
    // 获取最近数据
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    const recentFeedbacks = records.filter((r) => {
      const createTime = new Date(String(r.fields[FEEDBACK_FIELDS.CREATE_TIME] || ''));
      return createTime >= thirtyDaysAgo;
    });

    const total = recentFeedbacks.length;
    const avgScore =
      total > 0
        ? recentFeedbacks.reduce((sum, f) => sum + Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0), 0) / total
        : 0;

    // 发送卡片消息
    await feishuBot.sendCardMessage(
      chatId,
      createAnalysisCard({
        periodName: '最近30天（自动报告）',
        totalFeedbacks: total,
        npsScore: Math.round(avgScore * 100) / 100,
        avgScore: Math.round(avgScore * 10) / 10,
        topIssues: ['使用 /nps analysis 查看详细分析'],
        promoterCount: recentFeedbacks.filter((f) => Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]) >= 4).length,
        passiveCount: recentFeedbacks.filter((f) => {
          const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]);
          return score >= 3 && score <= 3;
        }).length,
        detractorCount: recentFeedbacks.filter((f) => Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]) <= 2).length,
        scoreDistribution: [],
        tagStats: [],
        bitableUrl: process.env.BITABLE_URL || '',
      })
    );

    console.log('[Cron] 通知发送成功');
    return true;
  } catch (error) {
    console.error('[Cron] 发送通知失败', error);
    return false;
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
