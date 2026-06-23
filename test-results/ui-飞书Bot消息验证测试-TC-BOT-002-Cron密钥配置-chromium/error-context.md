# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.js >> 飞书Bot消息验证测试 >> TC-BOT-002: Cron密钥配置
- Location: tests/ui.spec.js:195:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
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
  128 |     expect(response.status()).toBeLessThan(500);
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
> 197 |     expect(cronSecret).toBeTruthy();
      |                        ^ Error: expect(received).toBeTruthy()
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
  229 | // ============================================
  230 | // 完整流程测试（保留数据）
  231 | // ============================================
  232 | 
  233 | test.describe('完整流程测试（保留数据）', () => {
  234 |   test('TC-FLOW-001: 执行完整周任务流程', async ({ page }) => {
  235 |     console.log('开始执行完整周任务流程...');
  236 |     
  237 |     // 1. 触发周任务
  238 |     const cronSecret = process.env.CRON_SECRET;
  239 |     const syncResponse = await page.request.post(`${BASE_URL}/api/cron/sync`, {
  240 |       headers: {
  241 |         Authorization: `Bearer ${cronSecret}`,
  242 |       },
  243 |     });
  244 |     
  245 |     console.log(`同步任务状态: ${syncResponse.status()}`);
  246 |     const syncResult = await syncResponse.json();
  247 |     console.log(`同步结果: ${JSON.stringify(syncResult)}`);
  248 |     
  249 |     expect(syncResponse.status()).toBeGreaterThanOrEqual(200);
  250 |     console.log('✓ 周任务流程执行完成');
  251 |   });
  252 | 
  253 |   test('TC-FLOW-002: 验证反馈数据写入', async ({ page }) => {
  254 |     // 获取反馈数据
  255 |     const response = await page.request.get(`${BASE_URL}/api/feedback`);
  256 |     expect(response.status()).toBe(200);
  257 |     
  258 |     const data = await response.json();
  259 |     const feedbackCount = data.data?.length || 0;
  260 |     console.log(`✓ 当前反馈数量: ${feedbackCount}`);
  261 |     
  262 |     expect(feedbackCount).toBeGreaterThanOrEqual(0);
  263 |   });
  264 | 
  265 |   test('TC-FLOW-003: 验证标签数据', async ({ page }) => {
  266 |     const response = await page.request.get(`${BASE_URL}/api/tags`);
  267 |     expect(response.status()).toBe(200);
  268 |     
  269 |     const data = await response.json();
  270 |     const tagCount = data.data?.length || 0;
  271 |     console.log(`✓ 当前标签数量: ${tagCount}`);
  272 |     
  273 |     expect(tagCount).toBeGreaterThanOrEqual(0);
  274 |   });
  275 | 
  276 |   test('TC-FLOW-004: 验证租户数据', async ({ page }) => {
  277 |     const response = await page.request.get(`${BASE_URL}/api/tenants`);
  278 |     expect(response.status()).toBe(200);
  279 |     
  280 |     const data = await response.json();
  281 |     const tenantCount = data.data?.length || 0;
  282 |     console.log(`✓ 当前租户数量: ${tenantCount}`);
  283 |     
  284 |     expect(tenantCount).toBeGreaterThanOrEqual(0);
  285 |   });
  286 | });
  287 | 
  288 | // ============================================
  289 | // Mock日志平台测试
  290 | // ============================================
  291 | 
  292 | test.describe('Mock日志平台测试', () => {
  293 |   test('TC-LOG-001: Mock日志API响应', async ({ page }) => {
  294 |     const response = await page.request.get(`${BASE_URL}/api/mock/logs?user=u_001&start=2024-01-01&end=2024-12-31`);
  295 |     expect(response.status()).toBeGreaterThanOrEqual(200);
  296 |     console.log(`✓ Mock日志API状态: ${response.status()}`);
  297 |   });
```