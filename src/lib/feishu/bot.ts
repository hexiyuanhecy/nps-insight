/**
 * 飞书Bot消息发送模块
 * 支持发送文本消息、富文本消息、交互式卡片消息
 */

import { getFeishuClient } from './client';

/** 生成 UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================
// 类型定义
// ============================================

/** 消息类型 */
export type MessageType = 'text' | 'post' | 'interactive';

/** 文本消息内容 */
export interface TextMessageContent {
  text: string;
}

/** 富文本消息内容 */
export interface PostMessageContent {
  post: {
    zh_cn?: {
      title: string;
      content: Array<Array<{ tag: string; text?: string; href?: string; user_id?: string }>>;
    };
  };
}

/** 交互式卡片消息内容 */
export interface InteractiveMessageContent {
  config?: {
    wide_screen_mode?: boolean;
    enable_forward?: boolean;
  };
  header?: {
    title: {
      tag: 'plain_text' | 'lark_md';
      content: string;
    };
    template?: string;
  };
  elements: Array<Record<string, unknown>>;
}

/** 消息发送选项 */
export interface SendMessageOptions {
  /** 接收者ID（用户open_id或chat_id） */
  receiveId: string;
  /** 接收者类型：'open_id' | 'chat_id' */
  receiveIdType?: 'open_id' | 'chat_id' | 'email' | 'user_id';
  /** 消息类型 */
  msgType: MessageType;
  /** 消息内容 */
  content: TextMessageContent | PostMessageContent | InteractiveMessageContent;
  /** 父消息ID（用于回复） */
  replyInThread?: boolean;
  rootId?: string;
}

// ============================================
// 消息发送
// ============================================

/**
 * 发送消息
 * @param options 消息选项
 * @returns 消息ID
 */
export async function sendMessage(options: SendMessageOptions): Promise<string> {
  const client = getFeishuClient();

  try {
    const response = await client.im.message.create({
      params: {
        receive_id_type: options.receiveIdType || 'chat_id',
      },
      data: {
        receive_id: options.receiveId,
        msg_type: options.msgType,
        content: JSON.stringify(options.content),
        uuid: generateUUID(),
      },
    });

    if (response.code !== 0) {
      throw new Error(`发送消息失败: ${response.msg}`);
    }

    const messageId = response.data?.message_id;
    console.log(`[Bot] 消息发送成功，MessageID: ${messageId}`);
    return messageId || '';
  } catch (error) {
    console.error('[Bot] 发送消息失败', error);
    throw error;
  }
}

/**
 * 发送文本消息
 * @param receiveId 接收者ID
 * @param text 文本内容
 * @param receiveIdType 接收者类型
 * @returns 消息ID
 */
export async function sendTextMessage(
  receiveId: string,
  text: string,
  receiveIdType: 'open_id' | 'chat_id' = 'chat_id'
): Promise<string> {
  return sendMessage({
    receiveId,
    receiveIdType,
    msgType: 'text',
    content: { text },
  });
}

/**
 * 发送富文本消息
 * @param receiveId 接收者ID
 * @param title 标题
 * @param content 内容段落
 * @param receiveIdType 接收者类型
 * @returns 消息ID
 */
export async function sendPostMessage(
  receiveId: string,
  title: string,
  content: string,
  receiveIdType: 'open_id' | 'chat_id' = 'chat_id'
): Promise<string> {
  return sendMessage({
    receiveId,
    receiveIdType,
    msgType: 'post',
    content: {
      post: {
        zh_cn: {
          title,
          content: [[{ tag: 'text', text: content }]],
        },
      },
    },
  });
}

/**
 * 发送交互式卡片消息
 * @param receiveId 接收者ID
 * @param card 卡片内容
 * @param receiveIdType 接收者类型
 * @returns 消息ID
 */
export async function sendCardMessage(
  receiveId: string,
  card: InteractiveMessageContent,
  receiveIdType: 'open_id' | 'chat_id' = 'chat_id'
): Promise<string> {
  return sendMessage({
    receiveId,
    receiveIdType,
    msgType: 'interactive',
    content: card,
  });
}

// ============================================
// 预设卡片模板
// ============================================

/**
 * 创建NPS反馈通知卡片
 * @param feedback 反馈信息
 * @returns 卡片内容
 */
