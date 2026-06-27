# 配置中心保存机制修复 Spec

## Why

当前配置中心的保存机制存在严重体验问题：
1. 单个模块保存时，所有模块都进入 loading 状态，用户无法编辑其他内容
2. 接口调用失败后没有取消 loading 状态
3. "开始周打标"和"开始月分析"按钮不应该阻塞用户操作

## What Changes

- 将全局 `isLoading` 状态改为每个 Tab 独立的加载状态
- "开始周打标"和"开始月分析"按钮移除 loading 状态，改为纯 toast 通知
- 所有异步操作（保存、测试、绑定等）失败时必须取消 loading 状态

## Impact

- 受影响文件：
  - `use-config-center.ts` — 移除全局 isLoading，改为 Tab 级独立状态
  - `use-config-actions.ts` — 所有 action 不再设置全局 loading
  - `ConfigCenter.tsx` — 传递 Tab 级 loading 状态到子组件
  - `FeishuTab.tsx`、`DatasourceTab.tsx`、`TaggingTab.tsx` — 使用独立的 loading 状态

## ADDED Requirements

### Requirement: Tab 级别独立加载状态

配置中心的每个 Tab（飞书配置、数据源、打标与分析配置）应维护独立的加载状态，保存或测试操作仅影响当前 Tab，不阻塞其他 Tab 的编辑功能。

#### Scenario: 保存飞书配置时
- **WHEN** 用户在"飞书配置"Tab 点击保存按钮
- **THEN** 仅"飞书配置"Tab 进入加载状态，其他 Tab 保持可编辑

#### Scenario: 保存数据源配置时
- **WHEN** 用户在"数据源"Tab 点击保存按钮
- **THEN** 仅"数据源"Tab 进入加载状态，其他 Tab 保持可编辑

#### Scenario: 接口失败时
- **WHEN** 任何异步操作（保存/测试/绑定）抛出异常或返回错误
- **THEN** 当前 Tab 立即取消加载状态，并显示错误 Toast

## MODIFIED Requirements

### Requirement: 周打标/月分析按钮无阻塞

"开始周打标"和"开始月分析"按钮点击后：
- 不显示 loading 状态
- 显示一次 Toast 提示用户"任务已启动，请及时查看多维表格"
- 用户可以继续操作界面，不被阻塞

#### Scenario: 点击开始周打标
- **WHEN** 用户点击"开始周打标"按钮
- **THEN** 按钮不进入 loading 状态，显示 Toast "周打标已开始，请及时查看多维表格"

#### Scenario: 点击开始月分析
- **WHEN** 用户点击"开始月分析"按钮
- **THEN** 按钮不进入 loading 状态，显示 Toast "月分析已开始，请及时查看多维表格"

#### Scenario: 周打标/月分析接口调用失败
- **WHEN** 周打标/月分析 API 调用失败
- **THEN** 显示错误 Toast，按钮保持可用状态
