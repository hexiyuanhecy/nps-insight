# NPS Insight 2026 技术审查 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 冗余代码与依赖清理（低风险高收益）
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 清理已废弃的模块和未使用的依赖，减少包体积和维护成本
  - 删除 `tag-evolution.ts`（已被 v2 替代）
  - 删除已标注"已停用"的 `updateTagStatistics` 函数
  - 检查并删除重复的 Adapter 工厂文件
  - 移除未使用的数据库驱动（mysql2, pg）
  - 评估 mermaid 的必要性，如未使用则移除
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: `grep -r` 验证删除的模块没有被其他文件引用
  - `programmatic` TR-1.2: `pnpm tsc --noEmit` 和 `pnpm lint` 通过
  - `programmatic` TR-1.3: `pnpm build` 成功，包体积减小或持平
  - `human-judgement` TR-1.4: 核心功能（周打标、月分析）手动验证不受影响
- **Notes**: 每删除一个文件前必须确认没有引用；删除依赖后需重新安装验证

## [ ] Task 2: 配置管理安全性加固（已部分完成）
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 系统级配置（FEISHU_APP_ID/Secret、各 API Key）只从环境变量读取，不被 KV 覆盖
  - 保存配置时自动过滤系统级受保护字段，不写入 KV
  - 为配置增加 Zod Schema 校验
  - 用类型安全的 Config 接口替换 any 类型
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-2.1: 即使 KV 存了错误值，GET /api/config 返回的仍是环境变量的正确值
  - `programmatic` TR-2.2: 保存配置时系统级字段不被写入 KV
  - `programmatic` TR-2.3: 配置保存时通过 Zod 校验，非法值被拒绝
  - `human-judgement` TR-2.4: 配置类型定义完整，没有 any 类型
- **Notes**: 部分逻辑已实现（feishu-config.ts 和 route.ts 中的受保护字段），需全面检查覆盖

## [ ] Task 3: AI 模块代码质量优化
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 合并 `prompts.ts` 到 `prompt-engine.ts`（薄包装层，无存在必要）
  - 为 AI 模块增加可控的日志开关（生产环境关闭 verbose 日志）
  - 统一错误处理策略：区分"可容错"和"必须抛出"的场景
  - 语义缓存方案评估：接入 Embedding API 还是降级为精确匹配
- **Acceptance Criteria Addressed**: AC-2, AC-5
- **Test Requirements**:
  - `programmatic` TR-3.1: 单元测试全部通过（89 个用例）
  - `programmatic` TR-3.2: 生产环境（NODE_ENV=production）不输出 verbose 调试日志
  - `human-judgement` TR-3.3: 语义缓存方案有明确的决策文档和理由
  - `human-judgement` TR-3.4: 错误处理策略一致，可容错场景有清晰注释
- **Notes**: 语义缓存的决策可能需要额外调研 AgnesAI Embedding API 的可用性和成本

## [ ] Task 4: 前端代码质量优化
- **Priority**: medium
- **Depends On**: Task 1（如果删除 mermaid）
- **Description**: 
  - 配置中心状态管理优化：评估 Zustand 是否比多个自定义 Hook 更清晰
  - Radix UI 组件封装：提取可复用的业务组件，减少重复代码
  - 配置中心页面性能优化（大表单场景）
  - AutoSaveField 逻辑简化
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-4.1: 配置中心页面可正常使用，所有字段保存正常
  - `programmatic` TR-4.2: TypeScript 和 ESLint 通过
  - `human-judgement` TR-4.3: 组件层级更清晰，重复代码减少
  - `human-judgement` TR-4.4: 状态管理更集中，调试更容易
- **Notes**: Zustand 引入需评估收益是否超过新增依赖的成本

## [ ] Task 5: 新技术引入 - AI 能力升级（高价值）
- **Priority**: medium
- **Depends On**: Task 3
- **Description**: 
  - 评估原生结构化输出（JSON Schema response_format）替代 Zod + 重试的可行性
  - 评估工具调用（Function Calling）替代纯 Prompt 打标的可行性
  - 评估 Vercel AI SDK 替代自实现流式对话的可行性
  - 以上每项输出技术方案和 ROI 分析
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-5.1: 每项技术有清晰的收益/成本/风险评估
  - `human-judgement` TR-5.2: 有按优先级排序的引入计划
  - `programmatic` TR-5.3: 如果实现原型，有对比数据（准确率/成本/速度）
- **Notes**: 需先确认 AgnesAI API 的兼容性；工具调用可能大幅提升打标准确率

## [ ] Task 6: 新技术引入 - 框架升级评估
- **Priority**: low
- **Depends On**: None
- **Description**: 
  - Next.js 15 + React 19 升级可行性评估
  - TailwindCSS v4 升级可行性评估
  - Server Actions 替代部分 API 路由的可行性
  - Bun 运行时迁移可行性评估
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgement` TR-6.1: 每项升级有清晰的收益/成本/风险评估
  - `human-judgement` TR-6.2: 有升级路径和回滚方案
  - `programmatic` TR-6.3: 如果做原型升级，构建和测试通过
- **Notes**: 框架升级优先级低，因为当前版本稳定够用；升级主要是为了长期维护性

## [ ] Task 7: 后端架构优化
- **Priority**: low
- **Depends On**: None
- **Description**: 
  - 拆分 config/route.ts（900+ 行）到多个 lib 模块
  - 统一四大 Adapter（Storage/Notification/Document/DataSource）的接口设计风格
  - 飞书多维表格数据读取增加合理的缓存层
  - API 响应格式标准化
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-7.1: 所有现有测试通过
  - `programmatic` TR-7.2: API 响应格式一致（success/data/error 结构）
  - `human-judgement` TR-7.3: Adapter 接口风格统一，易于扩展
  - `human-judgement` TR-7.4: 文件职责更单一，单个文件不超过 500 行
- **Notes**: 重构收益高但风险也高，应小步快跑，每次只改一个模块
