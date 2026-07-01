/**
 * 飞书卡片测试脚本 v3 - 真实统计数据
 * 直接发送周报卡片到飞书群，用于测试三个按钮的点击效果
 * 
 * 用法：npx tsx scripts/test-card-v3.ts
 */
import { config } from 'dotenv';
import { createWeeklyReportCard, sendCardMessage } from '../src/lib/feishu/bot';
import { bitableClient, parseBitableDate } from '../src/lib/feishu/bitable';
import { FEEDBACK_FIELDS, TABLE_NAMES } from '../src/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE, DEFAULT_TOP_N } from '../src/constants/app-constants';

config({ path: '.env.local' });

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function test() {
  console.log('='.repeat(60));
  console.log('飞书卡片测试 v3 - 真实统计数据');
  console.log('='.repeat(60));

  // 从环境变量读取配置
  const bitableUrl = process.env.BITABLE_URL || process.env.FEISHU_BITABLE_URL || '';
  const feedbackTableId = process.env.BITABLE_FEEDBACK_TABLE_ID || '';
  const logPlatformUrl = process.env.LOG_PLATFORM_URL_TEMPLATE || '';
  const chatId = process.env.NOTIFICATION_CHAT_ID || '';

  console.log(`\n多维表格地址: ${bitableUrl}`);
  console.log(`反馈表ID: ${feedbackTableId}`);
  console.log(`日志平台URL: ${logPlatformUrl}`);
  console.log(`通知群ID: ${chatId}`);

  if (!chatId) {
    console.error('❌ 缺少 NOTIFICATION_CHAT_ID 环境变量');
    process.exit(1);
  }

  // 获取真实数据并统计
  console.log('\n📊 获取反馈数据并统计...');
  const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });

  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weekNum = `${now.getFullYear()}年第${getISOWeek(now)}周`;

  let reviewCount = 0;
  let needLogCheckCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let weekFeedbackCount = 0;
  const tag3Counts = new Map<string, number>();
  const tag2Counts = new Map<string, number>();
  const scoreCounts = new Map<number, number>();

  for (const r of records) {
    const fields = r.fields || {};
    const createTime = parseBitableDate(fields[FEEDBACK_FIELDS.CREATE_TIME]);
    if (!createTime || createTime < weekStart || createTime >= weekEnd) continue;

    weekFeedbackCount++;

    // 待审核判断
    const reviewNeededVal = fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
    const reviewNeeded = reviewNeededVal === true || reviewNeededVal === '是' || String(reviewNeededVal).toLowerCase() === 'true';
    const needLogVal = fields[FEEDBACK_FIELDS.NEED_LOG_CHECK];
    const needLog = needLogVal === true || needLogVal === '是' || String(needLogVal).toLowerCase() === 'true';
    if (reviewNeeded) reviewCount++;
    if (needLog) needLogCheckCount++;

    // 评分统计
    const score = Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
    if (score > 0) {
      const roundedScore = Math.round(score);
      scoreCounts.set(roundedScore, (scoreCounts.get(roundedScore) || 0) + 1);
      scoreSum += score;
      scoreCount++;
    }
  }

  // 分数分布（1-5分）
  const scoreDistribution = [];
  for (let i = 5; i >= 1; i--) {
    const count = scoreCounts.get(i) || 0;
    const pct = scoreCount > 0 ? Math.round((count / scoreCount) * 100) : 0;
    scoreDistribution.push({ score: String(i), pct });
  }

  // Top问题（这里简化，用真实的tag3统计）
  // 注意：需要先查标签表获取tag3名称，这里暂时用占位数据
  const topIssues = [
    { tag1: '功能故障', tag2: '审批设置', tag3: '审批流程卡住', count: reviewCount > 0 ? reviewCount : 0, pct: 0 },
    { tag1: '功能故障', tag2: '打卡异常与故障', tag3: '打卡失败', count: Math.floor(weekFeedbackCount * 0.15), pct: 15 },
    { tag1: '功能优化', tag2: '打卡定位', tag3: '定位不准', count: Math.floor(weekFeedbackCount * 0.12), pct: 12 },
    { tag1: '功能故障', tag2: '假期余额', tag3: '余额显示错误', count: Math.floor(weekFeedbackCount * 0.1), pct: 10 },
    { tag1: '功能优化', tag2: '补卡功能', tag3: '补卡流程复杂', count: Math.floor(weekFeedbackCount * 0.08), pct: 8 },
  ].filter(t => t.count > 0).slice(0, DEFAULT_TOP_N);

  console.log(`\n📈 统计结果:`);
  console.log(`  本周新反馈: ${weekFeedbackCount}`);
  console.log(`  总反馈数: ${records.length}`);
  console.log(`  待审核: ${reviewCount}`);
  console.log(`  需查日志: ${needLogCheckCount}`);
  console.log(`  平均分: ${scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : 0}`);

  // 生成卡片
  console.log('\n📝 生成周报卡片...');
  const card = createWeeklyReportCard({
    weekNumber: weekNum,
    totalFeedbacks: records.length,
    newFeedbacks: weekFeedbackCount,
    avgScore: scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(1)) : 0,
    reviewCount,
    topIssues,
    scoreDistribution,
    bitableUrl,
    feedbackTableId,
    logPlatformUrl,
    hasNeedLogCheck: needLogCheckCount > 0,
    hasReviewNeeded: reviewCount > 0,
  });

  // 打印卡片中的URL，方便调试
  console.log('\n🔍 卡片中的按钮URL:');
  const actionElement = (card.elements as any[]).find(e => e.tag === 'action');
  const actions = actionElement?.actions || [];
  actions.forEach((action: any, i: number) => {
    console.log(`  ${i + 1}. ${action.text.content}`);
    console.log(`     URL: ${action.url || '(无url)'}`);
  });

  // 发送卡片
  console.log('\n📤 发送卡片到飞书群...');
  try {
    const messageId = await sendCardMessage(chatId, card);
    console.log(`✅ 卡片发送成功！MessageID: ${messageId}`);
    console.log('\n请在飞书群中点击三个按钮测试：');
    console.log('  1. 审核标签 - 应该跳转到多维表格反馈表');
    console.log('  2. 完整看板 - 应该跳转到多维表格首页');
    console.log('  3. 查看日志平台 - 应该跳转到日志平台页面');
  } catch (error) {
    console.error('❌ 发送失败:', error);
    process.exit(1);
  }
}

test();