export function createFeedbackCard(feedback: {
  userName: string;
  module: string;
  npsScore: number;
  content: string;
  summary?: string;
  suggestions?: string;
  priority?: string;
}): InteractiveMessageContent {
  const npsColor = feedback.npsScore >= 9 ? 'green' : feedback.npsScore >= 7 ? 'yellow' : 'red';
  const priorityColor =
    feedback.priority === 'urgent'
      ? 'red'
      : feedback.priority === 'high'
      ? 'orange'
      : feedback.priority === 'medium'
      ? 'blue'
      : 'grey';

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      title: {
        tag: 'lark_md',
        content: `**新NPS反馈 - ${feedback.module}**`,
      },
      template: npsColor,
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**用户：** ${feedback.userName}\n**NPS评分：** ${feedback.npsScore}/10\n**优先级：** <text_tag color='${priorityColor}'>${feedback.priority || 'medium'}</text_tag>`,
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**反馈内容：**\n${feedback.content}`,
        },
      },
      ...(feedback.summary
        ? [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `**AI摘要：**\n${feedback.summary}`,
              },
            },
          ]
        : []),
      ...(feedback.suggestions
        ? [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `**AI建议：**\n${feedback.suggestions}`,
              },
            },
          ]
        : []),
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '查看详情',
            },
            type: 'primary',
            value: {
              action: 'view_feedback',
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '标记已处理',
            },
            type: 'default',
            value: {
              action: 'mark_resolved',
            },
          },
        ],
      },
    ],
  };
}

/**
 * 创建NPS分析报告卡片（增强版）
 * 包含评分分布可视化图表、标签链接、多按钮等
 * @param analysis 分析数据
 * @returns 卡片内容
 */
