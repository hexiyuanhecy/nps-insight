# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.js >> API端点测试 >> TC-API-003: 租户API响应
- Location: tests/ui.spec.js:125:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 500
Received:   500
```

# Test source

```ts
  28  | // ============================================
  29  | 
  30  | test.describe('首页测试', () => {
  31  |   test('TC-HOME-001: 首页正常访问', async ({ page }) => {
  32  |     await page.goto(BASE_URL);
  33  |     await page.waitForLoadState('networkidle');
  34  |     await page.waitForTimeout(2000);
  35  |     
  36  |     // 截图保存
  37  |     await page.screenshot({ path: 'tests/screenshots/home.png', fullPage: true });
  38  |     
  39  |     // 验证页面标题或主要内容存在
  40  |     const bodyText = await page.textContent('body');
  41  |     expect(bodyText).toBeTruthy();
  42  |     console.log('✓ 首页访问成功');
  43  |   });
  44  | 
  45  |   test('TC-HOME-002: 首页显示统计概览', async ({ page }) => {
  46  |     await page.goto(BASE_URL);
  47  |     await page.waitForLoadState('networkidle');
  48  |     await page.waitForTimeout(2000);
  49  |     
  50  |     // 检查是否有统计相关的文本
  51  |     const pageContent = await page.textContent('body');
  52  |     const hasStats = pageContent.includes('反馈') || pageContent.includes('NPS') || pageContent.includes('统计');
  53  |     console.log(`✓ 页面包含统计内容: ${hasStats}`);
  54  |   });
  55  | });
  56  | 
  57  | // ============================================
  58  | // 管理后台测试
  59  | // ============================================
  60  | 
  61  | test.describe('管理后台测试', () => {
  62  |   test('TC-ADMIN-001: 管理后台正常访问', async ({ page }) => {
  63  |     await page.goto(ADMIN_URL);
  64  |     await page.waitForLoadState('networkidle');
  65  |     await page.waitForTimeout(2000);
  66  |     
  67  |     await page.screenshot({ path: 'tests/screenshots/admin.png', fullPage: true });
  68  |     
  69  |     const bodyText = await page.textContent('body');
  70  |     expect(bodyText).toBeTruthy();
  71  |     console.log('✓ 管理后台访问成功');
  72  |   });
  73  | 
  74  |   test('TC-ADMIN-002: 配置中心显示', async ({ page }) => {
  75  |     await page.goto(ADMIN_URL);
  76  |     await page.waitForLoadState('networkidle');
  77  |     
  78  |     // 检查配置相关的按钮或链接
  79  |     const pageContent = await page.textContent('body');
  80  |     const hasConfig = pageContent.includes('配置') || pageContent.includes('设置');
  81  |     expect(hasConfig).toBeTruthy();
  82  |     console.log('✓ 配置中心显示正常');
  83  |   });
  84  | 
  85  |   test('TC-ADMIN-003: 标签管理入口', async ({ page }) => {
  86  |     await page.goto(ADMIN_URL);
  87  |     await page.waitForLoadState('networkidle');
  88  |     
  89  |     // 查找标签管理相关元素
  90  |     const tagLink = page.locator('text=标签').first();
  91  |     const isVisible = await tagLink.isVisible().catch(() => false);
  92  |     console.log(`✓ 标签管理入口可见: ${isVisible}`);
  93  |   });
  94  | 
  95  |   test('TC-ADMIN-004: 定时任务入口', async ({ page }) => {
  96  |     await page.goto(ADMIN_URL);
  97  |     await page.waitForLoadState('networkidle');
  98  |     
  99  |     // 查找定时任务相关元素
  100 |     const cronLink = page.locator('text=任务').first();
  101 |     const isVisible = await cronLink.isVisible().catch(() => false);
  102 |     console.log(`✓ 定时任务入口可见: ${isVisible}`);
  103 |   });
  104 | });
  105 | 
  106 | // ============================================
  107 | // API端点测试
  108 | // ============================================
  109 | 
  110 | test.describe('API端点测试', () => {
  111 |   test('TC-API-001: 反馈API响应', async ({ page }) => {
  112 |     const response = await page.request.get(`${BASE_URL}/api/feedback`);
  113 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  114 |     expect(response.status()).toBeLessThan(500);
  115 |     console.log(`✓ 反馈API状态: ${response.status()}`);
  116 |   });
  117 | 
  118 |   test('TC-API-002: 标签API响应', async ({ page }) => {
  119 |     const response = await page.request.get(`${BASE_URL}/api/tags`);
  120 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  121 |     expect(response.status()).toBeLessThan(500);
  122 |     console.log(`✓ 标签API状态: ${response.status()}`);
  123 |   });
  124 | 
  125 |   test('TC-API-003: 租户API响应', async ({ page }) => {
  126 |     const response = await page.request.get(`${BASE_URL}/api/tenants`);
  127 |     expect(response.status()).toBeGreaterThanOrEqual(200);
> 128 |     expect(response.status()).toBeLessThan(500);
      |                               ^ Error: expect(received).toBeLessThan(expected)
  129 |     console.log(`✓ 租户API状态: ${response.status()}`);
  130 |   });
  131 | 
  132 |   test('TC-API-004: 分析API响应', async ({ page }) => {
  133 |     const response = await page.request.get(`${BASE_URL}/api/analysis`);
  134 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  135 |     expect(response.status()).toBeLessThan(500);
  136 |     console.log(`✓ 分析API状态: ${response.status()}`);
  137 |   });
  138 | 
  139 |   test('TC-API-005: 配置API响应', async ({ page }) => {
  140 |     const response = await page.request.get(`${BASE_URL}/api/config`);
  141 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  142 |     expect(response.status()).toBeLessThan(500);
  143 |     console.log(`✓ 配置API状态: ${response.status()}`);
  144 |   });
  145 | });
  146 | 
  147 | // ============================================
  148 | // 多维表格验证测试
  149 | // ============================================
  150 | 
  151 | test.describe('多维表格验证测试', () => {
  152 |   test('TC-BITABLE-001: 多维表格链接有效', async ({ page }) => {
  153 |     // 验证BITABLE_URL配置存在
  154 |     expect(BITABLE_URL).toBeTruthy();
  155 |     console.log(`✓ 多维表格URL配置: ${BITABLE_URL}`);
  156 |   });
  157 | 
  158 |   test('TC-BITABLE-002: 反馈列表表存在', async ({ page }) => {
  159 |     // 验证环境变量中表ID配置
  160 |     const tableId = process.env.BITABLE_TABLE_ID;
  161 |     expect(tableId).toBeTruthy();
  162 |     console.log(`✓ 反馈列表表ID配置: ${tableId}`);
  163 |   });
  164 | 
  165 |   test('TC-BITABLE-003: 标签库表存在', async ({ page }) => {
  166 |     const tableId = process.env.BITABLE_TABLE_ID_TAGS;
  167 |     expect(tableId).toBeTruthy();
  168 |     console.log(`✓ 标签库表ID配置: ${tableId}`);
  169 |   });
  170 | 
  171 |   test('TC-BITABLE-004: 租户信息表存在', async ({ page }) => {
  172 |     const tableId = process.env.BITABLE_TABLE_ID_TENANTS;
  173 |     expect(tableId).toBeTruthy();
  174 |     console.log(`✓ 租户信息表ID配置: ${tableId}`);
  175 |   });
  176 | 
  177 |   test('TC-BITABLE-005: Top问题表存在', async ({ page }) => {
  178 |     const tableId = process.env.BITABLE_TABLE_ID_ANALYSIS;
  179 |     expect(tableId).toBeTruthy();
  180 |     console.log(`✓ Top问题表ID配置: ${tableId}`);
  181 |   });
  182 | });
  183 | 
  184 | // ============================================
  185 | // 飞书Bot消息验证测试
  186 | // ============================================
  187 | 
  188 | test.describe('飞书Bot消息验证测试', () => {
  189 |   test('TC-BOT-001: 通知群ID配置', async ({ page }) => {
  190 |     const chatId = process.env.NOTIFICATION_CHAT_ID;
  191 |     expect(chatId).toBeTruthy();
  192 |     console.log(`✓ 通知群ID配置: ${chatId}`);
  193 |   });
  194 | 
  195 |   test('TC-BOT-002: Cron密钥配置', async ({ page }) => {
  196 |     const cronSecret = process.env.CRON_SECRET;
  197 |     expect(cronSecret).toBeTruthy();
  198 |     console.log(`✓ Cron密钥已配置`);
  199 |   });
  200 | 
  201 |   test('TC-BOT-003: 手动触发周任务', async ({ page }) => {
  202 |     const cronSecret = process.env.CRON_SECRET;
  203 |     const response = await page.request.post(`${BASE_URL}/api/cron/sync`, {
  204 |       headers: {
  205 |         Authorization: `Bearer ${cronSecret}`,
  206 |       },
  207 |     });
  208 |     
  209 |     // 验证响应（可能是200成功或500失败，取决于数据）
  210 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  211 |     expect(response.status()).toBeLessThan(600);
  212 |     console.log(`✓ 周任务触发状态: ${response.status()}`);
  213 |   });
  214 | 
  215 |   test('TC-BOT-004: 手动触发月任务', async ({ page }) => {
  216 |     const cronSecret = process.env.CRON_SECRET;
  217 |     const response = await page.request.post(`${BASE_URL}/api/cron/monthly`, {
  218 |       headers: {
  219 |         Authorization: `Bearer ${cronSecret}`,
  220 |       },
  221 |     });
  222 |     
  223 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  224 |     expect(response.status()).toBeLessThan(600);
  225 |     console.log(`✓ 月任务触发状态: ${response.status()}`);
  226 |   });
  227 | });
  228 | 
```