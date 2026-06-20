// 调试 - 验证所有API字段匹配
require('dotenv').config();
const API_BASE = 'http://localhost:3000';

async function main() {
  console.log('\n=== 1. POST 反馈 (无AI) ===');
  const now = Date.now();
  const fb = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'T_DEBUG',
      tenantName: '调试租户',
      userId: 'U1',
      userName: '用户',
      module: '登录',
      content: '测试内容',
      npsScore: 8,
      source: 'debug',
      autoTag: false,
    }),
  });
  const fbData = await fb.json();
  console.log('结果:', JSON.stringify(fbData, null, 2));

  console.log('\n=== 2. GET 反馈列表 ===');
  const list = await fetch(`${API_BASE}/api/feedback?pageSize=5`);
  const listData = await list.json();
  console.log('成功:', listData.success, '数量:', listData.data?.list?.length);

  console.log('\n=== 3. POST 反馈 (带AI) ===');
  const fb2 = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'T_AI',
      tenantName: 'AI测试',
      userId: 'U2',
      userName: '用户2',
      module: '结算',
      content: '支付流程很清晰，但是等待时间过长',
      npsScore: 7,
      source: 'debug',
      autoTag: true,
    }),
  });
  const fb2Data = await fb2.json();
  console.log('结果:', JSON.stringify(fb2Data, null, 2));

  console.log('\n=== 4. GET 标签列表 ===');
  const tags = await fetch(`${API_BASE}/api/tags?pageSize=10`);
  const tagsData = await tags.json();
  console.log('成功:', tagsData.success, '数量:', tagsData.data?.list?.length);
  if (!tagsData.success) console.log('错误:', tagsData.error);

  console.log('\n=== 5. POST 分析报告 ===');
  const analysis = await fetch(`${API_BASE}/api/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      periodName: '2026年6月调试',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    }),
  });
  const aData = await analysis.json();
  console.log('成功:', aData.success);
  if (!aData.success) console.log('错误:', aData.error);

  console.log('\n=== 6. GET 分析报告列表 ===');
  const getAnalysis = await fetch(`${API_BASE}/api/analysis?pageSize=10`);
  const gaData = await getAnalysis.json();
  console.log('成功:', gaData.success, '数量:', gaData.data?.list?.length);
  if (!gaData.success) console.log('错误:', gaData.error);

  console.log('\n🎉 调试完成');
}
main().catch(err => {
  console.error('❌ 致命错误:', err.message);
  process.exit(1);
});
