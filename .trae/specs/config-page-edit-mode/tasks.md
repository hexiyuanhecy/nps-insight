# Tasks

## 任务1: 创建右上角操作按钮组件
创建 `TopActionButtons` 组件，包含「编辑」「保存」「开始周打标」「开始月分析」按钮。

- [ ] 1.1: 在 `src/components/admin/config-center/` 下创建 `TopActionButtons.tsx` 组件
- [ ] 1.2: 组件接收 `isEditing`, `onEdit`, `onSave`, `onWeeklyTagging`, `onMonthlyAnalysis`, `isSaving`, `isTagging` props
- [ ] 1.3: 实现编辑/保存按钮的切换逻辑
- [ ] 1.4: 实现周打标/月分析按钮的 loading 状态

## 任务2: 修改 use-config-center 添加 isEditing 状态
在 `use-config-center.ts` 中添加 `isEditing` 状态管理。

- [ ] 2.1: 在 `useConfigCenter` hook 中添加 `isEditing` 状态
- [ ] 2.2: 添加 `setIsEditing` 函数
- [ ] 2.3: 导出 `isEditing` 供组件使用

## 任务3: 修改 use-config-actions 添加 saveAll 函数
新增统一保存所有配置的功能。

- [ ] 3.1: 在 `use-config-actions.ts` 中添加 `saveAll` 函数
- [ ] 3.2: `saveAll` 函数调用 `saveSectionConfig` 保存所有配置
- [ ] 3.3: 添加 `isSaving` 状态用于保存按钮 loading

## 任务4: 修改 FeishuTab 组件
删除独立保存按钮，添加 isEditing prop 控制输入框状态。

- [ ] 4.1: 删除「测试飞书连接」和「保存配置」按钮（仅保留测试按钮，测试按钮不受编辑模式影响）
- [ ] 4.2: 所有输入框添加 `disabled={!isEditing}` 属性
- [ ] 4.3: 确保测试按钮不受编辑模式影响

## 任务5: 修改 DatasourceTab 组件
删除独立保存按钮，添加 isEditing prop 控制输入框状态。

- [ ] 5.1: 删除所有配置模块的「保存配置」按钮
- [ ] 5.2: 所有输入框添加 `disabled={!isEditing}` 属性
- [ ] 5.3: 保留测试连接按钮，不受编辑模式影响

## 任务6: 修改 TaggingTab 组件
删除独立保存按钮，添加 isEditing prop 控制输入框状态。

- [ ] 6.1: 删除所有配置模块的「保存配置」按钮
- [ ] 6.2: 所有输入框添加 `disabled={!isEditing}` 属性
- [ ] 6.3: 保留测试按钮，不受编辑模式影响
- [ ] 6.4: 删除「开始周打标」和「开始月分析」按钮（已移至右上角）

## 任务7: 修改 ConfigCenter 整合 TopActionButtons
在配置中心页面顶部整合右上角操作按钮。

- [ ] 7.1: 引入 `TopActionButtons` 组件
- [ ] 7.2: 在页面右上角放置 `TopActionButtons`
- [ ] 7.3: 传递 `isEditing`, `setIsEditing`, `saveAll` 等 props
- [ ] 7.4: 调整页面布局，给右上角按钮留出空间

## 任务8: 验证 TypeScript 编译
确保所有修改通过 TypeScript 类型检查。

- [ ] 8.1: 运行 `pnpm tsc --noEmit` 检查类型错误
- [ ] 8.2: 修复所有类型错误

## Task Dependencies
- 任务2、3 可并行完成
- 任务4、5、6 可并行完成
- 任务7 依赖任务1、2、3、4、5、6
- 任务8 在所有其他任务完成后执行
