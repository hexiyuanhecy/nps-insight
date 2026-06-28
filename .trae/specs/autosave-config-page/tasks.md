# 配置页自动保存与可用性增强 - 任务列表

## [x] Task 1: AutoSaveField 自动保存组件 + 增量保存
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 创建 `AutoSaveField` 包装组件，内部维护 3 种状态：idle/saving/error
  - 失焦 1s 后触发保存
  - 保存中：右侧显示 loading 图标
  - 失败：右侧显示红色重试按钮
  - 成功：无视觉反馈（loading 消失）
  - 支持包装 TextField/SecretField/TextArea/SelectField/TimePicker
  - **增量保存**：调用 saveConfig 时只传改动的字段路径（如 `{ feishu: { appId: 'xxx' } }`），不传整个配置
  - 同一模块内多个字段快速修改时，合并为一次请求（debounce 1s）
  - 后端 saveConfigV3 确认支持部分字段合并保存（spread 合并逻辑验证）
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: 失焦 1s 后调用 onSave
  - `programmatic` TR-1.2: 保存失败显示重试按钮，点击重试调用 onSave
  - `programmatic` TR-1.3: 保存中显示 loading 图标
  - `programmatic` TR-1.4: 请求体只包含改动字段（增量），不含整个配置对象
  - `programmatic` TR-1.5: 后端正确合并增量配置到 KV 存储
  - `human-judgement` TR-1.6: 交互流畅，状态切换自然

## [x] Task 2: 周打标/月分析按钮可用性
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 创建 `useCanRunTasks` hook，返回 `canRun` 和 `missingItems`
  - 判断条件：飞书应用绑定 + 用户授权 + 云资源初始化 + 多维表格绑定 + 数据源配置 + AI 配置
  - TopActionButtons 中两个按钮禁用时 hover 显示 tooltip
  - 配置变化时实时重新判断
- **Acceptance Criteria Addressed**: AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-2.1: 缺少任一必需配置时 canRun=false
  - `programmatic` TR-2.2: 所有必需配置齐全时 canRun=true
  - `human-judgement` TR-2.3: 禁用按钮 hover 提示清晰

## [ ] Task 3: 定时任务默认值修复
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 确保 GET /api/config 返回的 schedule 有正确的默认分解字段
  - 周同步默认：每周一 09:00（syncUnit=week, syncTime=09:00, syncWeekDay=1）
  - 月分析默认：每月 1 日 00:00（analysisUnit=month, analysisTime=00:00, analysisMonthDay=1）
  - 前端 TaggingTab 中 Cron 预览正确显示
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `programmatic` TR-3.1: 无配置时 API 返回正确默认值
  - `programmatic` TR-3.2: 前端显示与 API 返回一致
  - `programmatic` TR-3.3: 保存后刷新回显正确

## [ ] Task 4: 端到端全流程验证
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - 从空白配置页开始完整走一遍流程
  - 验证：飞书配置 → 授权 → 云资源初始化 → 数据源 → AI → 保存 → 回显 → 周打标 → 月分析
  - 检查：消息内容、按钮状态、表格字段、文档内容、飞书对话
- **Acceptance Criteria Addressed**: AC-1~AC-6
- **Test Requirements**:
  - `human-judgement` TR-4.1: 配置保存后刷新回显正确
  - `human-judgement` TR-4.2: 周打标流程正常，消息/表格/文档正确
  - `human-judgement` TR-4.3: 月分析流程正常，消息/表格/文档正确
  - `human-judgement` TR-4.4: 按钮可用性随配置变化实时更新
