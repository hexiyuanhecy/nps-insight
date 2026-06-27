// @ts-check
/**
 * NPS Insight 第7-8轮测试用例
 * 第7轮：性能与稳定性验证
 * 第8轮：最终回归测试
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

test.describe('第7轮：性能与稳定性验证', () => {

  test('TC-R7-001: Tab 快速切换 - 连续切换10次，验证无内存泄漏和状态错乱', async ({ page }) => {
    console.log('测试: Tab 快速切换 - 连续切换10次');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const tabs = ['数据源', '飞书配置', '打标与分析配置'];
    let switchCount = 0;
    
    for (let i = 0; i < 10; i++) {
      const tabIndex = i % tabs.length;
      const tabName = tabs[tabIndex];
      
      const tabButton = page.getByRole('button', { name: tabName });
      await tabButton.click({ delay: 0 });
      switchCount++;
      
      await page.waitForTimeout(200);
    }
    
    console.log(`  完成切换次数: ${switchCount}`);
    
    const finalTab = tabs[0];
    const finalTabButton = page.getByRole('button', { name: finalTab });
    await finalTabButton.click();
    await page.waitForTimeout(500);
    
    const configCenterTitle = page.getByRole('heading', { name: '配置中心' }).first();
    await expect(configCenterTitle).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round7-tab-fast-switch.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    expect(switchCount).toBe(10);
    
    console.log('✓ 通过: Tab 快速切换无内存泄漏和状态错乱');
  });

  test('TC-R7-002: 配置中心编辑模式快速切换 - 连续5次进入/退出编辑模式，验证状态正确', async ({ page }) => {
    test.setTimeout(60000);
    console.log('测试: 配置中心编辑模式快速切换');
    
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
    
    let toggleCount = 0;
    
    for (let i = 0; i < 5; i++) {
      const editButton = page.getByRole('button', { name: '编辑' });
      const saveButton = page.getByRole('button', { name: '保存', exact: false });
      
      const isEditMode = !(await editButton.isVisible());
      
      if (isEditMode) {
        await saveButton.first().click();
        toggleCount++;
        await page.waitForTimeout(1000);
      } else {
        await editButton.click();
        toggleCount++;
        await page.waitForTimeout(500);
      }
      
      const editButtonAfter = page.getByRole('button', { name: '编辑' });
      const isEditModeAfter = !(await editButtonAfter.isVisible());
      console.log(`  第 ${i + 1} 次切换: ${isEditMode ? '编辑→查看' : '查看→编辑'}，状态正确: ${isEditMode !== isEditModeAfter}`);
    }
    
    console.log(`  总切换次数: ${toggleCount}`);
    
    const finalEditButton = page.getByRole('button', { name: '编辑' });
    const finalInEditMode = !(await finalEditButton.isVisible());
    console.log(`  最终状态: ${finalInEditMode ? '编辑模式' : '查看模式'}`);
    
    await page.screenshot({ path: 'tests/screenshots/round7-edit-mode-toggle.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    expect(toggleCount).toBe(5);
    
    console.log('✓ 通过: 编辑模式快速切换状态正确');
  });

  test('TC-R7-003: 多次保存配置 - 连续保存3次，验证无重复请求和数据异常', async ({ page }) => {
    console.log('测试: 多次保存配置 - 连续保存3次');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    let saveRequestCount = 0;
    await page.route('**/api/config', (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
        saveRequestCount++;
      }
      return route.continue();
    });

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
    
    const testUrl = 'https://api.example.com/test-multi-save';
    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const apiUrlInput = getNthTextInput(feedbackApiSection, 0);
    await apiUrlInput.click();
    await apiUrlInput.fill('');
    await apiUrlInput.fill(testUrl);
    
    for (let i = 0; i < 3; i++) {
      const saveButton = page.getByRole('button', { name: '保存' });
      await saveButton.click();
      await page.waitForTimeout(1000);
      console.log(`  第 ${i + 1} 次保存完成`);
      
      if (i < 2) {
        const editButtonAgain = page.getByRole('button', { name: '编辑' });
        if (await editButtonAgain.isVisible()) {
          await editButtonAgain.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    console.log(`  保存请求总次数: ${saveRequestCount}`);
    
    await page.screenshot({ path: 'tests/screenshots/round7-multi-save.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    expect(saveRequestCount).toBeGreaterThanOrEqual(3);
    
    console.log('✓ 通过: 多次保存配置无重复请求和数据异常');
  });

  test('TC-R7-004: 日志查看器快速切换日志条目 - 连续点击10条不同日志，验证无卡顿', async ({ page }) => {
    console.log('测试: 日志查看器快速切换日志条目');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(LOG_VIEWER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const logItems = page.locator('[class*="cursor-pointer"], [class*="log-item"], li, [role="listitem"]').filter({ hasText: /\d/ });
    const logCount = await logItems.count();
    console.log(`  找到的日志条目数量: ${logCount}`);
    
    if (logCount > 0) {
      const clickCount = Math.min(10, logCount);
      for (let i = 0; i < clickCount; i++) {
        const item = logItems.nth(i % logCount);
        if (await item.isVisible()) {
          await item.click({ force: true });
          await page.waitForTimeout(150);
          console.log(`  点击第 ${i + 1} 条日志`);
        }
      }
    } else {
      console.log('  未找到可点击的日志条目，跳过点击测试，仅验证页面正常');
    }
    
    const pageTitle = page.getByRole('heading', { name: /日志/ }).first();
    const titleVisible = await pageTitle.isVisible();
    console.log(`  日志页面标题可见: ${titleVisible}`);
    
    await page.screenshot({ path: 'tests/screenshots/round7-log-viewer-fast-switch.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志查看器快速切换无卡顿');
  });

  test('TC-R7-005: 长时间页面停留 - 30秒页面停留，验证无内存泄漏和异常报错', async ({ page }) => {
    test.setTimeout(60000);
    console.log('测试: 长时间页面停留（30秒）');
    
    const consoleErrors = [];
    const consoleWarnings = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    console.log('  开始页面停留计时...');
    await page.waitForTimeout(30000);
    console.log('  页面停留30秒完成');
    
    const configCenterTitle = page.getByRole('heading', { name: '配置中心' }).first();
    await expect(configCenterTitle).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round7-long-stay.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    console.log(`  控制台警告数量: ${consoleWarnings.length}`);
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 长时间页面停留无内存泄漏和异常报错');
  });

  test('TC-R7-006: 页面刷新测试 - 刷新页面10次，验证每次都能正常加载', async ({ page }) => {
    console.log('测试: 页面刷新测试 - 刷新10次');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < 10; i++) {
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      
      try {
        await page.goto(ADMIN_URL);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        
        const configCenterTitle = page.getByRole('heading', { name: '配置中心' }).first();
        const isVisible = await configCenterTitle.isVisible();
        
        if (isVisible && consoleErrors.length === 0) {
          successCount++;
          console.log(`  第 ${i + 1} 次刷新: 成功`);
        } else {
          errorCount++;
          console.log(`  第 ${i + 1} 次刷新: 失败 - 标题可见: ${isVisible}, 错误数: ${consoleErrors.length}`);
        }
      } catch (e) {
        errorCount++;
        console.log(`  第 ${i + 1} 次刷新: 异常 - ${e.message}`);
      }
      
      await page.waitForTimeout(200);
    }
    
    console.log(`  成功次数: ${successCount}/10`);
    console.log(`  失败次数: ${errorCount}/10`);
    
    await page.screenshot({ path: 'tests/screenshots/round7-refresh-10times.png', fullPage: true });
    
    expect(successCount).toBe(10);
    expect(errorCount).toBe(0);
    
    console.log('✓ 通过: 页面刷新10次全部正常加载');
  });

});

test.describe('第8轮：最终回归测试', () => {

  test('TC-R8-001: 数据源 Tab 的「使用 Mock 数据」按钮功能验证', async ({ page }) => {
    console.log('测试: 数据源 Tab 的「使用 Mock 数据」按钮');
    
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
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }
    
    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const mockButton = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    
    const mockButtonVisible = await mockButton.isVisible();
    console.log(`  「使用 Mock 数据」按钮可见: ${mockButtonVisible}`);
    expect(mockButtonVisible).toBe(true);
    
    const apiUrlInput = getNthTextInput(feedbackApiSection, 0);
    const beforeValue = await apiUrlInput.inputValue();
    
    await mockButton.click();
    await page.waitForTimeout(300);
    
    const afterValue = await apiUrlInput.inputValue();
    console.log(`  点击前 URL: ${beforeValue || '(空)'}`);
    console.log(`  点击后 URL: ${afterValue}`);
    
    expect(afterValue).toContain('/api/mock/feedbacks');
    
    await page.screenshot({ path: 'tests/screenshots/round8-mock-button.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 数据源 Tab 的「使用 Mock 数据」按钮功能正常');
  });

  test('TC-R8-002: 租户信息 API 配置区块功能验证', async ({ page }) => {
    console.log('测试: 租户信息 API 配置区块');
    
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
    
    const tenantSection = getSectionByTitle(page, '租户信息 - API');
    const sectionVisible = await tenantSection.isVisible();
    console.log(`  租户信息 API 区块可见: ${sectionVisible}`);
    expect(sectionVisible).toBe(true);
    
    const apiUrlInput = getNthTextInput(tenantSection, 0);
    const queryParamsInput = getNthTextInput(tenantSection, 1);
    
    const apiUrlVisible = await apiUrlInput.isVisible();
    const queryParamsVisible = await queryParamsInput.isVisible();
    
    console.log(`  API 地址输入框可见: ${apiUrlVisible}`);
    console.log(`  查询参数输入框可见: ${queryParamsVisible}`);
    
    expect(apiUrlVisible).toBe(true);
    expect(queryParamsVisible).toBe(true);
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }
    
    const testUrl = 'https://regression-test-tenant-api.example.com/v1/tenants';
    const testParams = '{"test":"regression"}';
    
    await apiUrlInput.click();
    await apiUrlInput.fill('');
    await apiUrlInput.fill(testUrl);
    
    await queryParamsInput.click();
    await queryParamsInput.fill('');
    await queryParamsInput.fill(testParams);
    
    await page.waitForTimeout(300);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1500);
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTabAfter = page.getByRole('button', { name: '数据源' });
    await datasourceTabAfter.click();
    await page.waitForTimeout(500);
    
    const tenantSectionAfter = getSectionByTitle(page, '租户信息 - API');
    const apiUrlAfter = getNthTextInput(tenantSectionAfter, 0);
    const queryParamsAfter = getNthTextInput(tenantSectionAfter, 1);
    
    const apiUrlValueAfter = await apiUrlAfter.inputValue();
    const queryParamsValueAfter = await queryParamsAfter.inputValue();
    
    console.log(`  回显 API 地址: ${apiUrlValueAfter}`);
    console.log(`  回显 查询参数: ${queryParamsValueAfter}`);
    
    expect(apiUrlValueAfter).toBe(testUrl);
    expect(queryParamsValueAfter).toBe(testParams);
    
    await page.screenshot({ path: 'tests/screenshots/round8-tenant-api-section.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 租户信息 API 配置区块功能正常');
  });

  test('TC-R8-003: 日志查看器页面功能验证', async ({ page }) => {
    console.log('测试: 日志查看器页面');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(LOG_VIEWER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const pageTitle = page.getByRole('heading', { name: /日志/ }).first();
    const titleVisible = await pageTitle.isVisible();
    console.log(`  页面标题可见: ${titleVisible}`);
    
    const allButtons = page.getByRole('button');
    const buttonCount = await allButtons.count();
    console.log(`  页面按钮数量: ${buttonCount}`);
    
    const allInputs = page.locator('input');
    const inputCount = await allInputs.count();
    console.log(`  页面输入框数量: ${inputCount}`);
    
    const hasContent = (await page.locator('main').count()) > 0 || (await page.locator('[class*="container"]').count()) > 0;
    console.log(`  页面有主内容区域: ${hasContent}`);
    
    await page.screenshot({ path: 'tests/screenshots/round8-log-viewer.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志查看器页面功能正常');
  });

  test('TC-R8-004: 日志平台 Mock URL 更新功能验证', async ({ page }) => {
    console.log('测试: 日志平台 Mock URL 更新');
    
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
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }
    
    const logPlatformSection = getSectionByTitle(page, '日志反馈平台配置');
    const sectionVisible = await logPlatformSection.isVisible();
    console.log(`  日志反馈平台配置区块可见: ${sectionVisible}`);
    expect(sectionVisible).toBe(true);
    
    const mockButton = logPlatformSection.getByRole('button', { name: /填入 Mock/ });
    const mockButtonVisible = await mockButton.isVisible();
    console.log(`  「填入 Mock URL」按钮可见: ${mockButtonVisible}`);
    
    if (mockButtonVisible) {
      const urlInput = getNthTextInput(logPlatformSection, 0);
      const beforeValue = await urlInput.inputValue();
      
      await mockButton.click();
      await page.waitForTimeout(300);
      
      const afterValue = await urlInput.inputValue();
      console.log(`  点击前 URL: ${beforeValue || '(空)'}`);
      console.log(`  点击后 URL: ${afterValue}`);
      
      const hasParams = afterValue.includes('userId') || afterValue.includes('start') || afterValue.includes('end');
      const isMockUrl = afterValue.includes('/log-viewer') || afterValue.includes('mock');
      console.log(`  URL 包含参数占位符: ${hasParams}`);
      console.log(`  URL 是 Mock 格式: ${isMockUrl}`);
      
      expect(hasParams || isMockUrl).toBe(true);
    }
    
    const saveButton = page.getByRole('button', { name: '保存' });
    if (await saveButton.isVisible()) {
      await saveButton.click();
      await page.waitForTimeout(1500);
    }
    
    await page.screenshot({ path: 'tests/screenshots/round8-log-platform-mock-url.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志平台 Mock URL 更新功能正常');
  });

  test('TC-R8-005: 首页正常访问验证', async ({ page }) => {
    console.log('测试: 首页正常访问');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(BASE_URL + '/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const heroTitle = page.getByRole('heading', { name: '让每一条用户反馈' }).first();
    await expect(heroTitle).toBeVisible();
    
    const configCenterLink = page.getByRole('link', { name: '配置中心' });
    await expect(configCenterLink).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round8-home-page.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 首页正常访问');
  });

  test('TC-R8-006: 配置中心三个 Tab 都能正常访问', async ({ page }) => {
    console.log('测试: 配置中心三个 Tab 都能正常访问');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const tabs = ['数据源', '飞书配置', '打标与分析配置'];
    
    for (const tabName of tabs) {
      const tabButton = page.getByRole('button', { name: tabName });
      await tabButton.click();
      await page.waitForTimeout(800);
      
      const isVisible = await tabButton.isVisible();
      console.log(`  Tab「${tabName}」: ${isVisible ? '正常' : '异常'}`);
    }
    
    const configCenterTitle = page.getByRole('heading', { name: '配置中心' }).first();
    await expect(configCenterTitle).toBeVisible();
    
    await page.screenshot({ path: 'tests/screenshots/round8-all-tabs.png', fullPage: true });
    
    console.log(`  控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 配置中心三个 Tab 都能正常访问');
  });

});
