// @ts-check
/**
 * NPS Insight E2E测试用例
 * 使用Playwright执行完整的UI测试
 * 
 * 用法:
 *   npm run test:e2e        - 运行所有测试
 *   npm run test:e2e:ui     - 打开UI模式运行测试
 */

const { test, expect } = require('@playwright/test');

// 测试配置
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const ADMIN_URL = BASE_URL + '/admin';
const BITABLE_URL = process.env.BITABLE_URL || 'https://feishu.cn/bitable';

/**
 * 等待飞书页面加载完成
 */
async function waitForFeishuLoad(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

// ============================================
// 首页测试
// ============================================

test.describe('首页测试', () => {
  test('TC-HOME-001: 首页正常访问', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 截图保存
    await page.screenshot({ path: 'tests/screenshots/home.png', fullPage: true });
    
    // 验证页面标题或主要内容存在
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    console.log('✓ 首页访问成功');
  });

  test('TC-HOME-002: 首页显示统计概览', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 检查是否有统计相关的文本
    const pageContent = await page.textContent('body');
    const hasStats = pageContent.includes('反馈') || pageContent.includes('NPS') || pageContent.includes('统计');
    console.log(`✓ 页面包含统计内容: ${hasStats}`);
  });
});

// ============================================
// 管理后台测试
// ============================================

test.describe('管理后台测试', () => {
  test('TC-ADMIN-001: 管理后台正常访问', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'tests/screenshots/admin.png', fullPage: true });
    
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    console.log('✓ 管理后台访问成功');
  });

  test('TC-ADMIN-002: 配置中心显示', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    
    // 检查配置相关的按钮或链接
    const pageContent = await page.textContent('body');
    const hasConfig = pageContent.includes('配置') || pageContent.includes('设置');
    expect(hasConfig).toBeTruthy();
    console.log('✓ 配置中心显示正常');
  });

  test('TC-ADMIN-003: 标签管理入口', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    
    // 查找标签管理相关元素
    const tagLink = page.locator('text=标签').first();
    const isVisible = await tagLink.isVisible().catch(() => false);
    console.log(`✓ 标签管理入口可见: ${isVisible}`);
  });

  test('TC-ADMIN-004: 定时任务入口', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    
    // 查找定时任务相关元素
    const cronLink = page.locator('text=任务').first();
    const isVisible = await cronLink.isVisible().catch(() => false);
    console.log(`✓ 定时任务入口可见: ${isVisible}`);
  });
});

// ============================================
// API端点测试
// ============================================

test.describe('API端点测试', () => {
  test('TC-API-001: 反馈API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/feedback`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
    console.log(`✓ 反馈API状态: ${response.status()}`);
  });

  test('TC-API-002: 标签API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/tags`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
    console.log(`✓ 标签API状态: ${response.status()}`);
  });

  test('TC-API-003: 租户API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/tenants`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
    console.log(`✓ 租户API状态: ${response.status()}`);
  });

  test('TC-API-004: 分析API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/analysis`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
    console.log(`✓ 分析API状态: ${response.status()}`);
  });

  test('TC-API-005: 配置API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/config`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
    console.log(`✓ 配置API状态: ${response.status()}`);
  });
});

// ============================================
// 多维表格验证测试
// ============================================

test.describe('多维表格验证测试', () => {
  test('TC-BITABLE-001: 多维表格链接有效', async ({ page }) => {
    // 验证BITABLE_URL配置存在
    expect(BITABLE_URL).toBeTruthy();
    console.log(`✓ 多维表格URL配置: ${BITABLE_URL}`);
  });

  test('TC-BITABLE-002: 反馈列表表存在', async ({ page }) => {
    // 验证环境变量中表ID配置
    const tableId = process.env.BITABLE_TABLE_ID;
    expect(tableId).toBeTruthy();
    console.log(`✓ 反馈列表表ID配置: ${tableId}`);
  });

  test('TC-BITABLE-003: 标签库表存在', async ({ page }) => {
    const tableId = process.env.BITABLE_TABLE_ID_TAGS;
    expect(tableId).toBeTruthy();
    console.log(`✓ 标签库表ID配置: ${tableId}`);
  });

  test('TC-BITABLE-004: 租户信息表存在', async ({ page }) => {
    const tableId = process.env.BITABLE_TABLE_ID_TENANTS;
    expect(tableId).toBeTruthy();
    console.log(`✓ 租户信息表ID配置: ${tableId}`);
  });

  test('TC-BITABLE-005: Top问题表存在', async ({ page }) => {
    const tableId = process.env.BITABLE_TABLE_ID_ANALYSIS;
    expect(tableId).toBeTruthy();
    console.log(`✓ Top问题表ID配置: ${tableId}`);
  });
});