export function createAnalysisCard(analysis: {
  periodName: string;
  totalFeedbacks: number;
  npsScore: number;
  avgScore?: number;
  topIssues: string[];
  promoterCount: number;
  passiveCount: number;
  detractorCount: number;
  scoreDistribution?: { score: number; count: number }[];
  tagStats?: { tag: string; count: number; percentage: number }[];
  bitableUrl?: string;
}): InteractiveMessageContent {
  const total = analysis.totalFeedbacks || 1;
  const promoterPct = Math.round((analysis.promoterCount / total) * 100);
  const passivePct = Math.round((analysis.passiveCount / total) * 100);
  const detractorPct = Math.round((analysis.detractorCount / total) * 100);

  // 始终使用蓝色模板，避免红色警告观感
  const npsColor = 'blue';

  const adminUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3001';
  const bitableUrl = analysis.bitableUrl || `${adminUrl}/admin`;

  // 构建评分分布进度条
  const distributionElements: Record<string, unknown>[] = [];
  if (analysis.scoreDistribution && analysis.scoreDistribution.length > 0) {
    // 按分数从高到低排序
    const scores = analysis.scoreDistribution.sort((a, b) => b.score - a.score);
    const maxCount = Math.max(...scores.map((s) => s.count), 1);

    // 使用 column_set 两列布局
    scores.forEach((s) => {
      const pct = Math.round((s.count / total) * 100);
      const barWidth = Math.max(Math.round((s.count / maxCount) * 100), 5);

      // 颜色根据分数
      let barColor = 'grey';
      if (s.score >= 4) barColor = 'green';
      else if (s.score === 3) barColor = 'yellow';
      else barColor = 'red';

      distributionElements.push({
        tag: 'column_set',
        flex_mode: 'none',
        background_style: 'default',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            vertical_align: 'center',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'lark_md',
                  content: `${s.score}分`,
                },
              },
            ],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 5,
            vertical_align: 'center',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'lark_md',
                  content: `${s.count}条 (${pct}%)`,
                },
              },
            ],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 2,
            vertical_align: 'center',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'lark_md',
                  content: `${'▬'.repeat(Math.max(Math.floor(barWidth / 10), 1))}`,
                },
              },
            ],
          },
        ],
      });
    });
  }

  // TOP 问题标签按钮
  const topIssueButtons: Record<string, unknown>[] = analysis.topIssues.slice(0, 5).map((issue) => {
    return {
      tag: 'button',
      text: {
        tag: 'plain_text',
        content: issue.length > 12 ? issue.substring(0, 12) + '..' : issue,
      },
      type: 'default',
      value: {
        action: 'query_tag',
        tag: issue,
      },
    };
  });

  // 元素数组
  const elements: Record<string, unknown>[] = [
    // === 概览指标（列布局）===
    {
      tag: 'column_set',
      flex_mode: 'none',
      background_style: 'default',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `📊 **${analysis.totalFeedbacks}**\n总反馈`,
              },
            },
          ],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `🏆 **${analysis.npsScore}**\nNPS得分`,
              },
            },
          ],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `⭐ **${analysis.avgScore || '-'}**\n平均分`,
              },
            },
          ],
        },
      ],
    },
    {
      tag: 'hr',
    },
    // === 评分分布（带进度条）===
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '**📈 评分分布**',
      },
    },
    // 推荐者/被动者/贬损者概览
    {
      tag: 'column_set',
      flex_mode: 'none',
      background_style: 'default',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `😊 **${analysis.promoterCount}**\n推荐者\n${promoterPct}%`,
              },
            },
          ],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `😐 **${analysis.passiveCount}**\n被动者\n${passivePct}%`,
              },
            },
          ],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `😞 **${analysis.detractorCount}**\n贬损者\n${detractorPct}%`,
              },
            },
          ],
        },
      ],
    },
    // 各分数详细柱状图
    ...distributionElements,
    {
      tag: 'hr',
    },
    // === TOP问题 ===
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**🔥 TOP问题分析**\n${analysis.topIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`,
      },
    },
    // TOP问题标签按钮
    ...(topIssueButtons.length > 0
      ? [
          {
            tag: 'action',
            actions: topIssueButtons.slice(0, 3),
          },
        ]
      : []),
    ...(topIssueButtons.length > 3
      ? [
          {
            tag: 'action',
            actions: topIssueButtons.slice(3, 5),
          },
        ]
      : []),
  ];

  // 标签统计
  if (analysis.tagStats && analysis.tagStats.length > 0) {
    elements.push(
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '**🏷️ 标签概览**',
        },
      }
    );
    analysis.tagStats.slice(0, 4).forEach((t) => {
      elements.push({
        tag: 'column_set',
        flex_mode: 'none',
        background_style: 'default',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 3,
            vertical_align: 'center',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'lark_md',
                  content: t.tag.length > 8 ? t.tag.substring(0, 8) + '..' : t.tag,
                },
              },
            ],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 4,
            vertical_align: 'center',
            elements: [
              {
                tag: 'div',
                text: {
                  tag: 'lark_md',
                  content: `${t.count}条 (${t.percentage}%)`,
                },
              },
            ],
          },
        ],
      });
    });
  }

  // 底部操作按钮
  elements.push(
    {
      tag: 'hr',
    },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '📊 查看多维表格',
          },
          type: 'primary',
          multi_url: {
            url: bitableUrl,
            pc_url: bitableUrl,
            android_url: bitableUrl,
            ios_url: bitableUrl,
          },
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '❓ 向机器人提问',
          },
          type: 'default',
          value: {
            action: 'show_help',
          },
        },
      ],
    },
    {
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `📅 ${analysis.periodName} · 艾特我提问获取更多洞察`,
        },
      ],
    }
  );

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      title: {
        tag: 'lark_md',
        content: `**📊 NPS分析报告 - ${analysis.periodName}**`,
      },
      template: npsColor,
    },
    elements,
  };
}

/**
 * 创建评分分布可视化卡片（独立卡片，用于展示详细分布）
 */
export function createScoreDistributionCard(data: {
  distribution: { score: number; count: number }[];
  total: number;
}): InteractiveMessageContent {
  const total = data.total || 1;
  const maxCount = Math.max(...data.distribution.map((d) => d.count), 1);

  const columns: Record<string, unknown>[] = data.distribution
    .sort((a, b) => b.score - a.score)
    .map((d) => {
      const pct = Math.round((d.count / total) * 100);
      const barH = Math.max(Math.round((d.count / maxCount) * 8), 1);
      let color = 'grey';
      if (d.score >= 4) color = 'green';
      else if (d.score === 3) color = 'yellow';
      else color = 'red';

      return {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        vertical_align: 'bottom',
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `${d.count}`,
            },
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: '█'.repeat(barH),
            },
          },
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `${d.score}分`,
            },
          },
        ],
      };
    });

  return {
    config: {
      wide_screen_mode: false,
    },
    header: {
      title: {
        tag: 'lark_md',
        content: '**📈 评分分布详情**',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'column_set',
        flex_mode: 'none',
        background_style: 'default',
        columns,
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `总计：**${total}** 条反馈`,
        },
      },
    ],
  };
}

/**
 * 创建机器人 onboarding 设置说明卡片
 * 机器人被添加到群时自动发送
 */
export function createOnboardingCard(): InteractiveMessageContent {
  const adminUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/admin`
    : 'http://localhost:3000/admin';

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    header: {
      title: {
        tag: 'lark_md',
        content: '**🎉 NPS Insight 已加入群聊**',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '我是 **NPS Insight** 智能分析助手，可以帮你分析 feelgood 用户反馈数据。\n\n' +
            '**使用前请完成以下配置：**',
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '**📊 第一步：配置多维表格**\n\n' +
            '1. 打开下方「配置中心」\n' +
            '2. 在「多维表格」标签页，选择「关联已有表格」\n' +
            '3. 粘贴你的 feelgood 多维表格链接\n' +
            '4. 点击「关联表格」完成绑定\n\n' +
            '*表格归属权在你，机器人只有读写权限*',
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '**🤖 第二步：使用方式**\n\n' +
            '• **艾特我问问题**：`@NPS Insight NPS多少分？`\n' +
            '• **快捷命令**：`/nps help` 查看所有命令\n' +
            '• **查看报告**：`/nps report`',
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '⚙️ 打开配置中心',
            },
            type: 'primary',
            multi_url: {
              url: adminUrl,
              pc_url: adminUrl,
              android_url: adminUrl,
              ios_url: adminUrl,
            },
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '❓ 查看帮助',
            },
            type: 'default',
            value: {
              action: 'show_help',
            },
          },
        ],
      },
    ],
  };
}

