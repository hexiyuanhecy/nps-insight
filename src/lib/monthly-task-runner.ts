/**
 * 月度任务核心逻辑
 * 抽离出来供内部直接调用，避免 HTTP fetch 的端口问题
 */
import { runTagEvolutionV2, TagEvolutionResultV2 } from '@/lib/ai/tag-evolution-v2';
import { TopIssuesGenerator } from '@/lib/analysis/top-issues';
import { FormulaSync } from '@/lib/analysis/formula-sync';
import { getDefaultStorage, getDefaultNotification, getDefaultDocument, AdapterFactory } from '@/lib/adapter-factory';
import { TopIssue, SortWeights } from '@/lib/analysis/top-issues';
import { createMonthlyReportCard } from '@/lib/feishu/bot';
import { listAllConfigKeys, getConfig } from '@/lib/storage/kv-storage';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { createUserResourceStore } from '@/lib/storage/user-resource-store';
import { refreshAccessToken } from '@/lib/feishu/user-auth';
import { getCurrentTimestampSeconds } from '@/constants/app-constants';
import { StorageAdapter, TABLES } from '@/lib/storage/base-storage';
import { DEFAULT_PAGE_SIZE } from '@/constants/app-constants';

/**
 * 月度任务执行结果
 */
export interface MonthlyTaskResult {
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
 * 生成会议文档
 */
async function generateMeetingDoc(
  document: any,
  evolution: TagEvolutionResultV2 | null,
  topIssues: TopIssue[] | null,
  folderToken?: string,
  storage?: StorageAdapter
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

    // Tag3 合并详情
    if (evolution.mergeTag3Details && evolution.mergeTag3Details.length > 0) {
      content += `### Tag3 合并详情\n\n`;
      for (const detail of evolution.mergeTag3Details) {
        content += `- **合并标签**：${detail.tagNames.join(' + ')}\n`;
        content += `  **保留标签**：${detail.retainTagName}\n`;
        content += `  **合并原因**：${detail.reason}\n\n`;
      }
    }

    // Tag3 拆分详情
    if (evolution.splitTag3Details && evolution.splitTag3Details.length > 0) {
      content += `### Tag3 拆分详情\n\n`;
      for (const detail of evolution.splitTag3Details) {
        content += `- **原 Tag2**：${detail.originTag2Name}\n`;
        content += `  **新 Tag2**：${detail.newTag2Name}\n`;
        content += `  **拆分出的 Tag3**：${detail.tag3Names.join('、')}\n\n`;
      }
    }

    // Tag2 合并详情
    if (evolution.mergeTag2Details && evolution.mergeTag2Details.length > 0) {
      content += `### Tag2 合并详情\n\n`;
      for (const detail of evolution.mergeTag2Details) {
        content += `- **合并标签**：${detail.tagNames.join(' + ')}\n`;
        content += `  **保留标签**：${detail.retainTagName}\n`;
        content += `  **合并原因**：${detail.reason}\n\n`;
      }
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
    content += `| 排名 | 所属模块 | Tag2 | Tag3 | 反馈数 | 大租户占比 | 负责人 | 状态 | 迭代周期 |\n`;
    content += `|------|----------|------|------|--------|-----------|--------|------|----------|\n`;

    for (let i = 0; i < Math.min(30, topIssues.length); i++) {
      const issue = topIssues[i];
      const ratio = issue.largeTenantRatio ? `${Math.round(issue.largeTenantRatio * 100)}%` : '0%';
      content += `| ${issue.index} | ${issue.module || '-'} | ${issue.tag2} | ${issue.tag3 || '-'} | ${issue.totalCount} | ${ratio} | ${issue.owner || '-'} | ${issue.status} | ${issue.iterationPeriod} |\n`;
    }
    content += `\n`;
  }

  // 典型反馈：从反馈表提取每个 Top Tag2 的真实反馈内容
  content += `## 典型反馈\n\n`;
  if (topIssues && topIssues.length > 0 && storage) {
    const topTag2s = topIssues.slice(0, 5).map(i => i.tag2);
    // 查询全部反馈，按 Tag2 筛选
    let allFeedbacks: Array<{ fields: Record<string, unknown>; record_id: string }> = [];
    try {
      const records = await storage.listRecords(TABLES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });
      allFeedbacks = records as Array<{ fields: Record<string, unknown>; record_id: string }>;
    } catch (e) {
      console.warn('[月度文档] 查询反馈数据失败:', e);
    }

    for (const tag2 of topTag2s) {
      content += `### ${tag2}\n\n`;
      // 筛选该 Tag2 的反馈
      const matched = allFeedbacks.filter(record => {
        const tag2Val = record.fields[FEEDBACK_FIELDS.TAG2];
        if (Array.isArray(tag2Val)) {
          return tag2Val.some((v: unknown) => String(v) === tag2 || String(v).includes(tag2));
        }
        return String(tag2Val || '') === tag2 || String(tag2Val || '').includes(tag2);
      });

      if (matched.length > 0) {
        // 取前 3 条反馈，优先取低分反馈
        const sorted = matched.sort((a, b) => {
          const scoreA = Number(a.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
          const scoreB = Number(b.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
          return scoreA - scoreB;
        });
        for (const fb of sorted.slice(0, 3)) {
          const score = fb.fields[FEEDBACK_FIELDS.NPS_SCORE] || '-';
          const text = String(fb.fields[FEEDBACK_FIELDS.CONTENT] || fb.fields[FEEDBACK_FIELDS.TRANSLATED_CONTENT] || '');
          const displayText = text.substring(0, 200);
          content += `- [评分:${score}] ${displayText}\n`;
        }
      } else {
        content += `- （暂无匹配反馈）\n`;
      }
      content += `\n`;
    }
  } else {
    content += `（暂无数据：请从反馈列表中提取典型反馈）\n\n`;
  }

  // 关注点
  content += `## 关注点\n\n`;
  if (topIssues && topIssues.length > 0) {
    const top3Issues = topIssues.slice(0, 3);
    for (let i = 0; i < top3Issues.length; i++) {
      const issue = top3Issues[i];
      content += `${i + 1}. **${issue.tag2}**：当前状态为「${issue.status}」，建议重点关注并确认负责人\n`;
    }

    if (evolution) {
      if (evolution.mergeTag3Count > 0) {
        content += `${top3Issues.length + 1}. **标签合并**：本月共合并 ${evolution.mergeTag3Count} 组 Tag3，需确认合并合理性\n`;
      }
      if (evolution.newTag2Count > 0) {
        content += `${top3Issues.length + 2}. **新标签**：新增 ${evolution.newTag2Count} 个 Tag2，需确认分类准确性\n`;
      }
    }
  } else {
    content += `（暂无数据：根据 Top 问题分析关注点）\n\n`;
  }

  // 议程建议
  content += `## 议程建议\n\n`;
  content += `1. 标签自进化结果复盘\n`;
  content += `2. Top 问题对齐与负责人确认\n`;
  content += `3. 重点问题深度讨论\n`;
  content += `4. 下月迭代计划\n\n`;

  // 调试信息
  console.log('='.repeat(60));
  console.log('【会议文档预览】');
  console.log('='.repeat(60));
  console.log(`标题: ${title}`);
  console.log(`文件夹Token: ${folderToken || '(无，根目录创建)'}`);
  console.log('\n--- 文档内容（前 500 字）---');
  console.log(content.substring(0, 500) + (content.length > 500 ? '\n...(已截断)' : ''));
  console.log('='.repeat(60) + '\n');

  return document.create(title, content, folderToken);
}

/**
 * 单用户月度任务执行核心逻辑
 */
async function runMonthlyTaskSingleUser(): Promise<MonthlyTaskResult> {
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

  try {
    const storage = getDefaultStorage();
    const notification = getDefaultNotification();

    // 获取用户资源，尝试用用户身份创建文档
    const userResourceStore = createUserResourceStore();
    const userResource = await userResourceStore.get();
    const monthFolderToken = userResource?.monthFolderToken;

    // 获取有效的用户 access_token
    let userAccessToken: string | null = null;
    let userRefreshToken = userResource?.refreshToken;
    let tokenExpiresAt = userResource?.tokenExpiresAt;

    // 尝试获取有效token
    if (userResourceStore.getValidAccessToken) {
      userAccessToken = await userResourceStore.getValidAccessToken();
    } else {
      userAccessToken = userResource?.userAccessToken || null;
    }

    // 如果token无效，尝试刷新
    if (!userAccessToken && userRefreshToken) {
      console.log('[月度任务] 用户Token无效，尝试刷新...');
      try {
        const newToken = await refreshAccessToken(userRefreshToken);
        if (newToken) {
          userAccessToken = newToken.access_token;
          tokenExpiresAt = getCurrentTimestampSeconds() + newToken.expires_in;
          console.log('[月度任务] Token刷新成功');

          // 保存新token到存储
          try {
            if (userResourceStore.save) {
              await userResourceStore.save({
                ...(userResource || {} as any),
                userAccessToken: newToken.access_token,
                refreshToken: newToken.refresh_token || userRefreshToken,
                tokenExpiresAt: getCurrentTimestampSeconds() + newToken.expires_in,
              });
              console.log('[月度任务] 新Token已保存到存储');
            }
          } catch (saveErr) {
            console.warn('[月度任务] 保存Token失败:', saveErr instanceof Error ? saveErr.message : '未知错误');
          }
        }
      } catch (refreshErr) {
        console.warn('[月度任务] Token刷新失败，使用应用身份:', refreshErr instanceof Error ? refreshErr.message : '未知错误');
      }
    }

    // 创建文档适配器：优先用户身份，回退到应用身份
    let document: any;
    if (userAccessToken) {
      try {
        document = AdapterFactory.createDocument('feishu', {
          userAccessToken,
          userRefreshToken,
          tokenExpiresAt,
        });
        console.log('[月度任务] 使用用户身份创建文档');
      } catch (createErr) {
        console.warn('[月度任务] 用户身份创建文档失败，使用应用身份:', createErr instanceof Error ? createErr.message : '未知错误');
        document = getDefaultDocument();
      }
    } else {
      document = getDefaultDocument();
      console.log('[月度任务] 使用应用身份创建文档（无用户Token）');
    }

    // 1. 标签自进化
    console.log('[月度任务] 步骤1：标签自进化（V2）');
    try {
      result.evolution = await runTagEvolutionV2();
      console.log(`✅ 标签自进化完成`);
    } catch (evoErr) {
      console.error('[月度任务] 标签自进化失败:', evoErr);
    }

    // 2. 公式同步 + 读取权重（前移：用户调整的权重需反哺到本次 Top 问题排序）
    console.log('[月度任务] 步骤2：公式同步 + 读取权重');
    let currentWeights: SortWeights = { count: 0.5, largeTenant: 0.3, quality: 0.2 };
    try {
      const formulaSync = new FormulaSync(storage);
      // 先同步（用户在多维表格调整的公式 → 系统存储）
      await formulaSync.sync();
      // 再读取最新权重，供 Top 问题排序使用
      currentWeights = await formulaSync.getWeights();
      result.formulaSync = true;
      console.log('✅ 公式同步完成，当前权重:', currentWeights);
    } catch (formulaErr) {
      console.error('[月度任务] 公式同步失败:', formulaErr);
    }

    // 3. Top问题生成（注入反哺权重）
    console.log('[月度任务] 步骤3：Top问题生成（使用反哺权重）');
    try {
      const generator = new TopIssuesGenerator(storage);
      // 注入从 FormulaSync 读取的权重，使 Top 问题排序遵循用户配置
      generator.setWeights(currentWeights);
      const topIssues = await generator.generate();
      result.topIssues = topIssues;
      console.log(`✅ Top问题生成完成，共 ${topIssues.length} 个`);

      // 写入 Top 问题表到飞书多维表格
      try {
        await generator.writeToTable(topIssues);
        console.log('✅ Top问题表写入完成');
      } catch (writeErr) {
        console.error('[月度任务] Top问题表写入失败:', writeErr);
      }
    } catch (topErr) {
      console.error('[月度任务] Top问题生成失败:', topErr);
    }

    // 4. 生成会议文档
    console.log('[月度任务] 步骤4：生成会议文档');
    try {
      result.meetingDoc = await generateMeetingDoc(
        document,
        result.evolution,
        result.topIssues || [],
        monthFolderToken,
        storage
      );
      console.log(`✅ 会议文档生成成功: ${result.meetingDoc.documentId}`);
    } catch (docErr) {
      console.error('[月度任务] 会议文档生成失败:', docErr);
    }

    // 5. 发送通知
    console.log('[月度任务] 步骤5：发送通知');
    try {
      let notificationChannels =
        process.env.NOTIFICATION_CHANNELS?.split(',').filter(Boolean) || [];
      if (notificationChannels.length === 0 && process.env.NOTIFICATION_CHAT_ID) {
        notificationChannels = [process.env.NOTIFICATION_CHAT_ID];
      }
      if (notificationChannels.length > 0) {
        const topIssueUrl = process.env.FEISHU_BITABLE_URL || process.env.BITABLE_URL || '';
        const dashboardUrl = process.env.DASHBOARD_URL || '';
        const now = new Date();
        // 将 TopIssue 转换为卡片需要的格式
        const cardTopIssues = (result.topIssues || []).slice(0, 5).map(issue => ({
          tag3: issue.tag3 || '-',
          tag2: issue.tag2,
          count: issue.totalCount,
          largeTenantRatio: issue.largeTenantRatio,
          avgScore: issue.avgScore,
        }));
        const card = createMonthlyReportCard({
          periodName: `${now.getFullYear()}年${now.getMonth() + 1}月`,
          totalFeedbacks: result.evolution?.totalFeedbackCount || 0,
          topIssueUrl,
          documentUrl: result.meetingDoc?.url || '',
          dashboardUrl,
          mergeCount: result.evolution ? result.evolution.mergeTag3Count + result.evolution.mergeTag2Count : 0,
          splitCount: result.evolution ? result.evolution.newTag2Count : 0,
          topIssues: cardTopIssues,
        });
        await notification.sendToMultiple(notificationChannels, card);
        result.notification = true;
        console.log('✅ 通知发送成功');
      }
    } catch (notifyErr) {
      console.error('[月度任务] 通知发送失败:', notifyErr);
    }

    result.success = true;
    console.log('[月度任务] 执行完成');
  } catch (error) {
    console.error('[月度任务] 执行失败:', error);
    result.error = error instanceof Error ? error.message : '未知错误';
  }

  return result;
}

/**
 * 按用户 ID 执行月度任务
 */
async function runMonthlyTaskForUser(ownerId: string): Promise<MonthlyTaskResult> {
  console.log(`[月度任务] 执行用户任务: ${ownerId}`);
  // TODO: 根据 ownerId 加载配置并执行
  // 目前暂时复用单用户逻辑
  return runMonthlyTaskSingleUser();
}

/**
 * 执行月度任务（多用户支持）
 * 供内部直接调用
 */
export async function runMonthlyTask(): Promise<MonthlyTaskResult> {
  try {
    const configKeys = await listAllConfigKeys();

    if (configKeys.length > 0) {
      console.log(`[月度任务] 发现 ${configKeys.length} 个用户配置`);

      const results: MonthlyTaskResult[] = [];
      for (const key of configKeys) {
        const ownerId = key.replace('config:', '');
        try {
          const userResult = await runMonthlyTaskForUser(ownerId);
          results.push(userResult);
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

      // 返回第一个结果（与原逻辑一致）
      return results[0] || {
        success: true,
        timestamp: Date.now(),
        evolution: null,
        topIssues: null,
        formulaSync: true,
        meetingDoc: null,
        notification: true,
      };
    }
  } catch (kvErr) {
    console.warn('[月度任务] KV读取失败，使用单用户模式:', kvErr instanceof Error ? kvErr.message : '未知错误');
  }

  // 回退到单用户模式
  return runMonthlyTaskSingleUser();
}
