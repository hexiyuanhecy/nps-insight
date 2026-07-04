# NPS Insight 2026 技术审查报告 - Product Requirement Document

## Overview
- **Summary**: 基于 2026 年最新 AI 技术和编程技术栈，对 NPS Insight 项目进行三轮深度审查，识别可删除的冗余代码、可优化的架构设计、以及可引进的新技术，输出优先级明确的改进清单。
- **Purpose**: 确保项目技术栈不过时、代码质量持续提升、AI 能力保持行业领先水平，同时降低维护成本。
- **Target Users**: 项目开发者、技术负责人

## Goals
- 识别并清理项目中的冗余代码和废弃模块
- 优化现有架构和代码质量，提升可维护性
- 评估 2026 年新技术的引入价值，按优先级排序
- 确保 AI 模块的最佳实践落地（结构化输出、工具调用等）

## Non-Goals (Out of Scope)
- 不进行业务功能的增减
- 不进行全面重构（只做增量优化）
- 不更换核心技术栈（Next.js + TypeScript + TailwindCSS 保持不变）
- 不涉及数据库迁移或多维表格结构变更

## Background & Context

### 当前技术栈
- **框架**: Next.js 14.2.5 + React 18.3.1
- **样式**: TailwindCSS 3.4.4 + Radix UI
- **AI**: OpenAI SDK + AgnesAI + 自研 Prompt 引擎 + 模型路由 + 语义缓存
- **存储**: Upstash Redis (KV) + 飞书多维表格
- **集成**: 飞书自建应用 (Bot + 多维表格 + 文档)
- **测试**: Vitest + Playwright

### 项目规模
- AI 模块：10+ 核心文件，8 个测试文件
- 前端组件：配置中心 + 首页 + 聊天 + 日志查看器
- API 路由：配置、打标、分析、定时任务、Webhook 等 15+ 个
- Adapter 模式：数据源、存储、通知、文档四大适配器

### 三轮审查方法
1. **第一轮**: 全面扫描代码结构和依赖，建立全局视图
2. **第二轮**: 深入各模块内部，逐文件分析实现质量和技术债
3. **第三轮**: 对照 2026 年技术最佳实践，评估升级价值和风险

## Functional Requirements

### 分类一：可删除的冗余代码

#### FR-1.1 废弃模块清理
- 删除 `tag-evolution.ts`（已被 `tag-evolution-v2.ts` 替代）
- 删除 `updateTagStatistics` 函数（已标注"已停用"）
- 确认 `src/lib/adapter-factory.ts` 与 `src/lib/data-sources/adapter-factory.ts` 的关系，删除重复项
- 确认 `src/lib/notification/feishu-notifier.ts` 与 `feishu-notification.ts` 的关系，删除重复项
- 确认 `src/lib/documents/` 与 `src/lib/document/` 目录的关系，统一命名
- 确认 `feishu-env.ts` 与 `feishu-config.ts` 的关系，删除重复项

#### FR-1.2 未使用依赖清理
- 检查 `mysql2` 和 `pg` 是否实际使用，未使用则移除
- 检查 `@types/mermaid` 是否需要（mermaid 11.x 自带类型）
- 检查 `mermaid` 是否实际使用，评估其必要性（包体积大）

### 分类二：可优化的现有实现

#### FR-2.1 AI 模块优化
- **语义缓存升级**: 当前使用简单字符哈希特征模拟语义相似度，不是真正的 Embedding，效果有限。要么接入真正的 Embedding API，要么简化为精确文本缓存
- **Prompt 模块整合**: `prompts.ts` 只是 `prompt-engine.ts` 的薄包装层，可以合并或删除
- **日志控制**: `tagger.ts` 中有大量 console.log 调试输出，生产环境应可控（使用 debug 库或环境变量开关）
- **错误处理优化**: 部分模块 catch 后只 log 不抛出，导致上层无法感知失败，应根据场景决定是容错还是抛出

#### FR-2.2 配置管理优化
- **系统级配置保护**: 已修复（FEISHU_APP_ID/Secret、API Key 等只从环境变量读取），需确认全面覆盖
- **配置类型安全**: route.ts 中大量使用 `any` 类型，应定义完整的 Config 类型
- **配置校验**: 保存配置时缺少 Schema 校验，应使用 Zod 校验

#### FR-2.3 前端优化
- **Mermaid 组件**: 检查是否实际使用，mermaid 11.x 包体积大（~1MB gzip），不用则删除
- **Radix UI 封装**: 当前 Radix UI 组件使用方式较原始，可考虑封装为更高级的业务组件或引入 shadcn/ui 风格
- **状态管理**: 配置中心状态管理较分散（多个自定义 Hook），可考虑使用 Zustand 简化

#### FR-2.4 后端/数据层优化
- **API 路由结构**: 部分 API 路由逻辑过重（如 config/route.ts 超过 900 行），应拆分到 lib 层
- **Adapter 模式一致性**: Storage/Notification/Document/DataSouce 四大 Adapter 的接口设计风格不统一
- **缓存策略**: 飞书多维表格数据读取缺少合理的缓存，频繁 API 调用可能触发限流