/**
 * 创建命令帮助卡片
 * @returns 卡片内容
 */
export function createHelpCard(): InteractiveMessageContent {
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: 'lark_md',
        content: '**NPS Insight Bot 使用帮助**',
      },
      template: 'blue',
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '**🤖 智能问答（艾特我直接提问）**\n\n' +
            '`NPS多少分？` - 查看总体概况\n' +
            '`最近有什么反馈？` - 查看最新反馈\n' +
            '`最多问题是什么？` - 查看TOP问题\n' +
            '`评分分布怎么样？` - 查看分数分布\n' +
            '`Bug类反馈有多少？` - 按标签统计\n' +
            '`1-2分的差评有哪些？` - 筛选低分反馈',
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '**⌨️ 快捷命令**\n\n' +
            '`/nps help` - 显示帮助\n' +
            '`/nps report` - NPS报告\n' +
            '`/nps analysis [周期]` - 周期分析\n' +
            '`/nps feedback [数量]` - 反馈列表\n' +
            '`/nps config` - 系统配置',
        },
      },
      {
        tag: 'hr',
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '**💡 示例：**\n`@NPS Insight NPS总体情况如何？`\n`/nps analysis 2024-Q1`\n`/nps feedback 5`',
        },
      },
    ],
  };
}

/**
 * 创建周报通知卡片（PRD v6.0 第7.1节）
 */
