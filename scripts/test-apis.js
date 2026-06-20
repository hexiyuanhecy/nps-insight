// 端到端测试 - 验证所有 API 端点正常工作
require('dotenv').config();

const API_BASE = 'http://localhost:3000';

async function test(desc, fn) {
  try {
    await fn();
    console.log('✅', desc);
    return true;
  } catch (err) {
    console.log('❌', desc, ':', err.message);
    return false;
  }
}

async function main() {
  let pass = 0;
  let total = 0;

  // 测试 1: 创建反馈（不带AI打标）
  total++;
  await test('POST /api/feedback (无AI打标)', async () => {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'T001',
        tenantName: '测试租户',
        userId: 'U001',
        userName: '测试用户',
        module: '登录模块',
        content: '这是一条E2E测试反馈内容',
        npsScore: 9,
        source: 'e2e_test',
        autoTag: false,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  }) && pass++;

  // 测试 2: 获取反馈列表
  total++;
  await test('GET /api/feedback', async () => {
    const res = await fetch(`${API_BASE}/api/feedback?pageSize=10`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    console.log('   反馈数:', data.data?.list?.length || 0);
  }) && pass++;

  // 测试 3: 创建反馈（带AI打标）
  total++;
  await test('POST /api/feedback (带AI打标)', async () => {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'T002',
        tenantName: '测试租户2',
        userId: 'U002',
        userName: '测试用户2',
        module: '结算模块',
        content: '支付流程很清晰，但等待时间过长',
        npsScore: 8,
        source: 'e2e_test',
        autoTag: true,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    console.log('   recordId:', data.data?.recordId);
  }) && pass++;

  // 测试 4: 标签管理
  total++;
  await test('GET /api/tags', async () => {
    const res = await fetch(`${API_BASE}/api/tags`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    console.log('   标签数:', data.data?.tags?.length || 0);
  }) && pass++;

  // 测试 5: 分析报告
  total++;
  await test('POST /api/analysis', async () => {
    const res = await fetch(`${API_BASE}/api/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodName: '2026年6月测试',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '分析失败');
    console.log('   总反馈数:', data.data?.totalFeedbacks, 'NPS:', data.data?.npsScore);
  }) && pass++;

  console.log('\n==========================');
  console.log(`测试结果: ${pass}/${total} 通过`);
  console.log('==========================');

  if (pass < total) process.exit(1);
}

main().catch(err => {
  console.error('❌ 致命错误:', err);
  process.exit(1);
});
