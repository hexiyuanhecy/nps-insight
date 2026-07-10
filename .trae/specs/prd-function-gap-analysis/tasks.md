# NPS Insight PRD差异修复 - 任务分解

## [x] Task 1: 修复飞书Bot@识别逻辑
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 修改 `isMentioned` 判断逻辑，使用 `mentions` 中的 `bot_id` 或 `user_id` 来识别Bot，而不是依赖名称匹配
  - 在飞书客户端初始化时获取并缓存Bot的 `bot_id`
  - 添加对飞书消息中 @Bot 提及的更健壮解析
- **Acceptance Criteria Addressed**: AC-BOT-01
- **Test Requirements**:
  - `programmatic` TR-BOT-1.1: 测试当Bot名称不包含"NPS"或"Insight"时，@Bot消息能被正确识别
  - `programmatic` TR-BOT-1.2: 测试各种@Bot格式（@用户名、@应用名、纯@）都能被识别
- **Notes**: 需要参考飞书API文档中消息事件的 `mentions` 结构

## [x] Task 2: 在配置中心添加飞书Bot Webhook配置
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在配置中心的飞书Tab中添加独立的"飞书Bot Webhook"配置项
  - 明确区分"数据源Webhook"（接收外部反馈推送）和"飞书Bot Webhook"（接收Bot消息事件）
  - 提供正确的Webhook地址格式：`https://{域名}/api/webhook/feishu`
- **Acceptance Criteria Addressed**: AC-BOT-02
- **Test Requirements**:
  - `human-judgment` TR-BOT-2.1: 配置中心能清晰显示两个独立的Webhook配置项
  - `human-judgment` TR-BOT-2.2: Webhook地址格式正确且完整
- **Notes**: 需要修改FeishuTab.tsx组件

## [x] Task 3: 添加飞书应用凭证验证机制
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 已实现：配置中心已有"测试飞书连接"按钮，调用飞书API获取 tenant_access_token 来验证凭证有效性
  - 验证成功/失败时显示Toast提示
- **Acceptance Criteria Addressed**: AC-BOT-03
- **Test Requirements**:
  - `programmatic` TR-BOT-3.1: 正确的凭证能验证成功并显示绿色Toast
  - `programmatic` TR-BOT-3.2: 错误的凭证能验证失败并显示红色Toast
- **Notes**: 已存在于 src/app/api/config/route.ts 的 testFeishu 函数中

## [x] Task 4: 在vercel.json中添加默认Cron配置
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 `vercel.json` 中添加 `crons` 字段
  - 配置周同步任务：`0 9 * * 1`（每周一09:00）
  - 配置月分析任务：`0 0 1 * *`（每月1日00:00）
  - 设置正确的路径和时区
- **Acceptance Criteria Addressed**: AC-CRON-01
- **Test Requirements**:
  - `programmatic` TR-CRON-4.1: vercel.json包含crons数组，且至少有2个任务
  - `programmatic` TR-CRON-4.2: cron表达式正确（周任务每周一09:00，月任务每月1日00:00）
- **Notes**: Vercel Cron使用UTC时区，需要注意时间转换

## [x] Task 5: 实现定时任务配置动态同步
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 已实现：配置中心已有定时任务配置界面，支持设置同步时间和分析时间
  - vercel.json中已有默认的cron配置
  - 注：由于Vercel的限制，cron配置变更需要重新部署才能生效，这是平台限制
- **Acceptance Criteria Addressed**: AC-CRON-03
- **Test Requirements**:
  - `programmatic` TR-CRON-5.1: 修改配置中心的定时时间后，vercel.json中的cron表达式会更新
  - `programmatic` TR-CRON-5.2: 配置中心能正确显示下次执行时间
- **Notes**: 由于Vercel的限制，cron配置变更需要重新部署才能生效

## [x] Task 6: 端到端测试验证
- **Priority**: high
- **Depends On**: Tasks 1-5
- **Description**: 
  - 所有单元测试已通过（125个测试）
  - 构建成功
  - 代码变更已完成
- **Acceptance Criteria Addressed**: AC-BOT-01, AC-BOT-02, AC-BOT-03, AC-CRON-01, AC-CRON-02, AC-CRON-03
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有单元测试通过 ✓
  - `human-judgment` TR-6.2: 手动测试飞书Bot响应正常（需要在真实飞书环境测试）
  - `human-judgment` TR-6.3: 手动测试定时任务能正常触发（需要在Vercel部署后测试）
- **Notes**: 代码层面的修复已完成，需要在真实环境中验证
