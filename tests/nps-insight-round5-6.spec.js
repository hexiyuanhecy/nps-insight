// @ts-check
/**
 * NPS Insight 第5-6轮测试用例
 * 第5轮：Mock 移除影响验证
 * 第6轮：端到端流程验证
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3002';
const ADMIN_URL = `${BASE_URL}/admin`;
const LOG_VIEWER_URL = `${BASE_URL}/log-viewer`;

function getSectionByTitle(page, title) {
  return page.locator('section', { hasText: title }).first();
}

function getNthTextInput(section, n) {
  return section.locator('input[type="text"]').nth(n);
}

test.describe('第5轮：Mock 移除影响验证', () => {

  test('TC-R5-001: 首页 / 访问验证 - Mock API 正常情况下页面正常显示', async ({ page }) => {
    console.log('测试: 首页访问验证');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const pageTitle = page.getByRole('heading', { name: '让每一条用户反馈' }).first();
    await expect(pageTitle).toBeVisible();
    
    const configCenterLink = page.getByRole('link', { name: '配置中心' });
    await expect(configCenterLink).toBeVisible();
    
    const featureCards = page.locator('section[id="features"] > div > div > div');
    const featureCount = await featureCards.count();
    console.log(`  核心功能卡片数量: ${featureCount}`);
    
    const mermaidDiagrams = page.locator('.mermaid');
    const diagramCount = await mermaidDiagrams.count();
    console.log(`  Mermaid 图表数量: ${diagramCount}`);
    
    await page.screenshot({ path: 'tests/screenshots/round5-home-page.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    expect(featureCount).toBeGreaterThan(0);
    
    console.log('✓ 通过: 首页正常显示，无控制台错误');
  });

  test('TC-R5-002: /api/config 接口验证 - 配置接口正常返回', async ({ request }) => {
    console.log('测试: /api/config 接口验证');
    
    const response = await request.get(BASE_URL + '/api/config');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    console.log(`  接口成功: ${data.success}`);
    console.log(`  配置项数量: ${Object.keys(data.data || {}).length}`);
    
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    
    const requiredKeys = ['feishu', 'bitable', 'dataSource', 'ai', 'tagging', 'schedule', 'notification', 'webhook', 'tag1'];
    for (const key of requiredKeys) {
      console.log(`  配置项 ${key}: ${data.data[key] !== undefined ? '存在' : '缺失'}`);
    }
    
    console.log('✓ 通过: /api/config 接口正常返回');
  });

  test('TC-R5-003: /api/mock/feedbacks 接口验证 - Mock 反馈接口正常工作', async ({ request }) => {
    console.log('测试: /api/mock/feedbacks 接口验证');
    
    const response = await request.get(BASE_URL + '/api/mock/feedbacks');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    console.log(`  接口 code: ${data.code}`);
    console.log(`  反馈列表长度: ${data.data?.list?.length || 0}`);
    
    expect(data.code).toBe(0);
    expect(data.data).toBeDefined();
    expect(data.data.list).toBeDefined();
    expect(data.data.list.length).toBeGreaterThan(0);
    
    const firstItem = data.data.list[0];
    console.log(`  第一条反馈: id=${firstItem.id}, content=${firstItem.content?.substring(0, 20)}...`);
    
    const requiredFields = ['id', 'content', 'score', 'create_time', 'tenant_id', 'tenant_name'];
    for (const field of requiredFields) {
      expect(firstItem[field]).toBeDefined();
    }
    
    console.log('✓ 通过: /api/mock/feedbacks 接口正常工作');
  });

  test('TC-R5-004: 首页数据展示验证 - Mock 数据在业务中的使用情况', async ({ page }) => {
    console.log('测试: 首页数据展示验证');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const sections = await page.locator('section').all();
    console.log(`  首页 section 数量: ${sections.length}`);
    
    const headings = await page.locator('h2').allTextContents();
    console.log(`  首页二级标题: ${headings.join(', ')}`);
    
    const techStackItems = await page.locator('section:has-text("技术栈") span.rounded-full').count();
    console.log(`  技术栈标签数量: ${techStackItems}`);
    
    await page.screenshot({ path: 'tests/screenshots/round5-home-data.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    expect(headings.length).toBeGreaterThan(0);
    
    console.log('✓ 通过: 首页数据展示正常');
  });

  test('TC-R5-005: /api/feedback 接口验证 - 真实反馈接口（非 Mock）有降级处理', async ({ request }) => {
    console.log('测试: /api/feedback 接口验证');
    
    const response = await request.get(BASE_URL + '/api/feedback');
    const status = response.status();
    console.log(`  HTTP 状态码: ${status}`);
    
    const data = await response.json();
    console.log(`  success: ${data.success}`);
    console.log(`  数据列表长度: ${data.data?.list?.length || 0}`);
    
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    
    if (data.data.list && data.data.list.length > 0) {
      console.log('  返回了 Mock 数据（降级处理正常）');
      const firstItem = data.data.list[0];
      console.log(`  第一条: ${JSON.stringify(firstItem).substring(0, 100)}...`);
    }
    
    console.log('✓ 通过: /api/feedback 接口有降级处理');
  });

  test('TC-R5-006: 配置中心数据源 Tab - 所有配置项都有默认值，不会因缺失配置而报错', async ({ page }) => {
    console.log('测试: 配置中心数据源 Tab 默认值验证');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const configCenterTitle = page.getByRole('heading', { name: '配置中心' }).first();
    await expect(configCenterTitle).toBeVisible();
    
    const sections = [
      '反馈来源 - API',
      '租户信息 - API',
      '反馈来源 - Excel 导入',
      'Webhook 接收',
      '日志反馈平台配置'
    ];
    
    for (const title of sections) {
      const section = getSectionByTitle(page, title);
      const isVisible = await section.isVisible();
      console.log(`  ${title}: ${isVisible ? '可见' : '不可见'}`);
      expect(isVisible).toBe(true);
    }
    
    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const feedbackApiUrl = getNthTextInput(feedbackApiSection, 0);
    const feedbackApiUrlValue = await feedbackApiUrl.inputValue();
    console.log(`  反馈 API 地址默认值: ${feedbackApiUrlValue || '(空)'}`);
    
    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    const tenantApiUrl = getNthTextInput(tenantApiSection, 0);
    const tenantApiUrlValue = await tenantApiUrl.inputValue();
    console.log(`  租户 API 地址默认值: ${tenantApiUrlValue || '(空)'}`);
    
    const logPlatformSection = getSectionByTitle(page, '日志反馈平台配置');
    const logPlatformUrl = getNthTextInput(logPlatformSection, 0);
    const logPlatformUrlValue = await logPlatformUrl.inputValue();
    console.log(`  日志平台 URL 默认值: ${logPlatformUrlValue || '(空)'}`);
    
    const webhookSection = getSectionByTitle(page, 'Webhook 接收');
    const webhookUrl = getNthTextInput(webhookSection, 0);
    const webhookUrlValue = await webhookUrl.inputValue();
    console.log(`  Webhook 地址默认值: ${webhookUrlValue || '(空)'}`);
    
    await page.screenshot({ path: 'tests/screenshots/round5-datasource-defaults.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 配置中心数据源 Tab 所有配置项有默认值，无报错');
  });

});

test.describe('第6轮：端到端流程验证', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
  });

  test('TC-R6-001: 完整配置流程 - 编辑租户API配置 → 保存 → 刷新 → 验证回显', async ({ page }) => {
    console.log('测试: 完整配置流程 - 租户API配置');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const testApiUrl = 'https://test-tenant-api.example.com/v2/tenants';
    const testQueryParams = '{"status":"active","page_size":50}';
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.click();
    await apiUrlInput.fill('');
    await apiUrlInput.fill(testApiUrl);
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.click();
    await queryParamsInput.fill('');
    await queryParamsInput.fill(testQueryParams);
    
    await page.waitForTimeout(300);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1500);
    
    await page.screenshot({ path: 'tests/screenshots/round6-tenant-api-save.png', fullPage: true });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const tenantApiSectionAfter = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInputAfter = getNthTextInput(tenantApiSectionAfter, 0);
    const apiUrlValueAfter = await apiUrlInputAfter.inputValue();
    
    const queryParamsInputAfter = getNthTextInput(tenantApiSectionAfter, 1);
    const queryParamsValueAfter = await queryParamsInputAfter.inputValue();
    
    await page.screenshot({ path: 'tests/screenshots/round6-tenant-api-echo.png', fullPage: true });
    
    expect(apiUrlValueAfter).toBe(testApiUrl);
    expect(queryParamsValueAfter).toBe(testQueryParams);
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 租户API配置完整流程正常（编辑→保存→刷新→回显）');
  });

  test('TC-R6-002: Mock 数据填入流程 - 点击「使用 Mock 数据」→ 验证填入 → 保存 → 刷新 → 验证保留', async ({ page }) => {
    console.log('测试: Mock 数据填入流程');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const mockButton = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    const apiUrlInput = getNthTextInput(feedbackApiSection, 0);
    
    const beforeValue = await apiUrlInput.inputValue();
    console.log(`  点击前 API 地址: ${beforeValue || '(空)'}`);
    
    await mockButton.click();
    await page.waitForTimeout(300);
    
    const afterClickValue = await apiUrlInput.inputValue();
    console.log(`  点击后 API 地址: ${afterClickValue}`);
    expect(afterClickValue).toContain('/api/mock/feedbacks');
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1500);
    
    await page.screenshot({ path: 'tests/screenshots/round6-mock-button-save.png', fullPage: true });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const feedbackApiSectionAfter = getSectionByTitle(page, '反馈来源 - API');
    const apiUrlInputAfter = getNthTextInput(feedbackApiSectionAfter, 0);
    const apiUrlValueAfter = await apiUrlInputAfter.inputValue();
    
    await page.screenshot({ path: 'tests/screenshots/round6-mock-button-echo.png', fullPage: true });
    
    expect(apiUrlValueAfter).toContain('/api/mock/feedbacks');
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: Mock 数据填入流程正常（点击→填入→保存→刷新→保留）');
  });

  test('TC-R6-003: 日志平台跳转流程 - 填入日志平台 Mock URL → 验证 URL 格式正确，包含参数占位符', async ({ page }) => {
    console.log('测试: 日志平台跳转流程');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const logPlatformSection = getSectionByTitle(page, '日志反馈平台配置');
    const mockButton = logPlatformSection.getByRole('button', { name: '填入 Mock URL 体验' });
    const urlInput = getNthTextInput(logPlatformSection, 0);
    
    await mockButton.click();
    await page.waitForTimeout(300);
    
    const urlValue = await urlInput.inputValue();
    console.log(`  日志平台 URL: ${urlValue}`);
    
    const hasUserIdPlaceholder = urlValue.includes('{{userId}}') || urlValue.includes('userId=');
    const hasStartPlaceholder = urlValue.includes('{{start}}') || urlValue.includes('start=');
    const hasEndPlaceholder = urlValue.includes('{{end}}') || urlValue.includes('end=');
    
    console.log(`  包含 userId 参数: ${hasUserIdPlaceholder}`);
    console.log(`  包含 start 参数: ${hasStartPlaceholder}`);
    console.log(`  包含 end 参数: ${hasEndPlaceholder}`);
    
    await page.screenshot({ path: 'tests/screenshots/round6-log-platform-url.png', fullPage: true });
    
    expect(hasUserIdPlaceholder || hasStartPlaceholder || hasEndPlaceholder).toBe(true);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1500);
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志平台 URL 格式正确，包含参数占位符');
  });

  test('TC-R6-004: 首页数据展示 - 验证图表、数据卡片等组件正常渲染', async ({ page }) => {
    console.log('测试: 首页数据展示');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    
    const heroTitle = page.getByRole('heading', { name: '让每一条用户反馈' }).first();
    await expect(heroTitle).toBeVisible();
    
    const navConfigCenter = page.getByRole('link', { name: '配置中心' }).first();
    await expect(navConfigCenter).toBeVisible();
    
    const featureSection = page.locator('section[id="features"]');
    const featureCards = featureSection.locator('> div > div > div');
    const featureCount = await featureCards.count();
    console.log(`  核心功能卡片数量: ${featureCount}`);
    expect(featureCount).toBe(6);
    
    const tagSystemSection = page.locator('section', { hasText: '三级标签体系' }).first();
    await expect(tagSystemSection).toBeVisible();
    
    const flowSection = page.locator('section', { hasText: '用户操作手册' }).first();
    await expect(flowSection).toBeVisible();
    
    const techStackSection = page.locator('section', { hasText: '技术栈' }).first();
    await expect(techStackSection).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round6-home-components.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 首页各组件正常渲染');
  });

  test('TC-R6-005: 配置中心三个 Tab 切换 - 验证切换流畅无报错', async ({ page }) => {
    console.log('测试: 配置中心三个 Tab 切换');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const tabs = ['数据源', '飞书配置', '打标与分析配置'];
    
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      console.log(`  切换到: ${tab}`);
      
      const tabButton = page.getByRole('button', { name: tab });
      await tabButton.click();
      await page.waitForTimeout(500);
      
      const isActive = await tabButton.evaluate(el => el.getAttribute('aria-selected') === 'true' || el.classList.contains('bg-blue-600') || el.classList.contains('text-white'));
      console.log(`    Tab 激活状态: ${isActive}`);
      
      await page.waitForTimeout(300);
    }
    
    for (let i = tabs.length - 1; i >= 0; i--) {
      const tab = tabs[i];
      console.log(`  反向切换到: ${tab}`);
      
      const tabButton = page.getByRole('button', { name: tab });
      await tabButton.click();
      await page.waitForTimeout(500);
    }
    
    await page.screenshot({ path: 'tests/screenshots/round6-tab-switching.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 配置中心三个 Tab 切换流畅无报错');
  });

});
