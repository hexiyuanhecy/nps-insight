# 修复打标与报告生成问题 - Product Requirement Document

## Overview
- **Summary**: 修复 NPS Insight 系统中标签表空白、反馈未打标、消息发送逻辑错误、周报未生成等核心问题
- **Purpose**: 确保周打标任务能正确执行 AI 打标、写入标签表、更新反馈记录、统计 Top5 问题、发送通知消息并生成周报
- **Target Users**: NPS Insight 系统管理员

## Goals
- 修复标签写入逻辑：确保 租户信息 Tag1/Tag2/Tag3 正确写入对应的标签表
- 修复反馈打标流程：确保 AI 打标结果正确写入反馈表
- 修复消息发送逻辑：确保每次周打标只发送一条通知，包含 Top5 问题
- 修复周报生成：确保周打标任务完成后生成周报并发送通知

## Non-Goals (Out of Scope)
- 不修改标签体系结构
- 不修改多维表格字段定义
- 不修改定时任务调度逻辑

## Background & Context
当前系统存在以下问题：
1. **标签表空白**：`ensureTagExists` 函数把所有标签都写到 `TABLE_NAMES.TAG1`，而不是对应的 TAG1/TAG2/TAG3 表；`getAllTags` 只从 TAGS 表读取，导致标签体系为空
2. **反馈未打标**：`autoTagFeedbacks` 更新反馈记录时使用了错误的状态值，且 `completeTaggingProcess` 使用的状态值与表格选项不匹配
3. **消息发送逻辑**：Mock 同步任务每次写入都发送消息，没有按打标批次发送；topIssues 统计因为标签表空白而没有数据
4. **周报未生成**：周打标任务没有调用周报生成接口

## Functional Requirements

### FR-1: 修复标签写入逻辑
系统 SHALL 正确将标签写入对应的标签表：
- Tag1 写入 TAG1 表
- Tag2 写入 TAG2 表
- Tag3 写入 TAG3 表
- `getAllTags` 应从所有三个标签表读取标签
- 标签已存在时更新使用次数，不存在时创建新标签

### FR-2: 修复反馈打标流程
系统 SHALL 正确执行 AI 打标并更新反馈记录：
- 正确筛选状态为 "new" 的未打标反馈
- AI 打标结果正确写入反馈表（tag1、tag2、tag3、confidence、needLogCheck、reviewNeeded）
- 打标后状态更新为 "pending"
- 支持批量打标和批量更新

### FR-3: 修复消息发送逻辑
系统 SHALL 每次周打标只发送一条通知消息：
- 消息包含：周期信息、反馈总数、Top5 问题、飞书表格链接、日志平台链接
- Top5 问题基于打标后的 tag3 统计
- 消息发送在打标完成后进行
- 不重复发送

### FR-4: 修复周报生成
系统 SHALL 在周打标任务完成后生成周报：
- 调用 `/api/documents/weekly` 生成周报文档
- 周报包含：反馈统计、NPS 分数、Top 问题
- 发送周报通知到飞书群

## Non-Functional Requirements

- **NFR-1**: 批量打标处理 50 条反馈的时间不超过 3 分钟
- **NFR-2**: 所有数据写入操作必须有错误处理和日志记录
- **NFR-3**: API 响应时间不超过 10 秒

## Constraints
- **Technical**: Next.js 14 + TypeScript + TailwindCSS
- **Business**: 不影响现有数据结构
- **Dependencies**: 飞书 API、AgnesAI API

## Assumptions
- 飞书多维表格已正确配置
- AI API 可用
- 开发模式已开启

## Acceptance Criteria

### AC-1: 标签表数据正确
- **Given**: 执行周打标任务
- **When**: AI 打标完成后
- **Then**: TAG1/TAG2/TAG3 表中应有对应标签数据
- **Verification**: `programmatic`

### AC-2: 反馈记录打标正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 反馈表中状态为 "new" 的记录应更新为 "pending"，且包含 tag1/tag2/tag3 数据
- **Verification**: `programmatic`

### AC-3: 消息发送正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 飞书群只收到一条通知消息，包含 Top5 问题
- **Verification**: `human-judgment`

### AC-4: 周报生成正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 生成周报文档并发送通知到飞书群
- **Verification**: `human-judgment`

## Open Questions
- [ ] TAG_FIELDS 的具体字段名是否与实际表格字段匹配？
- [ ] 是否需要清理现有空白的标签表数据？
