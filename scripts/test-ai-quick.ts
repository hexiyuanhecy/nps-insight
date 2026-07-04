/**
 * 快速测试 AI 调用是否正常
 */
import 'dotenv/config';
import { chatCompletion } from '@/lib/ai';

console.log('测试 AI 调用...');
const start = Date.now();

chatCompletion(
  [{ role: 'user', content: '用一句话介绍 NPS' }],
  { temperature: 0.1, maxTokens: 50, taskType: 'summary' as any }
).then(result => {
  console.log(`✅ AI 调用成功，耗时 ${(Date.now() - start) / 1000}s`);
  console.log('结果:', result.slice(0, 100));
  process.exit(0);
}).catch(err => {
  console.error('❌ AI 调用失败:', err.message);
  process.exit(1);
});
