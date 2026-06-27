# 配置页面编辑模式 Spec

## Why
当前配置页面的交互存在问题：每个配置模块都有独立的保存按钮，导致用户需要频繁点击保存，且 loading 状态管理复杂。用户需要一个更清晰的编辑流程：先编辑所有配置，最后统一保存。

## What Changes
- 右上角新增「编辑」按钮，点击后所有输入框变为可编辑状态
- 右上角「编辑」按钮消失，显示「保存」按钮
- 所有输入框默认只读（disabled），编辑按钮禁用状态
- 点击「保存」时，输入框禁用，显示按钮 loading
- 删除页面所有独立的「保存配置」按钮
- 「开始周打标」和「开始月分析」按钮移至右上角，与编辑/保存按钮一排
- 周打标和月分析按钮有独立的 loading 状态，不受其他配置项影响

## Impact
- Affected components: `FeishuTab.tsx`, `DatasourceTab.tsx`, `TaggingTab.tsx`, `ConfigCenter.tsx`
- Affected hooks: `use-config-actions.ts`, `use-config-center.ts`

## ADDED Requirements

### Requirement: 全局编辑模式切换
系统 SHALL 提供全局编辑模式切换功能，通过右上角的「编辑」/「保存」按钮控制。

#### Scenario: 默认只读模式
- **GIVEN** 用户进入配置页面
- **WHEN** 页面加载完成
- **THEN** 所有输入框为只读状态（disabled）
- **AND** 右上角显示「编辑」按钮
- **AND** 「保存」按钮不显示

#### Scenario: 进入编辑模式
- **GIVEN** 用户在只读模式
- **WHEN** 用户点击「编辑」按钮
- **THEN** 所有输入框变为可编辑状态（disabled=false）
- **AND** 「编辑」按钮消失
- **AND** 「保存」按钮显示
- **AND** 页面其他独立保存按钮隐藏

#### Scenario: 保存配置
- **GIVEN** 用户在编辑模式
- **WHEN** 用户点击「保存」按钮
- **THEN** 所有输入框禁用（disabled=true）
- **AND** 「保存」按钮显示 loading 状态
- **AND** 保存成功后，显示 Toast 提示
- **AND** 进入只读模式（「编辑」按钮显示，「保存」按钮消失）
- **AND** 若保存失败，输入框恢复可编辑，显示错误 Toast

### Requirement: 周打标/月分析按钮独立loading
系统 SHALL 提供独立的打标/分析按钮，这些按钮的 loading 状态不受全局编辑模式影响。

#### Scenario: 手动触发周打标
- **GIVEN** 用户在任意模式（只读/编辑）
- **WHEN** 用户点击「开始周打标」按钮
- **THEN** 该按钮显示 loading 状态
- **AND** 其他按钮不受影响
- **AND** 任务完成后，按钮恢复可点击状态

#### Scenario: 手动触发月分析
- **GIVEN** 用户在任意模式（只读/编辑）
- **WHEN** 用户点击「开始月分析」按钮
- **THEN** 该按钮显示 loading 状态
- **AND** 其他按钮不受影响
- **AND** 任务完成后，按钮恢复可点击状态

### Requirement: 隐藏独立保存按钮
系统 SHALL 隐藏页面所有独立的「保存配置」按钮，避免与全局保存冲突。

#### Scenario: 保存按钮隐藏
- **GIVEN** 配置页面加载完成
- **WHEN** 页面渲染
- **THEN** 所有配置模块的独立「保存配置」按钮不显示
- **AND** 仅右上角的「保存」按钮可见（在编辑模式下）

## MODIFIED Requirements

### Requirement: 配置页面 Tab 结构
**Modification**: 删除所有 Tab 中的独立保存按钮，统一由右上角的保存按钮处理。

#### Scenario: Tab 内容展示
- **WHEN** 用户在只读模式
- **THEN** 所有输入框只读
- **AND** 所有独立保存按钮不显示
- **AND** 右上角显示「编辑」按钮
- **AND** 右上角显示「开始周打标」和「开始月分析」按钮

- **WHEN** 用户在编辑模式
- **THEN** 所有输入框可编辑
- **AND** 右上角显示「保存」按钮（带 loading）
- **AND** 右上角显示「开始周打标」和「开始月分析」按钮
- **AND** 所有独立保存按钮不显示

## REMOVED Requirements

### Requirement: 各 Tab 独立保存按钮
**Reason**: 导致交互复杂，用户需要多次保存，且 loading 状态管理混乱
**Migration**: 统一使用右上角的全局「保存」按钮

## Technical Notes
- 需要在 `use-config-center.ts` 中新增 `isEditing` 状态
- 需要在 `use-config-actions.ts` 中新增 `saveAll` 函数
- 各 Tab 组件需要接收 `isEditing` prop 控制输入框状态
- 右上角按钮区域需要作为独立组件提取
