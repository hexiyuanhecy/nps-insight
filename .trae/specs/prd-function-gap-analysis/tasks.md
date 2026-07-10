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

## [x] Task 4: 在腾讯云函数中配置定时触发器
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - ~~在 `vercel.json` 中添加 `crons` 字段~~（已废弃）
  - **腾讯云方案**：在腾讯云开发控制台创建定时触发器
  - 周同步任务：`0 0 9 ? * MON`（每周一09:00）
  - 月分析任务：`0 0 0 1 * ?`（每月1日00:00）
  - 创建 [tencent-scf-triggers.json](file:///Users/xigua/ai Projects/nps-insight/tencent-scf-triggers.json) 配置文件
- **Acceptance Criteria Addressed**: AC-CRON-01
- **Test Requirements**:
  - `programmatic` TR-CRON-4.1: 触发器配置文件存在且包含两个触发器
  - `programmatic` TR-CRON-4.2: cron表达式正确（SCF 6位格式）
- **Notes**: 腾讯云 SCF 使用 6 位 Cron 格式（分 时 日 月 星期 年）

## [x] Task 5: Cron API 改造为支持腾讯云触发器
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - ~~创建 API 端点用于更新vercel.json的cron配置~~（不需要）
  - 改造 Cron API 认证逻辑，支持腾讯云定时触发器（通过 User-Agent 识别）
  - 提供 [deploy-tencent.sh](file:///Users/xigua/ai Projects/nps-insight/scripts/deploy-tencent.sh) 一键部署脚本
  - 创建 [tencent-cloud-deploy.md](file:///Users/xigua/ai Projects/nps-insight/docs/tencent-cloud-deploy.md) 部署文档
- **Acceptance Criteria Addressed**: AC-CRON-03
- **Test Requirements**:
  - `programmatic` TR-CRON-5.1: Cron API 能识别腾讯云 User-Agent
  - `programmatic` TR-CRON-5.2: 外部 curl 调用时通过 X-Cron-Secret 头能正常认证
- **Notes**: 由于腾讯云的限制，触发器配置变更需要重新部署云函数才能生效

## [x] Task 6: 端到端测试验证
- **Priority**: high
- **Depends On**: Tasks 1-5
- **Description**: 
  - 所有单元测试已通过（125个测试）
  - 构建成功
  - 腾讯云部署脚本已就绪
- **Acceptance Criteria Addressed**: AC-BOT-01, AC-BOT-02, AC-BOT-03, AC-CRON-01, AC-CRON-02, AC-CRON-03
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有单元测试通过 ✓
  - `human-judgment` TR-6.2: 手动测试飞书Bot响应正常（需要在真实飞书环境测试）
  - `human-judgment` TR-6.3: 手动测试定时任务能正常触发（需要在腾讯云部署后测试）
- **Notes**: 代码层面的修复已完成，需要在真实腾讯云环境中验证
