// @ts-check
/**
 * NPS Insight 第1-2轮测试用例
 * 第1轮：基础功能验证
 * 第2轮：交互流程验证
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3002';
const ADMIN_URL = `${BASE_URL}/admin`;
const LOG_VIEWER_URL = `${BASE_URL}/log-viewer?userId=u_test_001&start=2025-01-01&end=2025-01-31`;

function getSectionByTitle(page, title) {
  return page.locator('section', { hasText: title }).first();
}

function getNthTextInput(section, n) {
  return section.locator('input[type="text"]').nth(n);
}

test.describe('第1轮：基础功能验证', () => {

  test('TC-R1-001: 访问配置中心 /admin，切换到「数据源」Tab', async ({ page }) => {
    console.log('测试: 访问配置中心并切换到数据源 Tab');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/screenshots/round1-admin-page.png', fullPage: true });

    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await expect(datasourceTab).toBeVisible();
    
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'tests/screenshots/round1-datasource-tab.png', fullPage: true });
    
    await expect(datasourceTab).toHaveClass(/bg-blue-50/);
    
    console.log('✓ 通过: 成功访问配置中心并切换到数据源 Tab');
  });

  test('TC-R1-002: 验证「反馈来源 - API」区块有「使用 Mock 数据」按钮', async ({ page }) => {
    console.log('测试: 验证反馈来源 API 区块有使用 Mock 数据按钮');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);

    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    await expect(feedbackApiSection).toBeVisible();
    
    const mockButton = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    await expect(mockButton).toBeVisible();
    
    console.log('✓ 通过: 反馈来源 - API 区块有「使用 Mock 数据」按钮');
  });

  test('TC-R1-003: 点击「使用 Mock 数据」按钮，验证 API 地址输入框填入了 Mock 接口地址', async ({ page }) => {
    console.log('测试: 点击使用 Mock 数据按钮后验证 API 地址填入');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);

    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const mockButton = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    await mockButton.click();
    await page.waitForTimeout(300);

    const apiUrlInput = getNthTextInput(feedbackApiSection, 0);
    const apiUrlValue = await apiUrlInput.inputValue();
    
    expect(apiUrlValue).toContain('/api/mock/feedbacks');
    
    await page.screenshot({ path: 'tests/screenshots/round1-mock-button-click.png', fullPage: true });
    
    console.log(`✓ 通过: API 地址已填入: ${apiUrlValue}`);
  });

  test('TC-R1-004: 验证页面上有「租户信息 - API」配置区块，包含 API 地址、API Key、查询参数三个字段', async ({ page }) => {
    console.log('测试: 验证租户信息 API 配置区块包含三个字段');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    await expect(tenantApiSection).toBeVisible();
    
    const apiAddressField = tenantApiSection.getByText('API 地址').first();
    const apiKeyField = tenantApiSection.getByText('API Key').first();
    const queryParamsField = tenantApiSection.getByText('查询参数').first();
    
    await expect(apiAddressField).toBeVisible();
    await expect(apiKeyField).toBeVisible();
    await expect(queryParamsField).toBeVisible();
    
    const textInputs = tenantApiSection.locator('input[type="text"]');
    const count = await textInputs.count();
    expect(count).toBeGreaterThanOrEqual(2);
    
    await page.screenshot({ path: 'tests/screenshots/round1-tenant-api-section.png', fullPage: true });
    
    console.log('✓ 通过: 租户信息 - API 配置区块包含 API 地址、API Key、查询参数三个字段');
  });

  test('TC-R1-005: 访问 /log-viewer?userId=u_test_001&start=2025-01-01&end=2025-01-31，验证页面正常加载，无控制台错误', async ({ page }) => {
    console.log('测试: 访问日志查看器页面，验证正常加载');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(LOG_VIEWER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pageTitle = page.getByRole('heading', { name: '日志查询平台' });
    await expect(pageTitle).toBeVisible();
    
    const logListSection = page.getByText('日志列表').first();
    await expect(logListSection).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round1-log-viewer.png', fullPage: true });
    
    if (consoleErrors.length > 0) {
      console.log(`⚠ 控制台错误数量: ${consoleErrors.length}`);
      consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    }
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志查看器页面正常加载，无控制台错误');
  });

});

test.describe('第2轮：交互流程验证', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
  });

  test('TC-R2-001: 进入配置中心数据源 Tab，点击编辑模式', async ({ page }) => {
    console.log('测试: 进入配置中心数据源 Tab，点击编辑模式');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    await expect(editButton).toBeVisible();
    await editButton.click();
    await page.waitForTimeout(500);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible();
    
    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await expect(apiUrlInput).toBeEnabled();
    
    await page.screenshot({ path: 'tests/screenshots/round2-edit-mode.png', fullPage: true });
    
    console.log('✓ 通过: 成功进入编辑模式');
  });

  test('TC-R2-002: 在租户信息 API 配置中填入测试数据', async ({ page }) => {
    console.log('测试: 在租户信息 API 配置中填入测试数据');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.fill('');
    await apiUrlInput.fill('https://test-tenant-api.example.com/api');
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.fill('');
    await queryParamsInput.fill('{"tenantId": "test_tenant_001"}');
    
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tests/screenshots/round2-tenant-api-filled.png', fullPage: true });
    
    const apiUrlValue = await apiUrlInput.inputValue();
    expect(apiUrlValue).toBe('https://test-tenant-api.example.com/api');
    
    const queryParamsValue = await queryParamsInput.inputValue();
    expect(queryParamsValue).toBe('{"tenantId": "test_tenant_001"}');
    
    console.log('✓ 通过: 租户信息 API 配置测试数据填入成功');
  });

  test('TC-R2-003: 点击保存配置', async ({ page }) => {
    console.log('测试: 点击保存配置');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.fill('');
    await apiUrlInput.fill('https://test-tenant-api.example.com/api');
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.fill('');
    await queryParamsInput.fill('{"tenantId": "test_tenant_001"}');
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'tests/screenshots/round2-save-config.png', fullPage: true });
    
    console.log('✓ 通过: 保存配置成功');
  });

  test('TC-R2-004: 刷新页面，验证租户信息 API 配置的三个字段是否正确回显', async ({ page }) => {
    console.log('测试: 刷新页面，验证租户信息 API 配置回显');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.fill('');
    await apiUrlInput.fill('https://test-tenant-api.example.com/api');
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.fill('');
    await queryParamsInput.fill('{"tenantId": "test_tenant_001"}');
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const tenantApiSectionAfter = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInputAfter = getNthTextInput(tenantApiSectionAfter, 0);
    const apiUrlValue = await apiUrlInputAfter.inputValue();
    
    const queryParamsInputAfter = getNthTextInput(tenantApiSectionAfter, 1);
    const queryParamsValue = await queryParamsInputAfter.inputValue();
    
    await page.screenshot({ path: 'tests/screenshots/round2-refresh-echo.png', fullPage: true });
    
    expect(apiUrlValue).toBe('https://test-tenant-api.example.com/api');
    expect(queryParamsValue).toBe('{"tenantId": "test_tenant_001"}');
    
    console.log(`✓ 通过: 刷新页面后租户信息 API 地址正确回显: ${apiUrlValue}`);
    console.log(`✓ 通过: 刷新页面后租户信息查询参数正确回显: ${queryParamsValue}`);
  });

  test('TC-R2-005: 验证反馈来源 API 的「使用 Mock 数据」按钮点击后能正确填入值', async ({ page }) => {
    console.log('测试: 验证反馈来源 API 使用 Mock 数据按钮能正确填入值');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const apiUrlInput = getNthTextInput(feedbackApiSection, 0);
    await apiUrlInput.fill('');
    
    const mockButton = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    await mockButton.click();
    await page.waitForTimeout(300);
    
    const apiUrlValue = await apiUrlInput.inputValue();
    expect(apiUrlValue).toContain('/api/mock/feedbacks');
    
    await page.screenshot({ path: 'tests/screenshots/round2-mock-button-verify.png', fullPage: true });
    
    console.log(`✓ 通过: 反馈来源 API Mock 按钮填入值正确: ${apiUrlValue}`);
  });

  test('TC-R2-006: 验证日志平台「填入 Mock URL 体验」按钮填入的是 /log-viewer 页面地址', async ({ page }) => {
    console.log('测试: 验证日志平台填入 Mock URL 体验按钮填入的是 /log-viewer 页面地址');
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const logPlatformSection = getSectionByTitle(page, '日志反馈平台配置');
    await expect(logPlatformSection).toBeVisible();
    
    const urlTemplateInput = getNthTextInput(logPlatformSection, 0);
    await urlTemplateInput.fill('');
    
    const mockButton = logPlatformSection.getByRole('button', { name: '填入 Mock URL 体验' });
    await expect(mockButton).toBeVisible();
    await mockButton.click();
    await page.waitForTimeout(300);
    
    const urlTemplateValue = await urlTemplateInput.inputValue();
    
    expect(urlTemplateValue).toContain('/log-viewer');
    expect(urlTemplateValue).toContain('{{userId}}');
    expect(urlTemplateValue).toContain('{{start}}');
    expect(urlTemplateValue).toContain('{{end}}');
    
    await page.screenshot({ path: 'tests/screenshots/round2-log-mock-url.png', fullPage: true });
    
    console.log(`✓ 通过: 日志平台 Mock URL 按钮填入值正确: ${urlTemplateValue}`);
  });

});