export function createWeeklyReportCard(data: {
  weekNumber: string;
  totalFeedbacks: number;
  reviewCount: number;
  topIssues: Array<{ tag1: string; tag2: string; tag3: string; count: number; pct: number }>;
  scoreDistribution: Array<{ score: string; pct: number }>;
  bitableUrl?: string;
  logPlatformUrl?: string;
  hasNeedLogCheck: boolean;
  hasReviewNeeded: boolean;
}): InteractiveMessageContent {
  const { weekNumber, totalFeedbacks, reviewCount, topIssues, scoreDistribution, bitableUrl, logPlatformUrl, hasNeedLogCheck, hasReviewNeeded } = data;
  const reviewWarning = reviewCount > 100;

  const elements: Record<string, unknown>[] = [
    { tag: 'div', text: { tag: 'lark_md', content: `**📊 【Feelgood 打标周报】${weekNumber}**\n\n本周拉取：${totalFeedbacks}条负反馈\nAI已完成打标，待审核：${reviewCount}条` } },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: `**📋 Top 5 问题**\n${topIssues.slice(0, 5).map((t, i) => `${i + 1}. ${t.tag3} (${t.tag2}) - ${t.count}次 (${t.pct}%)`).join('\n')}` } },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: `**📈 评分分布**\n${scoreDistribution.map(s => `${s.score}分占${s.pct}%`).join(' | ')}` } },
  ];

  // 按钮
  const actions: Record<string, unknown>[] = [];
  if (hasReviewNeeded) actions.push({ tag: 'button', text: { tag: 'plain_text', content: '审核标签' }, type: 'primary', url: `${bitableUrl || ''}?filter=%7B%22conditions%22%3A%5B%7B%22field_name%22%3A%22%E9%9C%80%E8%A6%81%E4%BA%BA%E5%B7%A5%E5%AE%A1%E6%A0%B8%22%2C%22operator%22%3A%22is%22%2C%22value%22%3A%5Btrue%5D%7D%5D%7D` });
  actions.push({ tag: 'button', text: { tag: 'plain_text', content: '完整看板' }, type: 'default', url: bitableUrl });
  if (hasNeedLogCheck && logPlatformUrl) actions.push({ tag: 'button', text: { tag: 'plain_text', content: '查看日志平台' }, type: 'default', url: logPlatformUrl });

  elements.push({ tag: 'action', actions });

  // 警告
  if (reviewWarning) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '⚠️ 本周待审核量超过100条，请及时处理！' },
    });
  }

  return {
    config: { wide_screen_mode: true, enable_forward: true },
    header: { title: { tag: 'lark_md', content: `📊 【Feelgood 打标周报】${weekNumber}` }, template: reviewWarning ? 'red' : 'blue' },
    elements,
  };
}

/**
 * 创建月报通知卡片（PRD v6.0 第7.2节）
 */
export function createMonthlyReportCard(data: {
  periodName: string;
  topIssueUrl?: string;
  documentUrl?: string;
  dashboardUrl?: string;
  mergeCount: number;
  splitCount: number;
}): InteractiveMessageContent {
  const { periodName, topIssueUrl, documentUrl, dashboardUrl, mergeCount, splitCount } = data;

  const elements: Record<string, unknown>[] = [
    { tag: 'div', text: { tag: 'lark_md', content: `**📈 【Feelgood月度分析】${periodName}**` } },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: `**📋 Top问题已更新至分析表**` } },
    { tag: 'div', text: { tag: 'lark_md', content: `**📄 会议准备文档已生成**` } },
    { tag: 'div', text: { tag: 'lark_md', content: `**🔗 可视化仪表盘**` } },
    { tag: 'div', text: { tag: 'lark_md', content: `**🔄 本期标签自进化：合并标签${mergeCount}组，拆分建议${splitCount}项**` } },
  ];

  const actions: Record<string, unknown>[] = [];
  if (topIssueUrl) actions.push({ tag: 'button', text: { tag: 'plain_text', content: 'Top问题表' }, type: 'primary', url: topIssueUrl });
  if (documentUrl) actions.push({ tag: 'button', text: { tag: 'plain_text', content: '查看文档' }, type: 'default', url: documentUrl });
  if (dashboardUrl) actions.push({ tag: 'button', text: { tag: 'plain_text', content: '仪表盘' }, type: 'default', url: dashboardUrl });
  if (actions.length > 0) elements.push({ tag: 'action', actions });

  return {
    config: { wide_screen_mode: true, enable_forward: true },
    header: { title: { tag: 'lark_md', content: `📈 【Feelgood月度分析】${periodName}` }, template: 'blue' },
    elements,
  };
}

// ============================================
// 导出便捷对象
// ============================================

export const feishuBot = {
  sendMessage,
  sendTextMessage,
  sendPostMessage,
  sendCardMessage,
  createFeedbackCard,
  createAnalysisCard,
  createWeeklyReportCard,
  createMonthlyReportCard,
  createHelpCard,
};
