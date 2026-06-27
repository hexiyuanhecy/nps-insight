# Tasks

## Task 1: 修改 use-config-center.ts 支持 Tab 级独立加载状态

- [x] 1.1 将全局 `isLoading: boolean` 改为 `tabLoading: Record<ConfigTabKey, boolean>`
- [x] 1.2 修改 `setIsLoading` 为 `setTabLoading(tab: ConfigTabKey, loading: boolean)`
- [x] 1.3 将 `tabLoading` 作为 ctrl 属性暴露给子组件

## Task 2: 修改 use-config-actions.ts action 函数签名

- [x] 2.1 `saveSectionConfig` 增加 `tabKey: ConfigTabKey` 参数
- [x] 2.2 `testFeishu`/`testAI`/`testNotify` 不再设置全局 loading，改为操作级 toast
- [x] 2.3 `runWeeklyTagging` 和 `runMonthlyAnalysis` 完全移除 loading 状态
- [x] 2.4 `createTable`/`linkTable` 增加 `tabKey` 参数
- [x] 2.5 `persistScheduleAndSave` 增加 `tabKey` 参数
- [x] 2.6 `importExcel` 增加 `tabKey` 参数
- [x] 2.7 所有 finally 块确保 loading 状态被取消

## Task 3: 修改 Tab 组件使用独立加载状态

- [x] 3.1 `FeishuTab.tsx` — 使用 `ctrl.tabLoading.feishu` 替代 `ctrl.isLoading`
- [x] 3.2 `DatasourceTab.tsx` — 使用 `ctrl.tabLoading.datasource` 替代 `ctrl.isLoading`
- [x] 3.3 `TaggingTab.tsx` — 使用 `ctrl.tabLoading.tagging` 替代 `ctrl.isLoading`

## Task 4: 验证修复效果

- [x] 4.1 保存一个 Tab 时，其他 Tab 可正常编辑
- [x] 4.2 接口失败时 loading 状态正确取消
- [x] 4.3 周打标/月分析按钮点击后不阻塞界面

## Task Dependencies

- Task 3 依赖 Task 1 和 Task 2
- Task 4 依赖 Task 1、Task 2、Task 3
