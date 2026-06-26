/**
 * 月度任务 API
 * 执行顺序：标签自进化 → Top问题生成 → 公式同步 → 会议文档 → 通知
 *
 * 多用户支持：
 * - 遍历所有 KV 中的配置，为每个用户执行月度任务
 * - 若无 KV 配置，回退到环境变量配置（向后兼容）
 */

import { NextRequest, NextResponse } from 'next/server';
import { TagEvolution, EvolutionReport } from '@/lib/ai/tag-evolution';
// [修改点1] 导入 V2 版本的标签自进化模块
import { runTagEvolutionV2, TagEvolutionResultV2 } from '@/lib/ai/tag-evolution-v2';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';
import { FormulaSync } from '@/lib/analysis/formula-sync';
import { getDefaultStorage, getDefaultNotification, getDefaultDocument } from '@/lib/adapter-factory';
import { TopIssue } from '@/lib/analysis/top-issues';
import { createMonthlyReportCard } from '@/lib/feishu/bot';
import { listAllConfigKeys, getConfig } from '@/lib/storage/kv-storage';
import { bitableClient } from '@/lib/feishu/bitable'
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants'

/**
 * 月度任务执行结果
 * [修改点2] evolution 字段类型改为 V2 结果类型，兼容旧结构
 */
interface MonthlyTaskResult {
  success: boolean;
  timestamp: number;
  evolution: TagEvolutionResultV2 | null;
  topIssues: TopIssue[] | null;
  formulaSync: boolean;
  meetingDoc: { documentId: string; url: string } | null;
  notification: boolean;
  error?: string;
}

/**
 * GET /api/cron/monthly
 * 执行月度任务
 */
export async function GET(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  return handleMonthlyTask();
}

/**
 * POST /api/cron/monthly
 * 手动触发月度任务
 */
// Increase timeout for monthly task
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse<MonthlyTaskResult>> {
  // 验证授权
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json(
        { success: false, error: '未授权' } as MonthlyTaskResult,
        { status: 401 }
      );
    }
  }
  return handleMonthlyTask();
}

async function handleMonthlyTask(): Promise<NextResponse<MonthlyTaskResult>> {
  console.log('[月度任务] 开始执行');

  // 多用户支持：尝试从 KV 获取所有配置
  try {
    const configKeys = await listAllConfigKeys();

    if (configKeys.length > 0) {
      console.log(`[月度任务] 发现 ${configKeys.length} 个用户配置，开始多用户月度任务`);

      const results: MonthlyTaskResult[] = [];

      // 遍历每个用户的配置执行月度任务
      for (const key of configKeys) {
        const ownerId = key.replace('config:', '');
        console.log(`[月度任务] 正在处理用户: ${ownerId}`);

        try {
          const userConfig = await getConfig(ownerId);
          if (userConfig) {
            const userResult = await handleMonthlyTaskForUser(ownerId);
            results.push(userResult);
          }
        } catch (userErr) {
          console.error(`[月度任务] 用户 ${ownerId} 处理失败:`, userErr);
          results.push({
            success: false,
            timestamp: Date.now(),
            evolution: null,
            topIssues: null,
            formulaSync: false,
            meetingDoc: null,
            notification: false,
            error: userErr instanceof Error ? userErr.message : '未知错误',
          });
        }
      }

      // 返回第一个结果作为代表（实际应返回汇总结果）
      const firstResult = results[0] || {
        success: true,
        timestamp: Date.now(),
        evolution: null,
        topIssues: null,
        formulaSync: true,
        meetingDoc: null,
        notification: true,
      };

      console.log(`[月度任务] 完成，共处理 ${results.length} 个用户`);
      return NextResponse.json(firstResult);
    }
  } catch (kvErr) {
    console.warn('[月度任务] KV 查询失败，回退到环境变量模式:', kvErr);
  }

  // 回退到单用户模式
  return handleMonthlyTaskSingleUser();
}

/**
 * 单用户月度任务（使用环境变量，向后兼容）
 */
