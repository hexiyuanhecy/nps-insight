# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.spec.js >> 完整流程测试（保留数据） >> TC-FLOW-004: 验证租户数据
- Location: tests/ui.spec.js:276:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
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
> 278 |     expect(response.status()).toBe(200);
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
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
  298 | 
  299 |   test('TC-LOG-002: Mock日志数据格式', async ({ page }) => {
  300 |     const response = await page.request.get(`${BASE_URL}/api/mock/logs?user=u_001&start=2024-01-01&end=2024-12-31`);
  301 |     
  302 |     if (response.status() === 200) {
  303 |       const data = await response.json();
  304 |       console.log(`✓ Mock日志数据格式正确`);
  305 |       console.log(`  - userId: ${data.userId}`);
  306 |       console.log(`  - logs数量: ${data.logs?.length || 0}`);
  307 |       console.log(`  - summary: ${JSON.stringify(data.summary)}`);
  308 |     }
  309 |   });
  310 | });
  311 | 
  312 | // ============================================
  313 | // 测试结果汇总
  314 | // ============================================
  315 | 
  316 | test.describe('测试结果汇总', () => {
  317 |   test('TC-SUMMARY-001: 生成测试报告', async ({ page }) => {
  318 |     console.log('\n========================================');
  319 |     console.log('E2E测试执行完成');
  320 |     console.log('========================================');
  321 |     console.log('请查看上方日志获取详细结果');
  322 |     console.log('截图保存在: tests/screenshots/');
  323 |     console.log('========================================\n');
  324 |   });
  325 | });
  326 | 
```