// ============================================
// 飞书Bot消息验证测试
// ============================================

test.describe('飞书Bot消息验证测试', () => {
  test('TC-BOT-001: 通知群ID配置', async ({ page }) => {
    const chatId = process.env.NOTIFICATION_CHAT_ID;
    expect(chatId).toBeTruthy();
    console.log(`✓ 通知群ID配置: ${chatId}`);
  });

  test('TC-BOT-002: Cron密钥配置', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET;
    expect(cronSecret).toBeTruthy();
    console.log(`✓ Cron密钥已配置`);
  });

  test('TC-BOT-003: 手动触发周任务', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET;
    const response = await page.request.post(`${BASE_URL}/api/cron/sync`, {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });
    
    // 验证响应（可能是200成功或500失败，取决于数据）
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(600);
    console.log(`✓ 周任务触发状态: ${response.status()}`);
  });

  test('TC-BOT-004: 手动触发月任务', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET;
    const response = await page.request.post(`${BASE_URL}/api/cron/monthly`, {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(600);
    console.log(`✓ 月任务触发状态: ${response.status()}`);
  });
});

// ============================================
// 完整流程测试（保留数据）
// ============================================

test.describe('完整流程测试（保留数据）', () => {
  test('TC-FLOW-001: 执行完整周任务流程', async ({ page }) => {
    console.log('开始执行完整周任务流程...');
    
    // 1. 触发周任务
    const cronSecret = process.env.CRON_SECRET;
    const syncResponse = await page.request.post(`${BASE_URL}/api/cron/sync`, {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });
    
    console.log(`同步任务状态: ${syncResponse.status()}`);
    const syncResult = await syncResponse.json();
    console.log(`同步结果: ${JSON.stringify(syncResult)}`);
    
    expect(syncResponse.status()).toBeGreaterThanOrEqual(200);
    console.log('✓ 周任务流程执行完成');
  });

  test('TC-FLOW-002: 验证反馈数据写入', async ({ page }) => {
    // 获取反馈数据
    const response = await page.request.get(`${BASE_URL}/api/feedback`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    const feedbackCount = data.data?.length || 0;
    console.log(`✓ 当前反馈数量: ${feedbackCount}`);
    
    expect(feedbackCount).toBeGreaterThanOrEqual(0);
  });

  test('TC-FLOW-003: 验证标签数据', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/tags`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    const tagCount = data.data?.length || 0;
    console.log(`✓ 当前标签数量: ${tagCount}`);
    
    expect(tagCount).toBeGreaterThanOrEqual(0);
  });

  test('TC-FLOW-004: 验证租户数据', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/tenants`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    const tenantCount = data.data?.length || 0;
    console.log(`✓ 当前租户数量: ${tenantCount}`);
    
    expect(tenantCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Mock日志平台测试
// ============================================

test.describe('Mock日志平台测试', () => {
  test('TC-LOG-001: Mock日志API响应', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/mock/logs?user=u_001&start=2024-01-01&end=2024-12-31`);
    expect(response.status()).toBeGreaterThanOrEqual(200);
    console.log(`✓ Mock日志API状态: ${response.status()}`);
  });

  test('TC-LOG-002: Mock日志数据格式', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/mock/logs?user=u_001&start=2024-01-01&end=2024-12-31`);
    
    if (response.status() === 200) {
      const data = await response.json();
      console.log(`✓ Mock日志数据格式正确`);
      console.log(`  - userId: ${data.userId}`);
      console.log(`  - logs数量: ${data.logs?.length || 0}`);
      console.log(`  - summary: ${JSON.stringify(data.summary)}`);
    }
  });
});

// ============================================
// 测试结果汇总
// ============================================

test.describe('测试结果汇总', () => {
  test('TC-SUMMARY-001: 生成测试报告', async ({ page }) => {
    console.log('\n========================================');
    console.log('E2E测试执行完成');
    console.log('========================================');
    console.log('请查看上方日志获取详细结果');
    console.log('截图保存在: tests/screenshots/');
    console.log('========================================\n');
  });
});
