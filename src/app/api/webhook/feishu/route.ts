/**
 * 飞书Webhook回调处理
 * 接收飞书Bot的群消息事件，处理用户命令
 */

import { NextRequest, NextResponse } from 'next/server';
import { FeishuWebhookEvent, BotCommand } from '@/lib/types';
import { feishuBot, createHelpCard, createAnalysisCard, createFeedbackCard, createOnboardingCard } from '@/lib/feishu/bot';
import { bitableClient, extractMultiSelectFieldValue, parseBitableDate } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS, ANALYSIS_FIELDS } from '@/lib/feishu/constants';
import { handleQuestion } from '@/lib/ai/chatbot';
import { DEFAULT_PAGE_SIZE } from '@/constants/app-constants';

// ============================================
// Webhook处理
// ============================================

/**
 * POST /api/webhook/feishu
 * 接收飞书事件推送
 *
 * 飞书支持两种推送格式：
 * 1. URL验证: { challenge, token, type: "url_verification" }
 * 2. 事件推送: { uuid, event_type, event, token, ts }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Webhook] 收到飞书请求:', JSON.stringify(body).substring(0, 200));

    // ========== 1. URL验证（首次配置Webhook时）==========
    // 飞书校验格式: { challenge, token, type: "url_verification" }
    if (body.type === 'url_verification' && body.challenge) {
      console.log('[Webhook] URL验证请求, challenge:', body.challenge);
      return NextResponse.json({ challenge: body.challenge });
    }

    // ========== 2. 事件推送 ==========
    const event = body as FeishuWebhookEvent;

    if (event.event_type === 'url_verification') {
      // 兼容另一种格式
      return NextResponse.json({ challenge: event.event?.challenge || body.challenge });
    }

    // 处理消息事件
    if (event.event_type === 'im.message.receive_v1') {
      await handleMessageEvent(event);
    }

    // 处理机器人入群事件
    if (event.event_type === 'im.chat.member.bot.added_v1') {
      await handleBotAddedEvent(event);
    }

    // 返回成功响应（飞书要求始终返回成功，避免重试）
    return NextResponse.json({ code: 0, msg: 'success' });
  } catch (error) {
    console.error('[Webhook] 处理飞书事件失败', error);
    return NextResponse.json({ code: 0, msg: 'success' });
  }
}

// ============================================
// 机器人入群事件处理
// ============================================

/**
 * 处理机器人被添加到群聊事件
 * 发送 onboarding 设置说明卡片
 */
async function handleBotAddedEvent(event: FeishuWebhookEvent): Promise<void> {
  const chatId = event.event?.chat_id || '';
  if (!chatId) return;

  console.log('[Webhook] 机器人被添加到群聊:', chatId);

  try {
    // 发送 onboarding 卡片
    await feishuBot.sendCardMessage(chatId, createOnboardingCard());
  } catch (error) {
    console.error('[Webhook] 发送 onboarding 卡片失败', error);
  }
}

// ============================================
// 消息事件处理
// ============================================

/**
 * 处理消息事件
 */
