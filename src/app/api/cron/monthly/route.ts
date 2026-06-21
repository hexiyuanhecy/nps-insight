/**
 * 月度任务 API
 * 执行顺序：标签自进化 → Top问题生成 → 公式同步 → 会议文档 → 通知
 */

import { NextRequest, NextResponse } from 'next/server';
import { TagEvolution } from '@/lib/ai/tag-evolution';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';
import { FormulaSync } from '@/lib/analysis/formula-sync';
import { getDefaultStorage, getDefaultNotification, getDefaultDocument } from '@/lib/adapter-factory';
import { EvolutionReport } from '@/lib/ai/tag-evolution';
import { TopIssue } from '@/lib/analysis/top-issues';
import { createMonthlyReportCard } from '@/lib/feishu/bot';

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
  
  const result: MonthlyTaskResult = {
    success: false,
    timestamp: Date.now(),
    evolution: null,
    topIssues: null,
    formulaSync: false,
    meetingDoc: null,
    notification: false,
  };
  
  try {
    const storage = getDefaultStorage();
    const notification = getDefaultNotification();
    const document = getDefaultDocument();
    
    // 1. 标签自进化（先执行）
    console.log('[月度任务] 步骤1：标签自进化');
    const tagEvolution = new TagEvolution(storage);
    result.evolution = await tagEvolution.execute();
    
    // 2. Top问题生成（基于历史+本月数据）
    console.log('[月度任务] 步骤2：Top问题生成');
    const topIssuesGenerator = new TopIssuesGenerator(storage);
    
    // 获取当前权重配置
    const formulaSync = new FormulaSync(storage);
    const weights = await formulaSync.getWeights();
    topIssuesGenerator.setWeights(weights);
    
    result.topIssues = await topIssuesGenerator.generate();
    
    // 写入 Top问题表
    await topIssuesGenerator.writeToTable(result.topIssues);
    
    // 3. 公式同步（以用户调整为准）
    console.log('[月度任务] 步骤3：公式同步');
    await formulaSync.sync();
    result.formulaSync = true;
    
    // 4. 生成会议文档
    console.log('[月度任务] 步骤4：生成会议文档');
    result.meetingDoc = await generateMeetingDoc(document, result.evolution, result.topIssues);
    
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