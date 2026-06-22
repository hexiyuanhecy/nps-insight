/**
 * 月度任务 API
 * 执行顺序：标签自进化 → Top问题生成 → 公式同步 → 会议文档 → 通知
 *
 * 多用户支持：
 * - 遍历所有 KV 中的配置，为每个用户执行月度任务
 * - 若无 KV 配置，回退到环境变量配置（向后兼容）
 */

import { NextRequest, NextResponse } from 'next/server';
import { TagEvolution } from '@/lib/ai/tag-evolution';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';
import { FormulaSync } from '@/lib/analysis/formula-sync';
import { getDefaultStorage, getDefaultNotification, getDefaultDocument } from '@/lib/adapter-factory';
import { EvolutionReport } from '@/lib/ai/tag-evolution';
import { TopIssue } from '@/lib/analysis/top-issues';
import { createMonthlyReportCard } from '@/lib/feishu/bot';
import { listAllConfigKeys, getConfig } from '@/lib/storage/kv-storage';

/**
 * 月度任务执行结果
 */
interface MonthlyTaskResult {
  success: boolean;
  timestamp: number;
  evolution: EvolutionReport | null;
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

    result.evolution = {
      timestamp: Date.now(),
      duplicates: [],
      splittables: [],
      coldTags: [],
      hotTags: [],
      actions: [],
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
    const storage = getDefaultStorage();
    const notification = getDefaultNotification();
    const document = getDefaultDocument();

    // 1. 标签自进化（先执行）
    console.log('[月度任务] 步骤1：标签自进化');
    try {
      const tagEvolution = new TagEvolution(storage);
      result.evolution = await tagEvolution.execute();
    } catch (evoErr) {
      console.error('[月度任务] 标签自进化失败，跳过:', evoErr);
      result.evolution = { duplicates: [], splittables: [], coldTags: [], hotTags: [], actions: [], timestamp: Date.now() };
    }

    // 2. Top问题生成（基于历史+本月数据）
    console.log('[月度任务] 步骤2：Top问题生成');
    try {
      const topIssuesGenerator = new TopIssuesGenerator(storage);

      // 获取当前权重配置
      const formulaSync = new FormulaSync(storage);
      const weights = await formulaSync.getWeights();
      topIssuesGenerator.setWeights(weights);

      result.topIssues = await topIssuesGenerator.generate();

      // 写入 Top问题表
      await topIssuesGenerator.writeToTable(result.topIssues);
    } catch (topErr) {
      console.error('[月度任务] Top问题生成失败，跳过:', topErr);
    }

    // 3. 公式同步（以用户调整为准）
    console.log('[月度任务] 步骤3：公式同步');
    try {
      const formulaSync = new FormulaSync(storage);
      await formulaSync.sync();
      result.formulaSync = true;
    } catch (fmtErr) {
      console.error('[月度任务] 公式同步失败:', fmtErr);
    }

    // 4. 生成会议文档
    console.log('[月度任务] 步骤4：生成会议文档');
    try {
      result.meetingDoc = await generateMeetingDoc(document, result.evolution, result.topIssues || []);
    } catch (docErr) {
      console.error('[月度任务] 会议文档生成失败:', docErr);
    }
    
    // 5. 发送通知
    console.log('[月度任务] 步骤5：发送通知');
    const now = new Date();
    const periodName = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    const notificationChannels = process.env.NOTIFICATION_CHANNELS?.split(',') || [];
    if (notificationChannels.length > 0) {
      const card = createMonthlyReportCard({
        periodName,
        topIssueUrl: process.env.FEISHU_BITABLE_URL || '',
        documentUrl: result.meetingDoc?.url,
        dashboardUrl: process.env.FEISHU_DASHBOARD_URL || '',
        mergeCount: result.evolution?.duplicates.length || 0,
        splitCount: result.evolution?.splittables.length || 0,
        topIssues: (result.topIssues || []).map((issue: any) => ({
          tag3: issue.tag3Names?.join(', ') || '',
          tag2: issue.tag2Name || '',
          count: issue.totalCount || 0,
          largeTenantRatio: issue.largeTenantRatio || 0,
        })),
      });
      await notification.sendToMultiple(notificationChannels, card);
      result.notification = true;
    }
    
    result.success = true;
    console.log('[月度任务] 执行完成');
    
    return NextResponse.json(result);
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
 */
async function generateMeetingDoc(
  document: any,
  evolution: EvolutionReport | null,
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
  
  // 标签自进化报告
  if (evolution) {
    content += `## 标签自进化报告\n\n`;
    content += `- 检测到重复标签：${evolution.duplicates.length} 组\n`;
    content += `- 检测到可拆分标签：${evolution.splittables.length} 个\n`;
    content += `- 冷门标签：${evolution.coldTags.length} 个（保留不处理）\n`;
    content += `- 热门标签：${evolution.hotTags.length} 个\n\n`;
    
    if (evolution.duplicates.length > 0) {
      content += `### 重复标签详情\n\n`;
      for (const dup of evolution.duplicates) {
        content += `- ${dup.tags[0].fields.name} 与 ${dup.tags[1].fields.name}（相似度 ${dup.similarity.toFixed(2)}）\n`;
      }
      content += `\n`;
    }
    
    if (evolution.splittables.length > 0) {
      content += `### 可拆分标签详情\n\n`;
      for (const split of evolution.splittables) {
        content += `- ${split.tag.fields.name}：${split.suggestion}\n`;
      }
      content += `\n`;
    }
  }
  
  // Top问题详情
  if (topIssues && topIssues.length > 0) {
    content += `## Top 问题详情\n\n`;
    content += `| 排名 | Tag1 | Tag2 | Tag3 | 数量 | 大租户占比 | 平均分 | 综合评分 |\n`;
    content += `|------|------|------|------|------|------------|--------|----------|\n`;
    
    for (let i = 0; i < Math.min(20, topIssues.length); i++) {
      const issue = topIssues[i];
      content += `| ${i + 1} | ${issue.tag2Name} | ${issue.tag3Names.join(', ')} | ${issue.totalCount} | ${(issue.largeTenantRatio * 100).toFixed(1)}% | ${issue.avgScore.toFixed(1)} | ${issue.largeTenantCount} |\n`;
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
  return document.create(title, content);
}