async function handleMessageEvent(event: FeishuWebhookEvent): Promise<void> {
  const message = event.event
  if (!message) return

  // 只处理文本消息
  if (message.message_type !== 'text') return

  const chatId = message.chat_id || ''
  const senderId = message.sender?.sender_id?.open_id || ''
  const messageId = message.message_id || ''

  // 如果没有 chatId，无法发送响应
  if (!chatId) {
    console.warn('[Webhook] 消息缺少 chatId')
    return
  }

  // 解析消息内容
  let content: { text?: string } = {}
  try {
    content = JSON.parse(message.content || '{}')
  } catch {
    console.warn('[Webhook] 消息内容解析失败')
    await feishuBot.sendTextMessage(chatId, '消息格式解析失败，请稍后重试。')
    return
  }

  const text = content.text || ''

  // 检查是否是@Bot的消息
  const isMentioned = message.mentions?.some(
    (m) =>
      m.name.toLowerCase().includes('nps') ||
      m.name.toLowerCase().includes('insight')
  )

  // 清理文本（移除@提及）
  const cleanText = text.replace(/@_user_\d+/g, '').trim()

  // 解析命令（使用清理后的文本）
  const command = parseCommand(cleanText)

  // 如果是 /nps 命令，走命令处理逻辑
  if (command) {
    command.chatId = chatId
    command.senderId = senderId
    command.messageId = messageId
    await executeCommand(command)
    return
  }

  // 如果没@Bot且不是命令，忽略
  if (!isMentioned) return

  // 如果 cleanText 为空（比如只 @ 了 Bot 但没输入文字），忽略
  if (!cleanText) return

  // @Bot 但没有 /nps 命令 → 走自然语言问答
  console.log(`[Webhook] 收到@Bot消息，进入问答模式: ${cleanText}`)

  try {
    // 发送"正在思考"提示
    await feishuBot.sendTextMessage(chatId, '🤔 正在查询数据，请稍候...')

    // 调用问答引擎
    const answer = await handleQuestion(cleanText, {
      chatId,
      senderId,
      messageId
    })

    // 发送回答
    await feishuBot.sendTextMessage(chatId, answer)
  } catch (error) {
    console.error('[Webhook] 问答处理失败', error)
    await feishuBot.sendTextMessage(
      chatId,
      '抱歉，处理您的问题时出错了😅\n请稍后再试，或联系管理员。'
    )
  }
}

// ============================================
// 命令解析
// ============================================

/**
 * 解析用户输入的命令
 * @param text 消息文本
 * @returns 解析后的命令，如果不是命令则返回null
 */
function parseCommand(text: string): BotCommand | null {
  // 移除@提及的文本
  const cleanText = text.replace(/@_user_\d+/g, '').trim();

  // 匹配 /nps 命令
  const match = cleanText.match(/^\/nps\s+(\w+)(?:\s+(.*))?$/i);
  if (!match) return null;

  const command = match[1].toLowerCase();
  const argsText = match[2] || '';
  const args = argsText.split(/\s+/).filter(Boolean);

  return {
    command,
    args,
    originalMessage: cleanText,
    senderId: '',
    chatId: '',
    messageId: '',
  };
}

// ============================================
// 命令执行
// ============================================

/**
 * 执行Bot命令
 */
async function executeCommand(cmd: BotCommand): Promise<void> {
  console.log(`[Webhook] 执行命令: ${cmd.command}, 参数:`, cmd.args);

  switch (cmd.command) {
    case 'help':
      await handleHelp(cmd)
      break
    case 'status':
      await handleStatus(cmd)
      break
    case 'tag':
      await handleTag(cmd)
      break
    case 'report':
      await handleReport(cmd)
      break
    case 'analysis':
      await handleAnalysis(cmd)
      break
    case 'analyze':
      await handleAnalysis(cmd)
      break
    case 'feedback':
      await handleFeedback(cmd)
      break
    case 'config':
      await handleConfig(cmd)
      break
    default:
      await feishuBot.sendTextMessage(
        cmd.chatId,
        `未知命令: ${cmd.command}\n输入 "/nps help" 查看可用命令`
      )
  }
}

/**
 * 帮助命令
 */
async function handleHelp(cmd: BotCommand): Promise<void> {
  await feishuBot.sendCardMessage(cmd.chatId, createHelpCard());
}

/**
 * 报告命令 - 查看最新NPS概况
 */