### 分类三：可引进的 2026 年新技术

#### FR-3.1 AI 能力升级
- **原生结构化输出**: OpenAI/AgnesAI 已原生支持 response_format 为 JSON Schema（而非仅 json_object），可以替换当前的 Zod + 重试方案，提高可靠性和效率
- **工具调用 (Tool Use / Function Calling)**: 标签查询、标签创建等操作可以用工具调用实现，替代纯 Prompt 描述，大幅提升准确性
- **智能体 (Agent) 模式**: 月分析任务（标签进化→Top问题→文档生成→通知）可以用 Agent 编排，替代硬编码的流程
- **RAG 增强问答**: 聊天功能可引入 RAG，基于历史反馈数据回答用户问题

#### FR-3.2 框架与基础设施升级
- **Next.js 15 + React 19**: 升级到最新 LTS 版本，获得 Server Components 优化、use() Hook、Actions 等新特性
- **Server Actions**: 替代部分简单的 API 路由，简化代码
- **Vercel AI SDK**: 标准化流式对话、工具调用、结构化输出的实现
- **TailwindCSS v4**: 升级到 v4，零配置、更快编译速度

#### FR-3.3 开发体验提升
- **Bun 运行时**: 评估从 Node.js 迁移到 Bun 的可行性（更快的启动速度、内置测试/打包）
- **Zod + TypeScript 深度整合**: 现有 Zod 使用较浅，可以用 tRPC 或更好的类型推断实现端到端类型安全
- **Drizzle ORM**: 如果未来需要关系型数据库，Drizzle 是 2026 年的主流选择（比 Prisma 轻量、类型更好）

## Non-Functional Requirements

- **NFR-1**: 所有删除操作必须确保没有其他模块引用（通过 grep + TypeScript 检查验证）
- **NFR-2**: 优化后的代码必须通过 `pnpm tsc --noEmit` 和 `pnpm lint` 检查
- **NFR-3**: 新技术引入必须有明确的 ROI 分析（收益 vs 改造成本）
- **NFR-4**: 所有 AI 相关改动必须不降低打标准确率
- **NFR-5**: 前端性能指标（LCP、CLS）不能因改动而变差

## Constraints

- **Technical**: 项目必须继续支持飞书生态（多维表格、Bot、文档）
- **Business**: 核心业务流程（周打标、月分析）不能中断
- **Dependencies**: 不能引入与现有架构冲突的重型框架
- **Timeline**: 优化工作应与业务开发并行，不阻塞主流程

## Assumptions

- 项目以单租户模式为主（配置中心的 KV 覆盖是为 SaaS 设计的，但当前用不上）
- AgnesAI API 兼容 OpenAI 格式，支持结构化输出和工具调用
- 团队熟悉 TypeScript 和 React 生态
- 部署目标包括 Vercel 和腾讯云 SCF（需要兼容 Serverless）

## Acceptance Criteria

### AC-1: 冗余代码清理完成
- **Given**: 项目中存在废弃/重复的模块和依赖
- **When**: 执行清理并验证
- **Then**: 所有删除的模块没有被其他文件引用，TypeScript 编译通过，功能正常
- **Verification**: `programmatic`
- **Notes**: 通过 `grep -r` 和 `tsc --noEmit` 双重验证

### AC-2: 语义缓存方案明确
- **Given**: 当前语义缓存使用简单字符哈希，语义匹配效果有限
- **When**: 评估并决定方案（接入 Embedding / 降级为精确匹配 / 保留现状）
- **Then**: 有明确的方案决策和实现计划
- **Verification**: `human-judgment`

### AC-3: 新技术引入优先级排序清晰
- **Given**: 2026 年有多项新技术可引入
- **When**: 完成 ROI 分析
- **Then**: 输出按优先级排序的清单，每项包含收益、成本、风险评估
- **Verification**: `human-judgment`

### AC-4: 配置管理安全性提升
- **Given**: 系统级配置可能被 KV 误覆盖
- **When**: 实施保护机制
- **Then**: 即使 KV 存储了错误值，系统级配置仍从环境变量读取，不受影响
- **Verification**: `programmatic`

### AC-5: 代码质量可量化提升
- **Given**: 当前代码存在类型不安全（any）、日志过多、错误处理不一致等问题
- **When**: 完成优化
- **Then**: any 类型使用减少、错误处理一致、生产环境日志可控
- **Verification**: `human-judgment`

## Open Questions

- [ ] Mermaid 图表组件是否在实际使用？（首页有 MermaidDiagram 组件，需确认用户是否使用）
- [ ] mysql2 和 pg 依赖是否需要？（项目主要用飞书多维表格，数据库适配器是否被使用）
- [ ] 项目未来是否有多租户需求？（这影响 KV 配置覆盖的设计取舍）
- [ ] AgnesAI 是否支持原生 JSON Schema 结构化输出和工具调用？（这影响 AI 模块升级方案）
- [ ] 是否计划迁移到 Bun 运行时？（这影响打包和部署方案）
