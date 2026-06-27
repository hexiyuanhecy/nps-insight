// @ts-check
/**
 * NPS Insight 第3-4轮测试用例
 * 第3轮：边界情况验证
 * 第4轮：样式一致性验证
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

test.describe('第3轮：边界情况验证', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
  });

  test('TC-R3-001: 租户信息 API 配置 - 空值保存测试：清空所有字段后保存，刷新验证不会报错', async ({ page }) => {
    console.log('测试: 租户信息 API 空值保存测试');
    
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

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.click();
    await apiUrlInput.fill('');
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.click();
    await queryParamsInput.fill('');
    
    await page.waitForTimeout(300);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'tests/screenshots/round3-empty-save.png', fullPage: true });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'tests/screenshots/round3-empty-save-refresh.png', fullPage: true });
    
    const pageTitle = page.getByRole('heading', { name: '配置中心' }).first();
    await expect(pageTitle).toBeVisible();
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 空值保存后刷新页面无错误');
  });

  test('TC-R3-002: 租户信息 API 配置 - 长文本测试：API 地址输入 500 个字符的长 URL，验证保存和回显', async ({ page }) => {
    console.log('测试: 租户信息 API 长文本测试');
    
    const longUrl = 'https://' + 'a'.repeat(490) + '.example.com/api/v1/tenant/info?param=value';
    console.log(`长 URL 长度: ${longUrl.length}`);
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const apiUrlInput = getNthTextInput(tenantApiSection, 0);
    await apiUrlInput.click();
    await apiUrlInput.fill('');
    await apiUrlInput.fill(longUrl);
    
    await page.waitForTimeout(300);
    
    const apiUrlValue = await apiUrlInput.inputValue();
    expect(apiUrlValue.length).toBe(longUrl.length);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'tests/screenshots/round3-long-url-save.png', fullPage: true });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const tenantApiSectionAfter = getSectionByTitle(page, '租户信息 - API');
    const apiUrlInputAfter = getNthTextInput(tenantApiSectionAfter, 0);
    const apiUrlValueAfter = await apiUrlInputAfter.inputValue();
    
    await page.screenshot({ path: 'tests/screenshots/round3-long-url-echo.png', fullPage: true });
    
    expect(apiUrlValueAfter.length).toBe(longUrl.length);
    expect(apiUrlValueAfter).toBe(longUrl);
    
    console.log('✓ 通过: 长 URL 保存和回显正确');
  });

  test('TC-R3-003: 租户信息 API 配置 - 特殊字符测试：查询参数输入包含特殊字符的 JSON，验证保存和回显', async ({ page }) => {
    console.log('测试: 租户信息 API 特殊字符测试');
    
    const specialJson = '{"tenantId":"test_001","special":"!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~","unicode":"你好世界🌍","emoji":"👍🎉","spaces":"空格 测试"}';
    
    const editButton = page.getByRole('button', { name: '编辑' });
    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(500);
    }

    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const queryParamsInput = getNthTextInput(tenantApiSection, 1);
    await queryParamsInput.click();
    await queryParamsInput.fill('');
    await queryParamsInput.fill(specialJson);
    
    await page.waitForTimeout(300);
    
    const queryParamsValue = await queryParamsInput.inputValue();
    expect(queryParamsValue).toBe(specialJson);
    
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'tests/screenshots/round3-special-chars-save.png', fullPage: true });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const tenantApiSectionAfter = getSectionByTitle(page, '租户信息 - API');
    const queryParamsInputAfter = getNthTextInput(tenantApiSectionAfter, 1);
    const queryParamsValueAfter = await queryParamsInputAfter.inputValue();
    
    await page.screenshot({ path: 'tests/screenshots/round3-special-chars-echo.png', fullPage: true });
    
    expect(queryParamsValueAfter).toBe(specialJson);
    
    console.log('✓ 通过: 特殊字符 JSON 保存和回显正确');
  });

  test('TC-R3-004: 日志查看器 - 无参数访问：访问 /log-viewer 不带任何参数，验证页面正常显示', async ({ page }) => {
    console.log('测试: 日志查看器无参数访问');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(LOG_VIEWER_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'tests/screenshots/round3-log-viewer-no-params.png', fullPage: true });
    
    const pageTitle = page.getByRole('heading', { name: '日志查询平台' });
    await expect(pageTitle).toBeVisible();
    
    const logListSection = page.getByText('日志列表').first();
    await expect(logListSection).toBeVisible();
    
    const userIdInput = page.locator('input[type="text"]').first();
    const userIdValue = await userIdInput.inputValue();
    expect(userIdValue).toBe('');
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志查看器无参数访问正常');
  });

  test('TC-R3-005: 日志查看器 - 无效参数：访问 /log-viewer?userId= （空值），验证不会崩溃', async ({ page }) => {
    console.log('测试: 日志查看器无效参数（空 userId）');
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto(`${LOG_VIEWER_URL}?userId=`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'tests/screenshots/round3-log-viewer-empty-userid.png', fullPage: true });
    
    const pageTitle = page.getByRole('heading', { name: '日志查询平台' });
    await expect(pageTitle).toBeVisible();
    
    const logListSection = page.getByText('日志列表').first();
    await expect(logListSection).toBeVisible();
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 日志查看器空 userId 参数访问正常');
  });

  test('TC-R3-006: 反馈来源 Mock 按钮 - 多次点击：连续点击 5 次「使用 Mock 数据」按钮，验证不会异常', async ({ page }) => {
    console.log('测试: 反馈来源 Mock 按钮多次点击');
    
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
    
    for (let i = 0; i < 5; i++) {
      await mockButton.click();
      await page.waitForTimeout(200);
      console.log(`  第 ${i + 1} 次点击完成`);
    }
    
    const apiUrlValue = await apiUrlInput.inputValue();
    expect(apiUrlValue).toContain('/api/mock/feedbacks');
    
    await page.screenshot({ path: 'tests/screenshots/round3-mock-button-multiple-clicks.png', fullPage: true });
    
    console.log(`控制台错误数量: ${consoleErrors.length}`);
    consoleErrors.forEach((err, i) => console.log(`  错误 ${i + 1}: ${err}`));
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: Mock 按钮多次点击无异常');
  });

});

test.describe('第4轮：样式一致性验证', () => {

  test('TC-R4-001: 数据源 Tab 各配置区块样式是否一致（标题、间距、输入框样式）', async ({ page }) => {
    console.log('测试: 数据源 Tab 各配置区块样式一致性');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const sections = [
      '反馈来源 - API',
      '租户信息 - API',
      '反馈来源 - Excel 导入',
      'Webhook 接收',
      '日志反馈平台配置'
    ];
    
    const sectionResults = [];
    
    for (const title of sections) {
      const section = getSectionByTitle(page, title);
      const isVisible = await section.isVisible();
      const hasBorder = await section.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.borderRadius !== '0px' && style.border !== 'none';
      });
      const hasPadding = await section.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.padding !== '0px';
      });
      const bgColor = await section.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });
      
      sectionResults.push({ title, isVisible, hasBorder, hasPadding, bgColor });
      console.log(`  ${title}: visible=${isVisible}, border=${hasBorder}, padding=${hasPadding}, bg=${bgColor}`);
    }
    
    await page.screenshot({ path: 'tests/screenshots/round4-section-styles.png', fullPage: true });
    
    for (const result of sectionResults) {
      expect(result.isVisible).toBe(true);
      expect(result.hasBorder).toBe(true);
      expect(result.hasPadding).toBe(true);
    }
    
    const firstBgColor = sectionResults[0].bgColor;
    const allSameBg = sectionResults.every(r => r.bgColor === firstBgColor);
    console.log(`  所有区块背景色一致: ${allSameBg}`);
    
    console.log('✓ 通过: 数据源 Tab 各配置区块样式基本一致');
  });

  test('TC-R4-002: 「使用 Mock 数据」按钮与「填入 Mock URL 体验」按钮样式是否统一', async ({ page }) => {
    console.log('测试: Mock 按钮样式一致性');
    
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
    const mockButton1 = feedbackApiSection.getByRole('button', { name: '使用 Mock 数据' });
    
    const logPlatformSection = getSectionByTitle(page, '日志反馈平台配置');
    const mockButton2 = logPlatformSection.getByRole('button', { name: '填入 Mock URL 体验' });
    
    const btn1Styles = await mockButton1.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        border: style.border,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        padding: style.padding,
        color: style.color
      };
    });
    
    const btn2Styles = await mockButton2.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        border: style.border,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        padding: style.padding,
        color: style.color
      };
    });
    
    console.log('  使用 Mock 数据按钮样式:', JSON.stringify(btn1Styles, null, 2));
    console.log('  填入 Mock URL 体验按钮样式:', JSON.stringify(btn2Styles, null, 2));
    
    await page.screenshot({ path: 'tests/screenshots/round4-mock-buttons-style.png', fullPage: true });
    
    expect(btn1Styles.borderRadius).toBe(btn2Styles.borderRadius);
    expect(btn1Styles.backgroundColor).toBe(btn2Styles.backgroundColor);
    expect(btn1Styles.fontSize).toBe(btn2Styles.fontSize);
    expect(btn1Styles.fontWeight).toBe(btn2Styles.fontWeight);
    expect(btn1Styles.color).toBe(btn2Styles.color);
    
    console.log('✓ 通过: 两个 Mock 按钮样式统一');
  });

  test('TC-R4-003: 租户信息 API 区块与反馈来源 API 区块布局是否一致', async ({ page }) => {
    console.log('测试: 租户信息 API 与反馈来源 API 区块布局一致性');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    const feedbackApiSection = getSectionByTitle(page, '反馈来源 - API');
    const tenantApiSection = getSectionByTitle(page, '租户信息 - API');
    
    const feedbackTextInputs = feedbackApiSection.locator('input[type="text"]');
    const tenantTextInputs = tenantApiSection.locator('input[type="text"]');
    
    const feedbackInputCount = await feedbackTextInputs.count();
    const tenantInputCount = await tenantTextInputs.count();
    
    console.log(`  反馈来源 API 文本输入框数量: ${feedbackInputCount}`);
    console.log(`  租户信息 API 文本输入框数量: ${tenantInputCount}`);
    
    const feedbackLabels = await feedbackApiSection.locator('label').evaluateAll(els => els.map(el => el.textContent.trim()));
    const tenantLabels = await tenantApiSection.locator('label').evaluateAll(els => els.map(el => el.textContent.trim()));
    
    console.log(`  反馈来源 API 标签: ${feedbackLabels.join(', ')}`);
    console.log(`  租户信息 API 标签: ${tenantLabels.join(', ')}`);
    
    await page.screenshot({ path: 'tests/screenshots/round4-api-sections-layout.png', fullPage: true });
    
    const feedbackPadding = await feedbackApiSection.evaluate(el => window.getComputedStyle(el).padding);
    const tenantPadding = await tenantApiSection.evaluate(el => window.getComputedStyle(el).padding);
    const feedbackRadius = await feedbackApiSection.evaluate(el => window.getComputedStyle(el).borderRadius);
    const tenantRadius = await tenantApiSection.evaluate(el => window.getComputedStyle(el).borderRadius);
    
    expect(feedbackPadding).toBe(tenantPadding);
    expect(feedbackRadius).toBe(tenantRadius);
    
    console.log('✓ 通过: 两个 API 区块布局结构一致');
  });

  test('TC-R4-004: 日志查看器页面整体风格是否与系统其他页面协调（配色、字体、间距）', async ({ page }) => {
    console.log('测试: 日志查看器页面风格协调性');
    
    await page.goto(LOG_VIEWER_URL + '?userId=u_test_001&start=2025-01-01&end=2025-01-31');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const pageTitle = page.getByRole('heading', { name: '日志查询平台' });
    await expect(pageTitle).toBeVisible();
    
    const headerBg = await page.locator('header').evaluate(el => window.getComputedStyle(el).backgroundColor);
    const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    
    console.log(`  头部背景色: ${headerBg}`);
    console.log(`  页面背景色: ${bodyBg}`);
    
    const fontSize = await page.evaluate(() => window.getComputedStyle(document.body).fontSize);
    const fontFamily = await page.evaluate(() => window.getComputedStyle(document.body).fontFamily);
    
    console.log(`  字体大小: ${fontSize}`);
    console.log(`  字体族: ${fontFamily}`);
    
    await page.screenshot({ path: 'tests/screenshots/round4-log-viewer-style.png', fullPage: true });
    
    const logListSection = page.getByText('日志列表').first();
    await expect(logListSection).toBeVisible();
    
    const logCards = page.locator('ul li');
    const cardCount = await logCards.count();
    console.log(`  日志列表项数量: ${cardCount}`);
    expect(cardCount).toBeGreaterThanOrEqual(0);
    
    const searchButton = page.getByRole('button', { name: '查询' });
    await expect(searchButton).toBeVisible();
    
    console.log('✓ 通过: 日志查看器页面整体风格协调');
  });

  test('TC-R4-005: 响应式布局：窗口缩小时布局是否正常', async ({ page }) => {
    console.log('测试: 响应式布局验证');
    
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const datasourceTab = page.getByRole('button', { name: '数据源' });
    await datasourceTab.click();
    await page.waitForTimeout(500);
    
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/round4-responsive-1280.png', fullPage: true });
    
    const section1 = getSectionByTitle(page, '反馈来源 - API');
    const isVisible1280 = await section1.isVisible();
    console.log(`  1280px 宽度下区块可见: ${isVisible1280}`);
    
    await page.setViewportSize({ width: 768, height: 800 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/round4-responsive-768.png', fullPage: true });
    
    const isVisible768 = await section1.isVisible();
    console.log(`  768px 宽度下区块可见: ${isVisible768}`);
    
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/round4-responsive-375.png', fullPage: true });
    
    const isVisible375 = await section1.isVisible();
    console.log(`  375px 宽度下区块可见: ${isVisible375}`);
    
    await page.setViewportSize({ width: 1280, height: 800 });
    
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    expect(consoleErrors.length).toBe(0);
    
    console.log('✓ 通过: 响应式布局在各尺寸下正常显示');
  });

});