async function handleReport(cmd: BotCommand): Promise<void> {
  try {
    // 获取最近30天的反馈
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    const recentFeedbacks = records.filter((r) => {
      const createTime = parseBitableDate(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      return createTime && createTime >= thirtyDaysAgo;
    });

    const total = recentFeedbacks.length;
    const promoter = recentFeedbacks.filter((f) => Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]) >= 9).length;
    const passive = recentFeedbacks.filter(
      (f) => {
        const score = Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]);
        return score >= 7 && score <= 8;
      }
    ).length;
    const detractor = recentFeedbacks.filter((f) => Number(f.fields[FEEDBACK_FIELDS.NPS_SCORE]) <= 6).length;
    const npsScore = total > 0 ? Math.round(((promoter - detractor) / total) * 100) : 0;

    await feishuBot.sendCardMessage(
      cmd.chatId,
      createAnalysisCard({
        periodName: '最近30天',
        totalFeedbacks: total,
        npsScore,
        topIssues: ['使用 /nps analysis [周期] 查看详细分析'],
        promoterCount: promoter,
        passiveCount: passive,
        detractorCount: detractor,
      })
    );
  } catch (error) {
    console.error('[Webhook] 生成报告失败', error);
    await feishuBot.sendTextMessage(cmd.chatId, '生成报告失败，请稍后重试');
  }
}

/**
 * 反馈命令 - 查看最新反馈
 */
async function handleFeedback(cmd: BotCommand): Promise<void> {
  const limit = parseInt(cmd.args[0] || '5', 10);

  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: limit,
    });

    if (records.length === 0) {
      await feishuBot.sendTextMessage(cmd.chatId, '暂无反馈数据');
      return;
    }

    // 发送最新反馈卡片
    for (const record of records.slice(0, limit)) {
      const feedback = {
        userName: String(
          record.fields[FEEDBACK_FIELDS.USER_ID] || '匿名用户'
        ),
        module: String(
          record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || '未分类'
        ),
        npsScore: Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0),
        content: String(record.fields[FEEDBACK_FIELDS.CONTENT] || ''),
        // MultiSelect 字段读取后用逗号连接成字符串
        tag1: extractMultiSelectFieldValue(record.fields[FEEDBACK_FIELDS.TAG1]).join(', '),
        tag2: extractMultiSelectFieldValue(record.fields[FEEDBACK_FIELDS.TAG2]).join(', '),
        tag3: extractMultiSelectFieldValue(record.fields[FEEDBACK_FIELDS.TAG3]).join(', ')
      }

      await feishuBot.sendCardMessage(cmd.chatId, createFeedbackCard(feedback));
    }
  } catch (error) {
    console.error('[Webhook] 获取反馈失败', error);
    await feishuBot.sendTextMessage(cmd.chatId, '获取反馈失败，请稍后重试');
  }
}

/**
 * 配置命令 - 查看系统配置
 */
async function handleConfig(cmd: BotCommand): Promise<void> {
  await feishuBot.sendTextMessage(
    cmd.chatId,
    '系统配置请在管理后台查看和修改。\n访问地址: ' + (process.env.VERCEL_URL || 'localhost:3000') + '/admin'
  );
}

/**
 * 状态命令 - 查看当前配置状态和上次执行时间
 */
async function handleStatus(cmd: BotCommand): Promise<void> {
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: DEFAULT_PAGE_SIZE,
    });

    const total = records.length;
    const tagged = records.filter((r) => String(r.fields[FEEDBACK_FIELDS.STATUS]) === '已打标').length;
    const reviewNeeded = records.filter((r) => {
      const val = r.fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
      return val === true || String(val).toLowerCase() === 'true' || String(val).toLowerCase() === '是';
    }).length;
    const needLogCheck = records.filter((r) => {
      const val = r.fields[FEEDBACK_FIELDS.NEED_LOG_CHECK];
      return val === true || String(val).toLowerCase() === 'true' || String(val).toLowerCase() === '是';
    }).length;

    const avgScore = total > 0
      ? (records.reduce((sum, r) => sum + Number(r.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0), 0) / total).toFixed(2)
      : '-';

    await feishuBot.sendTextMessage(
      cmd.chatId,
      `📊 **NPS Insight 状态**\n\n` +
      `总反馈数: ${total}\n` +
      `已打标: ${tagged}\n` +
      `待审核: ${reviewNeeded}\n` +
      `需查日志: ${needLogCheck}\n` +
      `平均分: ${avgScore}\n\n` +
      `配置管理: ${process.env.VERCEL_URL || 'localhost:3000'}/admin`
    );
  } catch (error) {
    console.error('[Webhook] 获取状态失败', error);
    await feishuBot.sendTextMessage(cmd.chatId, '获取状态失败，请稍后重试');
  }
}

