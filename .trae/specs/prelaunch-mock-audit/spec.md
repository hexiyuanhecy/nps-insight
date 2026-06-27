# 上线前 Mock 审查与功能增强 - Product Requirement Document

## Overview
- **Summary**: 上线前对系统中所有 Mock 数据和 Mock API 进行全面审查，评估移除 Mock 后对正常使用的影响；同时增强数据源配置页功能（Mock 反馈接口一键填入、租户信息接口配置），将日志查询从 Mock API 改为内置 Mock 页面，通过 8 轮测试验收迭代确保质量，最终输出上线准备清单。
- **Purpose**: 确保系统上线后移除所有 Mock 数据不影响核心功能，同时提供更好的 Mock 体验用于演示和测试，为正式上线扫清障碍。
- **Target Users**: 产品经理、测试工程师、研发工程师

## Goals
- 全面梳理系统中所有 Mock 相关代码，评估移除影响
- 数据源配置页增加 Mock 反馈接口一键填入按钮
- 数据源配置页增加租户信息 API 配置项，完整支持配置存储和读取
- 日志查询平台从 Mock API 改为内置 Mock 页面，支持 userId 参数
- 通过 8 轮测试-修复迭代确保功能质量
- 输出上线部署准备清单

## Non-Goals (Out of Scope)
- 不修改核心打标和分析算法
- 不改动飞书多维表格结构
- 不改动通知和文档生成逻辑
- 不实现真实的日志查询后端
- 不实现真实的租户信息 API 对接

## Background & Context
当前系统处于即将上线阶段，存在以下问题：
1. 系统内分布着多处 Mock 数据和 Mock API，需要评估上线影响
2. 数据源 API 配置缺少便捷的 Mock 体验入口，用户需手动填写 Mock 地址
3. 缺少租户信息 API 配置项，租户规模等信息无法从外部 API 获取
4. 日志查询平台目前是 Mock API 形式，用户体验不直观，需要改为页面形式
5. 需要系统性的测试验收确保上线质量

## Functional Requirements

### FR-1: Mock 数据全面审查
- 梳理所有 Mock 相关代码（API、数据、配置开关）
- 分类标注：开发用 / 测试用 / 演示用
- 评估每类 Mock 移除后的影响范围
- 输出 Mock 清单和移除指南

### FR-2: 数据源配置 - Mock 反馈接口一键填入
- 在「反馈来源 - API」配置区域增加「使用 Mock 数据」按钮
- 点击后自动将系统内置的 Mock 反馈 API 地址填入 API 地址输入框
- 按钮样式与现有「填入 Mock URL 体验」（日志平台）保持一致

### FR-3: 数据源配置 - 租户信息 API 配置
- 在数据源 Tab 新增「租户信息 - API」配置区块
- 配置项包含：API 地址、API Key、查询参数（可选）
- 配置项存储到 KV，刷新页面后能正确回显
- 样式和交互与「反馈来源 - API」保持一致
- 配置结构遵循现有 dataSource 模式扩展

### FR-4: 日志查询平台 Mock 页面
- 新建日志查询页面路由（`/log-viewer`）
- 页面接收 URL 参数：`userId`（第一个反馈用户的 ID）、`start`、`end`
- 页面样式模拟真实日志查询平台（搜索栏、时间筛选、日志列表、详情面板）
- 数据为 Mock 生成，展示用户操作日志、错误日志、接口调用日志等
- 支持点击日志条目查看详情

### FR-5: 八轮测试验收迭代
- 第一轮：基础功能验证（页面渲染、配置保存）
- 第二轮：交互流程验证（按钮点击、数据回显）
- 第三轮：边界情况验证（空值、异常输入）
- 第四轮：样式一致性验证
- 第五轮：Mock 移除影响验证
- 第六轮：端到端流程验证
- 第七轮：性能与稳定性验证
- 第八轮：最终回归与上线清单输出

### FR-6: 上线部署准备清单
- 环境变量检查清单
- Mock 数据清理步骤
- 第三方服务配置检查（飞书、LLM、KV）
- 域名与部署配置
- 监控与告警配置
- 回滚方案

## Non-Functional Requirements

- **NFR-1**: 所有新增配置项必须持久化到 KV 存储，刷新页面不丢失
- **NFR-2**: 新增页面和组件遵循现有设计风格（TailwindCSS + 现有组件库）
- **NFR-3**: Mock 页面性能良好，首屏加载 < 2s
- **NFR-4**: TypeScript 类型完整，无 `any` 类型
- **NFR-5**: 代码遵循现有命名规范和目录结构

## Constraints
- **技术**: Next.js 14 + TypeScript + TailwindCSS，Vercel 部署
- **业务**: 不改变现有业务流程，只新增配置项和页面
- **依赖**: 飞书多维表格、Vercel KV、LLM API

## Assumptions
- 现有配置存储机制（KV + 内存降级）可用
- 现有配置中心组件架构可扩展新配置项
- Mock 日志页面仅用于演示，无需真实后端数据
- 租户信息 API 配置仅保存配置，暂不实现实际调用逻辑

## Acceptance Criteria

### AC-1: Mock 审查清单输出
- **Given**: 完整的代码库
- **When**: 完成所有 Mock 代码梳理
- **Then**: 输出 Mock 清单，包含位置、用途、移除影响、处理建议
- **Verification**: `programmatic` + `human-judgment`

### AC-2: Mock 反馈按钮功能
- **Given**: 用户在数据源配置页的编辑模式
- **When**: 点击「使用 Mock 数据」按钮
- **Then**: API 地址输入框自动填入内置 Mock 反馈接口 URL
- **Verification**: `programmatic`

### AC-3: 租户信息 API 配置保存
- **Given**: 用户在数据源配置页填写了租户 API 配置
- **When**: 点击保存按钮后刷新页面
- **Then**: 配置项正确回显，数据与保存前一致
- **Verification**: `programmatic`

### AC-4: 日志查询页面可访问
- **Given**: 系统正常运行
- **When**: 访问 `/log-viewer?userId=xxx&start=xxx&end=xxx`
- **Then**: 页面正常渲染，显示 Mock 日志数据，URL 参数生效
- **Verification**: `programmatic`

### AC-5: 八轮迭代完成
- **Given**: 所有功能开发完成
- **When**: 完成 8 轮测试-修复迭代
- **Then**: 每轮发现的问题均已修复，最终回归通过
- **Verification**: `human-judgment`

### AC-6: 上线清单输出
- **Given**: 所有功能验证通过
- **When**: 输出上线部署准备清单
- **Then**: 清单涵盖环境变量、Mock 清理、第三方配置、部署步骤、回滚方案
- **Verification**: `human-judgment`

## Open Questions
- [ ] 租户信息 API 的具体字段格式和调用时机是否需要在本期实现？
- [ ] 日志查询页面是否需要提供从反馈详情页跳转的入口？
- [ ] Mock 数据在生产环境是完全禁用还是保留开关？
