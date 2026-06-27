# Checklist - 配置页面编辑模式

## TopActionButtons 组件
- [x] 组件正确导入到 ConfigCenter
- [x] 编辑按钮在只读模式显示
- [x] 保存按钮在编辑模式显示
- [x] 周打标按钮始终显示
- [x] 月分析按钮始终显示
- [x] 保存按钮点击后显示 loading
- [x] 周打标/月分析按钮 loading 状态独立

## use-config-center 状态管理
- [x] `isEditing` 状态正确初始化为 false
- [x] `setIsEditing` 可以切换状态
- [x] 状态在组件间正确传递

## use-config-actions 保存逻辑
- [x] `saveAll` 函数正确保存所有配置
- [x] `isSaving` 状态正确管理
- [x] 保存成功/失败正确处理

## FeishuTab 组件
- [x] 独立保存按钮已删除
- [x] 输入框在只读模式禁用
- [x] 输入框在编辑模式可编辑
- [x] 测试按钮不受编辑模式影响

## DatasourceTab 组件
- [x] 独立保存按钮已删除
- [x] 输入框在只读模式禁用
- [x] 输入框在编辑模式可编辑
- [x] 测试按钮不受编辑模式影响

## TaggingTab 组件
- [x] 独立保存按钮已删除
- [x] 输入框在只读模式禁用
- [x] 输入框在编辑模式可编辑
- [x] 周打标/月分析按钮已移至右上角

## ConfigCenter 页面
- [x] 右上角正确显示 TopActionButtons
- [x] 页面布局不影响原有功能
- [x] Tab 切换正常工作

## UI 组件 disabled 支持
- [x] TextField 支持 disabled prop
- [x] SecretField 支持 disabled prop
- [x] TextArea 支持 disabled prop
- [x] SelectField 支持 disabled prop
- [x] TimePicker 支持 disabled prop

## 交互流程
- [x] 点击编辑 → 输入框可编辑 → 保存按钮显示
- [x] 点击保存 → loading → 保存成功 → 只读模式恢复
- [x] 点击保存 → loading → 保存失败 → 保持编辑模式，显示错误
- [x] 点击周打标 → loading（不影响其他按钮）→ 完成恢复
- [x] 点击月分析 → loading（不影响其他按钮）→ 完成恢复
