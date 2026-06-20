// 完整端到端 API测试
require('dotenv').config();
const API_BASE = 'http://localhost:3000';

const results = [];

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log('✅', name);
      results.push({ name, ok: true });
    } catch (err) {
      console.log('❌', name, ':', err.message);
      results.push({ name, ok: false, err: err.message });
    }
  };
}

async function main() {
  const now = Date.now();

  // 1. 反馈
  await test('POST /api/feedback (无AI)', async () => {
    const r = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: `T_${now}`, tenantName: '测试租户',
        userId: 'U1', userName: '用户', module: '登录',
        content: '测试反馈内容', npsScore: 9, source: 'e2e', autoTag: false,
      }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
  })();

  await test('GET /api/feedback', async () => {
    const r = await fetch(`${API_BASE}/api/feedback?pageSize=5`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   反馈数:', d.data?.list?.length);
  })();

  await test('POST /api/feedback (带AI)', async () => {
    const r = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: `T_AI_${now}`, tenantName: 'AI测试租户',
        userId: 'U2', userName: '用户', module: '结算',
        content: '支付流程清晰但等待时间过长', npsScore: 7, source: 'e2e', autoTag: true,
      }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   recordId:', d.data?.recordId);
  })();

  // 2. 标签
  await test('POST /api/tags', async () => {
    const r = await fetch(`${API_BASE}/api/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag1Name: '产品功能', tag2Name: '界面交互',
        tag3Name: '按钮位置', createdBy: 'e2e',
      }),
    });
    const d = await r.json();
    if (!d.success && !d.error?.includes('已存在') && !d.error?.includes('重复')) throw new Error(d.error);
  })();

  await test('GET /api/tags', async () => {
    const r = await fetch(`${API_BASE}/api/tags?pageSize=10`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   标签数:', d.data?.list?.length);
  })();

  // 3. 租户
  await test('POST /api/tenants', async () => {
    const r = await fetch(`${API_BASE}/api/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: `T_${now}`, tenantName: '端到端测试租户',
        scale: 'A3', contact: '张三', contactEmail: 'test@example.com',
      }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
  })();

  await test('GET /api/tenants', async () => {
    const r = await fetch(`${API_BASE}/api/tenants?pageSize=10`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   租户数:', d.data?.list?.length);
  })();

  // 4. 分析
  await test('POST /api/analysis', async () => {
    const r = await fetch(`${API_BASE}/api/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodName: '2026年6月', startDate: '2026-06-01', endDate: '2026-06-30' }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   npsScore:', d.data?.npsScore, '总反馈数:', d.data?.totalFeedbacks);
  })();

  await test('GET /api/analysis', async () => {
    const r = await fetch(`${API_BASE}/api/analysis?pageSize=10`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   报告数:', d.data?.list?.length);
  })();

  // 5. 通知
  await test('POST /api/notify (飞书消息)', async () => {
    const r = await fetch(`${API_BASE}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🎉 NPS Insight 端到端测试成功\n时间: ${new Date().toLocaleString('zh-CN')}` }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    console.log('   messageId:', d.data?.messageId);
  })();

  // 汇总
  console.log('\n========= 测试报告 =========');
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log(`通过: ${passed}/${total}`);
  for (const r of results) {
    console.log('  ', r.ok ? '✅' : '❌', r.name, r.err ? `(${r.err})` : '');
  }
  if (passed < total) process.exit(1);
  console.log('\n🎉 全部通过!');
}
main().catch(err => {
  console.error('❌ 致命错误:', err);
  process.exit(1);
});
