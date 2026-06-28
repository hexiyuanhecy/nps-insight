# 配置页自动保存与可用性增强 - PRD

## Overview
- **Summary**: 配置中心页改为失焦自动保存模式，去掉"编辑/保存"按钮；增强周打标/月分析按钮的可用性判断；修复定时任务默认值展示；完成端到端全流程验证。
- **Purpose**: 提升配置页操作体验（即改即存，减少操作步骤），明确按钮可用条件（避免用户点了才发现不能用），修复默认值显示问题。
- **Target Users**: NPS Insight 管理员

## Goals
- 输入框失焦 1s 后自动保存，右侧显示 loading/重试状态
- 周打标/月分析按钮在配置不满足时禁用，hover 提示缺少哪些配置
- 定时任务周期正确展示默认值（周同步=每周一09:00，月分析=每月1日00:00）
- 完整端到端流程验证通过

## Non-Goals
- 不做实时协作/多人编辑（单用户场景）
- 不做配置版本历史/回滚
- 不做字段级别的权限控制
- 不改 API 结构（复用现有 saveConfigV3 接口，按字段保存）

## Background & Context
- 现状：点击"编辑"→ 改配置 → 点"保存"，两步操作，且保存按钮在顶部容易错过
- 现状：周打标/月分析按钮一直可点，点了才报错，体验差
- 现状：定时任务默认值有时显示不对（Cron 解析问题）
- 现状：3 个 Tab，每个 Tab 下有多个配置项

## Functional Requirements

### FR-1: 自动保存输入组件
- 所有配置输入框（TextField/SecretField/TextArea/SelectField/TimePicker）改为自动保存模式
- 失焦（onBlur）后延迟 1000ms 自动调用保存
- **增量保存**：只提交改动的字段（如 `{ feishu: { appId: 'xxx' } }`），不传整个配置对象
- 输入框右侧显示状态：保存中（loading 图标）、失败（重试按钮）、成功（无显示）
- 保存成功无 toast 提示，保存失败显示红色重试按钮
- 同一模块内快速连续修改多个字段时，合并为一次保存请求（debounce 1s）

### FR-2: 周打标/月分析按钮可用性
- 顶部操作栏的"开始周打标"和"开始月分析"按钮，根据配置自动启用/禁用
- 禁用时 hover 显示 tooltip，列出缺少的配置项
- 满足条件：
  1. 飞书应用已绑定（appId + appSecret）
  2. 用户已授权（有 userOpenId）
  3. 云资源已初始化（根文件夹、周报文件夹、月报文件夹、多维表格）
  4. 多维表格已绑定（appToken）
  5. 数据源已配置（反馈 API 地址 或 Excel 导入过）
  6. AI 模型已配置（provider + apiKey + model）

### FR-3: 定时任务默认值修复
- 周同步默认：每周一 09:00（Cron: `0 9 * * 1`）
- 月分析默认：每月 1 日 00:00（Cron: `0 0 1 * *`）
- 从 KV/环境变量读取的 Cron 能正确解析为前端选择器值

### FR-4: 端到端流程验证
- 从空白配置页开始，完整走一遍：配置飞书 → 授权 → 初始化云资源 → 配置数据源 → 配置 AI → 保存 → 回显 → 周打标 → 月分析
- 验证：消息发送内容正确、按钮点击正常、表格字段正确、文档内容正确、飞书对话正常

## Non-Functional Requirements
- **NFR-1**: 自动保存延迟 1s，误差 ±100ms
- **NFR-2**: 保存失败重试不超过 3 次（避免死循环）
- **NFR-3**: 按钮可用性判断在 100ms 内完成

## Constraints
- **Technical**: Next.js 14 + React + TypeScript + TailwindCSS
- **Business**: 不能破坏现有配置 API 接口契约
- **Dependencies**: 复用现有 `/api/config` 接口的 `saveConfigV3`，支持增量保存（部分字段提交）

## Assumptions
- 单用户场景，不会出现并发修改冲突
- 保存失败可以通过重试按钮手动恢复
- 用户能理解"失焦自动保存"的交互模式

## Acceptance Criteria

### AC-1: 自动保存交互
- **Given**: 用户在配置页输入框中修改内容
- **When**: 用户点击输入框外部（失焦）超过 1 秒
- **Then**: 自动调用保存接口，输入框右侧短暂显示 loading 图标，保存成功后消失
- **Verification**: `human-judgment`

### AC-2: 保存失败重试
- **Given**: 自动保存时接口返回错误
- **When**: 保存失败
- **Then**: 输入框右侧显示红色重试按钮，点击可重新保存
- **Verification**: `programmatic`

### AC-3: 按钮可用性判断
- **Given**: 配置未完整（缺少 1 项或多项）
- **When**: 查看顶部操作栏
- **Then**: "开始周打标"和"开始月分析"按钮禁用，hover 显示缺少的配置项
- **Verification**: `human-judgment`

### AC-4: 配置完整时按钮可用
- **Given**: 所有必需配置项都已填写
- **When**: 查看顶部操作栏
- **Then**: 两个按钮都可用
- **Verification**: `human-judgment`

### AC-5: 定时任务默认值正确
- **Given**: 首次进入配置页（无保存过的配置）
- **When**: 查看"任务与运营"Tab
- **Then**: 周同步显示"每周一 09:00"，月分析显示"每月 1 日 00:00"
- **Verification**: `programmatic`

### AC-6: 配置回显正确
- **Given**: 用户保存了配置后刷新页面
- **When**: 页面加载完成
- **Then**: 所有配置项正确显示之前保存的值
- **Verification**: `programmatic`

## Open Questions
- 无
