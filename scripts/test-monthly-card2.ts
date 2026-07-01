/**
 * 测试月分析消息卡片发送（使用修复后的 sendCardNotification）
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createMonthlyReportCard } from '@/lib/feishu/bot';
import { sendCardNotification } from '@/lib/notification/feishu-notifier';

async function test() {
  console.log('测试月分析卡片发送（使用 sendCardNotification）...\n');

  const card = createMonthlyReportCard({
    periodName: '2026年6月',
    totalFeedbacks: 100,
    topIssueUrl: 'https://www.feishu.cn/base/test',
    documentUrl: 'https://www.feishu.cn/docx/test',
    mergeCount: 5,
    splitCount: 3,
  });

  const chatId = process.env.NOTIFICATION_CHAT_ID || '';
  console.log('发送到群:', chatId);
  console.log('');

  const result = await sendCardNotification(chatId, card);
  console.log('发送结果:', result ? '成功' : '失败');
}

test().catch(console.error);
