# Checklist

## 核心修改验证

- [x] use-config-center.ts 中 `tabLoading` 状态正确初始化为 `{ feishu: false, datasource: false, tagging: false }`
- [x] `setTabLoading` 函数正确更新指定 Tab 的 loading 状态
- [x] `ctrl.isLoading` 已从返回值中移除（不再有全局 loading）

## use-config-actions.ts 修改验证

- [x] `saveSectionConfig(section, tabKey)` 正确设置对应 Tab 的 loading
- [x] `runWeeklyTagging` 和 `runMonthlyAnalysis` 不再调用任何 loading 相关函数
- [x] `runWeeklyTagging` 成功时 Toast 消息为"周打标已开始，请及时查看多维表格"
- [x] `runMonthlyAnalysis` 成功时 Toast 消息为"月分析已开始，请及时查看多维表格"
- [x] 所有 action 函数的 `finally` 块正确取消 loading

## Tab 组件修改验证

- [x] FeishuTab.tsx 使用 `ctrl.tabLoading.feishu` 控制加载状态
- [x] DatasourceTab.tsx 使用 `ctrl.tabLoading.datasource` 控制加载状态
- [x] TaggingTab.tsx 使用 `ctrl.tabLoading.tagging` 控制加载状态
- [x] 各 Tab 的保存/测试按钮正确使用对应的 loading 状态
