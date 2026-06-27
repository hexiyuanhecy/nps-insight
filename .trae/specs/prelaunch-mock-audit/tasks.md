# 上线前 Mock 审查与功能增强 - 实施计划

## [x] Task 1: Mock 代码全面梳理与影响评估
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 全代码库搜索所有 Mock 相关代码（API 路由、数据文件、配置开关）
  - 分类整理：开发测试用 / 演示用 / 生产降级用
  - 评估每类 Mock 移除后的影响范围
  - 输出 Mock 清单文档
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 搜索代码库中所有包含 "mock" 的文件和关键代码段
  - `programmatic` TR-1.2: 确认所有 Mock API 路由位置（/api/mock/*）
  - `human-judgement` TR-1.3: 评估每个 Mock 的移除影响等级（高/中/低）
  - `human-judgement` TR-1.4: 输出结构化 Mock 清单

## [x] Task 2: 数据源配置 - 增加 Mock 反馈接口一键填入按钮
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 DatasourceTab 的「反馈来源 - API」区块增加「使用 Mock 数据」按钮
  - 点击后将 `/api/mock/feedbacks` 填入 API 地址输入框
  - 按钮样式参考现有「填入 Mock URL 体验」（日志平台的按钮）
  - 编辑模式下可用，非编辑模式禁用
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 按钮在编辑模式下可点击，非编辑模式禁用
  - `programmatic` TR-2.2: 点击后 API 地址输入框值变为 Mock 接口地址
  - `human-judgement` TR-2.3: 按钮样式与页面整体风格一致

## [x] Task 3: 数据源配置 - 增加租户信息 API 配置项
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 types.ts 的 TabConfig 中增加 tenantSource 配置（apiUrl、apiKey、queryParams）
  - 在 config-center.ts 的默认配置中增加默认值
  - 在 config-updaters.ts 中增加 updateTenantSource 更新函数
  - 在 DatasourceTab 中新增「租户信息 - API」配置区块
  - 在 kv-storage.ts 中确保配置能正确存储和读取
  - 在 config API 路由中确保配置能正确保存和回显
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 配置页面新增租户 API 配置区块，包含 API 地址、API Key、查询参数
  - `programmatic` TR-3.2: 保存配置后刷新页面，配置项正确回显
  - `programmatic` TR-3.3: TypeScript 编译无错误
  - `human-judgement` TR-3.4: 区块样式与反馈来源 API 区块保持一致

## [x] Task 4: 新建日志查询 Mock 页面
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 新建页面路由 `app/log-viewer/page.tsx`
  - 页面结构：顶部搜索栏（用户ID输入、时间范围选择）+ 左侧日志列表 + 右侧日志详情
  - Mock 数据生成：操作日志、错误日志、接口调用日志等类型
  - 支持从 URL 参数读取 userId、start、end
  - 使用 TailwindCSS 设计专业的日志平台界面
  - 更新 MOCK_LOG_URL 常量指向新页面
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: 访问 `/log-viewer?userId=test&start=2025-01-01&end=2025-01-31` 页面正常加载
  - `programmatic` TR-4.2: URL 参数 userId 显示在页面搜索栏中
  - `programmatic` TR-4.3: 日志列表展示 Mock 数据，点击条目显示详情
  - `human-judgement` TR-4.4: 页面样式像一个真实的日志查询平台

## [x] Task 5: 更新日志平台配置的 Mock URL
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 更新 config-center.ts 中的 MOCK_LOG_URL 为新页面地址
  - 确保「填入 Mock URL 体验」按钮填入的是新页面地址
- **Acceptance Criteria Addressed**: AC-2, AC-4
- **Test Requirements**:
  - `programmatic` TR-5.1: 点击「填入 Mock URL 体验」填入的是新页面地址
  - `programmatic` TR-5.2: 填入的 URL 包含 {{userId}} 等占位符

## [x] Task 6: 第1-2轮测试与修复
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4, Task 5
- **Description**: 
  - 第1轮：基础功能验证（页面渲染、配置保存、按钮点击）
  - 第2轮：交互流程验证（完整配置保存刷新回显流程）
  - 发现问题立即修复
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-6.1: 所有新增页面正常渲染无控制台错误
  - `programmatic` TR-6.2: 配置保存-刷新-回显流程正常
  - `human-judgement` TR-6.3: 产品视角评估功能完整性

## [x] Task 7: 第3-4轮测试与修复
- **Priority**: high
- **Depends On**: Task 6
- **Description**: 
  - 第3轮：边界情况验证（空值、异常输入、长文本）
  - 第4轮：样式一致性验证（与现有设计系统对齐）
  - 发现问题立即修复
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-7.1: 边界输入不会导致崩溃
  - `human-judgement` TR-7.2: 样式与现有配置中心一致
  - `human-judgement` TR-7.3: 产品视角评估用户体验

## [x] Task 8: 第5-6轮测试与修复
- **Priority**: high
- **Depends On**: Task 7
- **Description**: 
  - 第5轮：Mock 移除影响验证（注释掉 Mock 代码后核心功能是否正常）
  - 第6轮：端到端流程验证（配置→周打标→月分析全流程）
  - 发现问题立即修复
- **Acceptance Criteria Addressed**: AC-5, AC-1
- **Test Requirements**:
  - `programmatic` TR-8.1: 核心 API 在无 Mock 时不崩溃
  - `programmatic` TR-8.2: 周打标和月分析流程可用
  - `human-judgement` TR-8.3: 产品视角评估端到端体验

## [x] Task 9: 第7-8轮测试与最终回归
- **Priority**: high
- **Depends On**: Task 8
- **Description**: 
  - 第7轮：性能与稳定性验证（重复操作、快速点击）
  - 第8轮：最终回归测试，所有功能验证一遍
  - 输出上线部署准备清单
- **Acceptance Criteria Addressed**: AC-5, AC-6
- **Test Requirements**:
  - `programmatic` TR-9.1: TypeScript 编译 0 错误
  - `programmatic` TR-9.2: Lint 检查通过
  - `human-judgement` TR-9.3: 上线清单完整覆盖环境、配置、部署、监控、回滚
