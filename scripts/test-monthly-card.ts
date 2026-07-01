/**
 * 测试月分析消息卡片发送
 * 直接调用飞书 API 看看具体错误
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createMonthlyReportCard } from '@/lib/feishu/bot';
import { getTenantAccessToken } from '@/lib/feishu/client';

async function test() {
  console.log('测试月分析卡片发送...\n');

  // 1. 生成卡片
  const card = createMonthlyReportCard({
    periodName: '2026年6月',
    totalFeedbacks: 100,
    topIssueUrl: 'https://www.feishu.cn/base/test',
    documentUrl: 'https://www.feishu.cn/docx/test',
    mergeCount: 5,
    splitCount: 3,
  });

  console.log('卡片结构:');
  console.log(JSON.stringify(card, null, 2));
  console.log('');

  // 2. 获取 token
  const token = await getTenantAccessToken();
  console.log('Token获取:', token ? '成功' : '失败');
  console.log('');

  // 3. 发送消息
  const chatId = process.env.NOTIFICATION_CHAT_ID || '';
  console.log('发送到群:', chatId);
  console.log('');

  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
      receive_id_type: 'chat_id',
    }),
  });

  const data = await response.json();
  console.log('API 响应:');
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