async function handleMonthlyTaskSingleUser(): Promise<NextResponse<MonthlyTaskResult>> {
  console.log('[月度任务] 单用户模式执行');

  const result: MonthlyTaskResult = {
    success: false,
    timestamp: Date.now(),
    evolution: null,
    topIssues: null,
    formulaSync: false,
    meetingDoc: null,
    notification: false,
  };

  // DEV_MODE: 跳过所有飞书 API 调用，直接返回模拟结果
  if (process.env.CRON_DEV_MODE === 'true') {
    console.log('[月度任务 DEV] 开发模式：使用模拟数据');
    const now = new Date();
    const periodName = `${now.getFullYear()}年${now.getMonth() + 1}月`;

    // [修改点6] DEV_MODE 下使用 V2 结果结构的模拟数据
    result.evolution = {
      success: true,
      totalFeedbackCount: 0,
      mode: 'full',
      mergeTag3Count: 0,
      newTag2Count: 0,
      mergeTag2Count: 0,
      manualReviewItems: [],
    };
    result.topIssues = [];
    result.formulaSync = true;
    result.meetingDoc = { documentId: 'mock_doc', url: process.env.FEISHU_BITABLE_URL || '' };
    result.notification = true;
    result.success = true;

    console.log(`[月度任务 DEV] 完成 (${periodName})`);
    return NextResponse.json(result);
  }

  try {
    const storage = getDefaultStorage()
    const notification = getDefaultNotification()
    const document = getDefaultDocument()

    // 1. 标签自进化（先执行）
    // [修改点3] 切换到 V2 版本的标签自进化
    console.log('[月度任务] 步骤1：标签自进化（V2）')
    try {
      result.evolution = await runTagEvolutionV2()

      // ========== 日志：打印标签自进化结果 ==========
      console.log('\n' + '='.repeat(60))
      console.log('【月分析 - 标签自进化结果】')
      console.log('='.repeat(60))
      console.log(`✅ 执行状态: ${result.evolution.success ? '成功' : '失败'}`)
      console.log(`📊 分析模式: ${result.evolution.mode === 'full' ? '全量分析' : '高频过滤'}`)
      console.log(`📝 总反馈数: ${result.evolution.totalFeedbackCount}`)
      console.log(`🔄 Tag3 合并数: ${result.evolution.mergeTag3Count}`)
      console.log(`🆕 新 Tag2 数: ${result.evolution.newTag2Count}`)
      console.log(`🔀 Tag2 合并数: ${result.evolution.mergeTag2Count}`)
      console.log(`👀 人工复核项: ${result.evolution.manualReviewItems.length} 项`)
      if (result.evolution.error) {
        console.log(`⚠️  异常信息: ${result.evolution.error}`)
      }
      console.log('='.repeat(60) + '\n')
      // ======================================================

    } catch (evoErr) {
      console.error('[月度任务] 标签自进化失败，跳过:', evoErr)
      // 失败时返回 V2 结构的空结果，不影响后续步骤
      result.evolution = {
        success: false,
        totalFeedbackCount: 0,
        mode: 'full',
        mergeTag3Count: 0,
        newTag2Count: 0,
        mergeTag2Count: 0,
        manualReviewItems: [],
        error: evoErr instanceof Error ? evoErr.message : '未知错误'
      }
    }

    // 2. Top问题生成（基于历史+本月数据）
    console.log('[月度任务] 步骤2：Top问题生成')
    try {
      const topIssuesGenerator = new TopIssuesGenerator(storage)

      // 获取当前权重配置
      const formulaSync = new FormulaSync(storage)
      const weights = await formulaSync.getWeights()
      topIssuesGenerator.setWeights(weights)

      result.topIssues = await topIssuesGenerator.generate()

      // ========== 日志：打印 Top 问题生成结果 ==========
      console.log('\n' + '='.repeat(60))
      console.log('【月分析 - Top 问题生成结果】')
      console.log('='.repeat(60))
      console.log(`📊 生成 Top 问题数: ${result.topIssues.length}`)
      console.log('\n--- Top 10 问题 ---')
      // 注意：TopIssue 类型定义中只有表字段，实际运行时有更多统计属性
      ;(result.topIssues as any[]).slice(0, 10).forEach((issue: any, idx: number) => {
        const tag2Name = issue.tag2 || issue.tag2Name || '-'
        const count = issue.totalCount || issue.count || 0
        const ratio = issue.largeTenantRatio ? (issue.largeTenantRatio * 100).toFixed(1) : '0'
        console.log(`  ${idx + 1}. [${tag2Name}] (${count}条, 大租户占比 ${ratio}%)`)
      })
      console.log('='.repeat(60) + '\n')
      // ======================================================

      // 写入 Top问题表
      await topIssuesGenerator.writeToTable(result.topIssues)
    } catch (topErr) {
      console.error('[月度任务] Top问题生成失败，跳过:', topErr)
    }

    // 3. 公式同步（以用户调整为准）
    console.log('[月度任务] 步骤3：公式同步')
    try {
      const formulaSync = new FormulaSync(storage)
      await formulaSync.sync()
      result.formulaSync = true
    } catch (fmtErr) {
      console.error('[月度任务] 公式同步失败:', fmtErr)
    }

    // 4. 生成会议文档
    console.log('[月度任务] 步骤4：生成会议文档')
    try {
      result.meetingDoc = await generateMeetingDoc(
        document,
        result.evolution,
        result.topIssues || []
      )
    } catch (docErr) {
      console.error('[月度任务] 会议文档生成失败:', docErr)
    }

    // 5. 发送通知
    console.log('[月度任务] 步骤5：发送通知')
    const now = new Date()
    const periodName = `${now.getFullYear()}年${now.getMonth() + 1}月`

    // 获取当月反馈总数
    let totalFeedbacks = 0
    try {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const filter = JSON.stringify({
        conjunction: 'and',
        conditions: [
          {
            field_name: FEEDBACK_FIELDS.CREATE_TIME,
            operator: '>=',
            value: [monthStart.toISOString()]
          }
        ]
      })
      const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
        filter,
        pageSize: 1000
      })
      totalFeedbacks = records.length
      console.log(`[月度任务] 当月反馈总数: ${totalFeedbacks}`)
    } catch (countErr) {
      console.error('[月度任务] 获取当月反馈数失败:', countErr)
    }

    const notificationChannels =
      process.env.NOTIFICATION_CHANNELS?.split(',') || []
    if (notificationChannels.length > 0) {
      // [修改点4] 适配 V2 结果结构，从 V2 结果中获取合并数和拆分数
      const card = createMonthlyReportCard({
        periodName,
        totalFeedbacks,
        topIssueUrl: process.env.FEISHU_BITABLE_URL || '',
        documentUrl: result.meetingDoc?.url,
        dashboardUrl: process.env.FEISHU_DASHBOARD_URL || '',
        mergeCount: result.evolution?.mergeTag3Count || 0,
        splitCount: result.evolution?.newTag2Count || 0,
        topIssues: (result.topIssues || []).map((issue: any) => ({
          tag3: issue.tag3Names?.join(', ') || '',
          tag2: issue.tag2Name || '',
          count: issue.totalCount || 0,
          largeTenantRatio: issue.largeTenantRatio || 0
        }))
      })

      // ========== 日志：打印月度消息卡片内容 ==========
      console.log('\n' + '='.repeat(60))
      console.log('【月分析 - 消息卡片内容预览】')
      console.log('='.repeat(60))
      console.log(`📅 周期: ${periodName}`)
      console.log(`📊 当月反馈总数: ${totalFeedbacks}`)
      console.log(`🔄 Tag3 合并数: ${result.evolution?.mergeTag3Count || 0}`)
      console.log(`🆕 新 Tag2 数: ${result.evolution?.newTag2Count || 0}`)
      console.log(`📝 Top问题数: ${result.topIssues?.length || 0}`)
      if (result.meetingDoc) {
        console.log(`📄 会议文档: ${result.meetingDoc.url}`)
      }
      console.log('\n--- Top 问题列表 ---')
      // 注意：topIssues 类型是 TopIssue，实际运行时可能有更多属性，用 any 断言
      ;(result.topIssues as any[]).slice(0, 10).forEach((issue: any, idx: number) => {
        const tag3Names = issue.tag3Names?.join(', ') || issue.tag3 || '-'
        const tag2Name = issue.tag2 || issue.tag2Name || '-'
        const count = issue.totalCount || issue.count || 0
        console.log(`  ${idx + 1}. [${tag2Name}] ${tag3Names} (${count}条)` )
      })
      console.log('='.repeat(60) + '\n')
      // ======================================================

      await notification.sendToMultiple(notificationChannels, card)
      result.notification = true
    }

    result.success = true
    console.log('[月度任务] 执行完成')

    return NextResponse.json(result)
  } catch (error) {
    console.error('[月度任务] 执行失败:', error);
    result.error = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(result, { status: 500 });
  }
}