/**
 * 打标命令 - 手动触发打标流程
 */
async function handleTag(cmd: BotCommand): Promise<void> {
  try {
    // 调用周度 cron 任务触发打标
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const cronUrl = `${baseUrl}/api/cron/sync`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (process.env.CRON_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`
    }

    const response = await fetch(cronUrl, {
      method: 'POST',
      headers
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await feishuBot.sendTextMessage(
      cmd.chatId,
      '✅ 打标任务已触发，请稍后查看通知群消息。'
    );
  } catch (error) {
    console.error('[Webhook] 触发打标失败', error);
    await feishuBot.sendTextMessage(
      cmd.chatId,
      `触发打标失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}

/**
 * 月度分析命令 - 手动触发月度分析流程
 * 用法：
 *   /nps analyze              - 触发月度分析（标签自进化+Top问题+月报）
 *   /nps analyze 2026-06      - 触发月度分析并指定周期名称
 *   /nps analyze view 2026-06 - 查询已有分析报告
 */
async function handleAnalysis(cmd: BotCommand): Promise<void> {
  const firstArg = cmd.args[0]?.toLowerCase();
  const secondArg = cmd.args[1];

  // /nps analyze view [周期名] - 查询已有报告
  if (firstArg === 'view' || firstArg === '查看') {
    const periodName = secondArg || '最近30天';
    try {
      const analysisRecords = await bitableClient.searchRecords(
        TABLE_NAMES.ANALYSIS,
        ANALYSIS_FIELDS.PERIOD_NAME,
        periodName
      );

      if (analysisRecords.length > 0) {
        const analysis = analysisRecords[0];
        const topIssues = JSON.parse(String(analysis.fields[ANALYSIS_FIELDS.TOP_ISSUES] || '[]'));

        await feishuBot.sendCardMessage(
          cmd.chatId,
          createAnalysisCard({
            periodName: String(analysis.fields[ANALYSIS_FIELDS.PERIOD_NAME]),
            totalFeedbacks: Number(analysis.fields[ANALYSIS_FIELDS.TOTAL_FEEDBACKS]),
            npsScore: Number(analysis.fields[ANALYSIS_FIELDS.NPS_SCORE]),
            topIssues,
            promoterCount: 0,
            passiveCount: 0,
            detractorCount: 0,
          })
        );
      } else {
        await feishuBot.sendTextMessage(
          cmd.chatId,
          `未找到 "${periodName}" 的分析报告。\n请先执行 /nps analyze 生成报告。`
        );
      }
    } catch (error) {
      console.error('[Webhook] 查询分析失败', error);
      await feishuBot.sendTextMessage(cmd.chatId, '查询分析失败，请稍后重试');
    }
    return;
  }

  // /nps analyze [周期名] - 触发月度分析
  try {
    await feishuBot.sendTextMessage(
      cmd.chatId,
      '🔄 月度分析任务已触发，预计需要 30-60 秒。完成后会在群里收到月报通知。'
    );

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const cronUrl = `${baseUrl}/api/cron/monthly`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.CRON_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    }

    const response = await fetch(cronUrl, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    const evolutionCount = result.evolution?.actions?.length || 0;
    const topIssuesCount = result.topIssues?.length || 0;

    await feishuBot.sendTextMessage(
      cmd.chatId,
      `✅ 月度分析完成！\n` +
      `• 标签自进化: ${evolutionCount} 项操作\n` +
      `• Top 问题: ${topIssuesCount} 条\n` +
      `• 公式同步: ${result.formulaSync ? '成功' : '失败'}\n` +
      `• 会议文档: ${result.meetingDoc?.url || '已生成'}\n` +
      `• 通知发送: ${result.notification ? '成功' : '失败'}`
    );
  } catch (error) {
    console.error('[Webhook] 触发月度分析失败', error);
    await feishuBot.sendTextMessage(
      cmd.chatId,
      `触发月度分析失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}
