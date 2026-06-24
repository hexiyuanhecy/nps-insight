# 配置中心结构重组 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 更新类型定义和常量配置
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 更新 `ConfigTabKey` 类型，从 `'integration' | 'ai' | 'ops'` 改为 `'feishu' | 'datasource' | 'tagging'`
  - 更新 `CONFIG_TAB_META` 常量，新的三个 Tab 名称和描述
  - 更新 `TabConfig` 类型中的分组注释（可选，保持数据结构不变）
  - 确保所有配置项的数据结构保持不变（只改展示，不改存储）
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-1.1: TypeScript 编译通过，类型错误为 0
  - `programmatic` TR-1.2: `CONFIG_TAB_META` 包含 3 个新 Tab 定义
  - `human-judgement` TR-1.3: Tab 名称和描述准确反映内容分类
- **Notes**: 数据存储结构不变，只改展示层的 Tab 分组

## [ ] Task 2: 创建飞书配置 Tab (FeishuTab)
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 新建 `FeishuTab.tsx` 组件
  - 从原 `IntegrationTab.tsx` 迁移「飞书应用绑定」模块
  - 从原 `OpsTab.tsx` 迁移「通知群配置」模块，改名为「飞书通知群绑定」
  - 从原 `OpsTab.tsx` 迁移管理员配置（adminUserIds），改名为「飞书多维表格管理员配置」
  - 从原 `AiTagsTab.tsx` 迁移「大租户定义」模块
  - 从原 `IntegrationTab.tsx` 迁移「多维表格绑定/新建」模块
  - 按顺序排列：应用绑定 → 通知群绑定 → 管理员配置 → 大租户定义 → 表格绑定/新建
  - 每个模块保留独立的保存按钮
- **Acceptance Criteria Addressed**: AC-1, AC-5
- **Test Requirements**:
  - `human-judgement` TR-2.1: 5 个模块按正确顺序展示
  - `human-judgement` TR-2.2: 每个模块都有独立的保存按钮
  - `programmatic` TR-2.3: 每个模块的保存功能正常工作
  - `programmatic` TR-2.4: 配置回显正确
- **Notes**: 复用现有 UI 组件，只调整位置和顺序

## [ ] Task 3: 创建数据源 Tab (DatasourceTab)
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 新建 `DatasourceTab.tsx` 组件
  - 从原 `IntegrationTab.tsx` 迁移「数据源 API 配置」模块，改名为「反馈来源 - API」
  - 迁移 Excel 导入功能（如果在其他地方），改名为「反馈来源 - Excel 导入」
  - 迁移 Webhook 接收地址配置（作为「其他反馈来源」的一部分）
  - 从原 `OpsTab.tsx` 迁移「日志平台 URL 配置」模块
  - 按顺序排列：API → Excel 导入 → 其他 → 日志平台
  - 每个模块保留独立的保存按钮
- **Acceptance Criteria Addressed**: AC-2, AC-5
- **Test Requirements**:
  - `human-judgement` TR-3.1: 数据源模块按正确顺序展示
  - `human-judgement` TR-3.2: Mock 日志平台链接正确显示
  - `programmatic` TR-3.3: API 配置保存和回显正常
  - `programmatic` TR-3.4: Excel 导入功能正常工作
- **Notes**: 确认 Excel 导入当前在哪个 Tab，可能需要从 admin 页面其他位置迁移

## [ ] Task 4: 创建打标与分析配置 Tab (TaggingTab)
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 新建 `TaggingTab.tsx` 组件（或重命名 `AiTagsTab.tsx`）
  - 保留「AI 模型配置」模块，改名为「AI 模型选择」
  - 保留「标签体系配置」模块（Tag1 / Tag2）
  - 从原 taggging 配置中提取「置信度阈值」作为独立模块
  - 从原 `OpsTab.tsx` 迁移「定时任务周期」模块
  - 按顺序排列：AI 模型选择 → 标签体系配置 → 置信度阈值 → 定时任务周期
  - 每个模块保留独立的保存按钮
- **Acceptance Criteria Addressed**: AC-3, AC-5
- **Test Requirements**:
  - `human-judgement` TR-4.1: 4 个模块按正确顺序展示
  - `human-judgement` TR-4.2: Tag1 重新打标按钮正常显示
  - `programmatic` TR-4.3: AI 模型配置保存和测试正常
  - `programmatic` TR-4.4: 标签配置保存正常
  - `programmatic` TR-4.5: 定时任务配置保存正常，Cron 生成正确
- **Notes**: 置信度阈值原来和大租户定义在一起，现在分开

## [ ] Task 5: 更新 ConfigCenter 主组件和 useConfigCenter
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4
- **Description**:
  - 更新 `ConfigCenter.tsx`，引入新的三个 Tab 组件
  - 更新 `use-config-center.ts` 中的 Tab 切换逻辑
  - 更新 `config-updaters.ts` 中的配置更新函数（如果需要）
  - 更新 `use-config-actions.ts` 中的保存逻辑（确保 section 参数正确映射）
  - 确保所有的保存操作仍然能正确工作
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1: Tab 切换功能正常
  - `programmatic` TR-5.2: 所有保存操作正常写入数据库
  - `programmatic` TR-5.3: 配置回显正确
  - `programmatic` TR-5.4: API 接口数据格式不变
- **Notes**: 确保 section 名称与保存逻辑的映射正确

## [ ] Task 6: 创建表格时自动添加管理员协作者
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - 检查现有的 `createTable` 逻辑
  - 在创建表格成功后，调用飞书 API 将 adminUserIds 中的用户添加为表格协作者
  - 绑定已有表格时，也尝试添加管理员协作者
  - 若添加失败（权限不足），给出友好的 Toast 提示
  - 更新相关的 action 函数
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-6.1: 创建表格后，管理员被添加为协作者
  - `programmatic` TR-6.2: 添加失败时有明确的错误提示
  - `human-judgement` TR-6.3: 错误提示友好且可操作
- **Notes**: 需要确认飞书多维表格添加协作者的 API

## [ ] Task 7: 清理旧文件和引用
- **Priority**: low
- **Depends On**: Task 5
- **Description**:
  - 删除或归档旧的 `IntegrationTab.tsx`、`AiTagsTab.tsx`、`OpsTab.tsx`（如果不再使用）
  - 清理无用的导入和引用
  - 确保没有 TypeScript 警告
- **Acceptance Criteria Addressed**: NFR-4
- **Test Requirements**:
  - `programmatic` TR-7.1: TypeScript 编译通过，无未使用变量警告
  - `programmatic` TR-7.2: `pnpm lint` 通过
- **Notes**: 建议先保留旧文件一段时间，确认新结构稳定后再删除

## [ ] Task 8: 端到端测试与验证
- **Priority**: high
- **Depends On**: Task 5, Task 6
- **Description**:
  - 测试飞书配置 Tab 的所有功能
  - 测试数据源 Tab 的所有功能
  - 测试打标与分析配置 Tab 的所有功能
  - 测试配置保存和回显
  - 测试创建表格时添加管理员协作者
  - 测试所有测试按钮和 Toast 提示
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
- **Test Requirements**:
  - `programmatic` TR-8.1: 所有配置项保存成功
  - `programmatic` TR-8.2: 所有配置项回显正确
  - `programmatic` TR-8.3: 所有测试按钮功能正常
  - `human-judgement` TR-8.4: UI 布局合理，视觉一致性良好
- **Notes**: 参考之前的测试流程文档