/**
 * 为单个用户执行月度任务（未来扩展用）
 * 目前复用单用户逻辑
 */
async function handleMonthlyTaskForUser(ownerId: string): Promise<MonthlyTaskResult> {
  // TODO: 使用 ownerId 对应的用户配置执行月度任务
  // 目前暂时复用单用户逻辑
  console.log(`[月度任务] 单用户模式执行 (ownerId: ${ownerId})`);
  const response = await handleMonthlyTaskSingleUser();
  return response.json();
}

/**
 * 生成会议文档
 * [修改点5] 适配 V2 结果结构的自进化报告
 */
async function generateMeetingDoc(
  document: any,
  evolution: TagEvolutionResultV2 | null,
  topIssues: TopIssue[] | null
): Promise<{ documentId: string; url: string }> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const title = `NPS 月度分析会议准备文档 - ${year}年${month}月`;

  // 构建文档内容
  let content = `# ${title}\n\n`;
  content += `生成时间：${now.toLocaleString()}\n\n`;
  content += `---\n\n`;

  // 周期概览
  content += `## 周期概览\n\n`;
  content += `- 分析周期：${year}年${month}月\n`;
  content += `- Top问题数量：${topIssues?.length || 0}\n\n`;

  // 标签自进化报告（V2 结构）
  if (evolution) {
    content += `## 标签自进化报告\n\n`;
    content += `- 执行状态：${evolution.success ? '成功' : '部分失败'}\n`;
    content += `- 分析模式：${evolution.mode === 'full' ? '全量分析' : '高频过滤'}\n`;
    content += `- 总反馈数：${evolution.totalFeedbackCount}\n`;
    content += `- Tag3 合并：${evolution.mergeTag3Count} 组\n`;
    content += `- 拆分生成新 Tag2：${evolution.newTag2Count} 个\n`;
    content += `- Tag2 合并：${evolution.mergeTag2Count} 组\n`;
    content += `- 人工复核项：${evolution.manualReviewItems.length} 项\n\n`;

    if (evolution.error) {
      content += `> ⚠️ 执行异常：${evolution.error}\n\n`;
    }

    if (evolution.manualReviewItems.length > 0) {
      content += `### 人工复核项\n\n`;
      for (const item of evolution.manualReviewItems) {
        content += `- ${item}\n`;
      }
      content += `\n`;
    }
  }

  // Top问题详情
  if (topIssues && topIssues.length > 0) {
    content += `## Top 问题详情\n\n`;
    content += `| 排名 | Tag2 | 人工排序 | 负责人 | 状态 | 迭代周期 |\n`;
    content += `|------|------|----------|--------|------|----------|\n`;

    for (let i = 0; i < Math.min(20, topIssues.length); i++) {
      const issue = topIssues[i];
      content += `| ${i + 1} | ${issue.tag2} | ${issue.manualPriority} | ${issue.owner} | ${issue.status} | ${issue.iterationPeriod} |\n`;
    }
    content += `\n`;
  }

  // 典型反馈（TODO: 从反馈列表中提取）
  content += `## 典型反馈\n\n`;
  content += `（待补充：从反馈列表中提取重要反馈）\n\n`;

  // 关注点
  content += `## 关注点\n\n`;
  content += `（待补充：根据 Top 问题分析关注点）\n\n`;

  // 议程建议
  content += `## 议程建议\n\n`;
  content += `1. 回顾上月 Top 问题处理进展\n`;
  content += `2. 讨论本月 Top 问题\n`;
  content += `3. 制定改进计划\n`;
  content += `4. 其他事项\n\n`;

  // 创建文档
  // ========== 日志：打印会议文档内容预览 ==========
  console.log('\n' + '='.repeat(60))
  console.log('【月分析 - 会议文档内容预览】')
  console.log('='.repeat(60))
  console.log(`📄 标题: ${title}`)
  console.log('\n--- 文档内容（前 500 字）---')
  console.log(content.substring(0, 500) + (content.length > 500 ? '\n...(已截断)' : ''))
  console.log('='.repeat(60) + '\n')
  // ======================================================

  return document.create(title, content);
}
