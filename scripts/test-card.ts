/**
 * 飞书卡片测试脚本
 * 直接发送周报卡片到飞书群，用于测试三个按钮的点击效果
 * 
 * 用法：npx tsx scripts/test-card.ts
 */
import { config } from 'dotenv';
import { createWeeklyReportCard, sendCardMessage } from '../src/lib/feishu/bot';

config({ path: '.env.local' });

async function test() {
  console.log('='.repeat(60));
  console.log('飞书卡片测试 - 发送周报卡片');
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

  // 构造测试数据
  const testData = {
    weekNumber: '2026年第26周（测试）',
    totalFeedbacks: 763,
    newFeedbacks: 100,
    avgScore: 3.2,
    reviewCount: 155,
    topIssues: [
      { tag1: '功能故障', tag2: '审批设置', tag3: '审批流程卡住', count: 155, pct: 20.3 },
      { tag1: '功能故障', tag2: '打卡异常与故障', tag3: '打卡失败', count: 126, pct: 16.5 },
      { tag1: '功能优化', tag2: '打卡定位', tag3: '定位不准', count: 88, pct: 11.5 },
      { tag1: '功能故障', tag2: '假期余额', tag3: '余额显示错误', count: 92, pct: 12.1 },
      { tag1: '功能优化', tag2: '补卡功能', tag3: '补卡流程复杂', count: 93, pct: 12.2 },
    ],
    scoreDistribution: [
      { score: '5', pct: 35 },
      { score: '4', pct: 28 },
      { score: '3', pct: 20 },
      { score: '2', pct: 10 },
      { score: '1', pct: 7 },
    ],
    bitableUrl,
    feedbackTableId,
    logPlatformUrl,
    hasNeedLogCheck: true,
    hasReviewNeeded: true,
  };

  // 生成卡片
  console.log('\n📝 生成周报卡片...');
  const card = createWeeklyReportCard(testData);

  // 打印卡片中的URL，方便调试
  console.log('\n🔍 卡片中的按钮URL:');
  const actions = (card.elements as any[]).find(e => e.tag === 'action')?.actions || [];
  actions.forEach((action: any, i: number) => {
    console.log(`  ${i + 1}. ${action.text.content}: ${action.url || '(无url)'}`);
  });

  // 发送卡片
  console.log('\n📤 发送卡片到飞书群...');
  try {
    const messageId = await sendCardMessage(chatId, card);
    console.log(`✅ 卡片发送成功！MessageID: ${messageId}`);
    console.log('\n请在飞书群中点击三个按钮测试：');
    console.log('  1. 审核标签 - 应该跳转到多维表格并筛选"待审核"记录');
    console.log('  2. 完整看板 - 应该跳转到多维表格首页');
    console.log('  3. 查看日志平台 - 应该跳转到日志平台页面');
  } catch (error) {
    console.error('❌ 发送失败:', error);
    process.exit(1);
  }
}

test();
