# 配置中心验证与问题修复 Spec

## Why
配置中心是 NPS Insight 的核心功能,需要确保所有保存操作正确写入数据库、Excel 导入流程正常、首次用户默认配置正确写入、配置回显功能正常。同时需要修复消息通知问题(周打标、月分析)和 Bot 响应问题,并更新 AGENTS.md 添加"不猜测"规则。

## What Changes
- 验证配置中心所有保存功能是否正确写入数据库
- 验证 Excel 导入流程是否正常工作
- 验证首次用户默认配置写入逻辑
- 验证配置回显功能是否正确
- 修复消息通知问题(周打标、月分析)
- 修复 Bot 响应问题
- 更新 AGENTS.md 添加"不猜测"规则

## Impact
- Affected specs: 配置中心、数据导入、消息通知、Bot 响应
- Affected code:
  - `src/app/api/config/route.ts` - 配置保存 API
  - `src/components/admin/config-center/use-config-actions.ts` - 配置保存逻辑
  - `src/app/api/webhook/feishu/route.ts` - Bot 响应处理
  - `src/app/api/cron/sync/route.ts` - 周打标任务
  - `src/app/api/cron/monthly/route.ts` - 月分析任务
  - `AGENTS.md` - 项目规则文档

## ADDED Requirements

### Requirement: 配置保存验证
系统 SHALL 提供配置保存验证机制,确保所有配置项正确写入数据库。

#### Scenario: 保存飞书配置
- **WHEN** 用户保存飞书配置(AppId, AppSecret)
- **THEN** 配置应正确写入环境变量或 KV 存储
- **AND** 配置回显时应显示为"已配置"状态(敏感字段不明文显示)

#### Scenario: 保存多维表格配置
- **WHEN** 用户保存多维表格配置(AppToken, URL, TableIds)
- **THEN** 配置应正确写入环境变量或 KV 存储
- **AND** 配置回显时应正确显示所有字段值

#### Scenario: 保存 AI 配置
- **WHEN** 用户保存 AI 配置(Provider, ApiKey, Model)
- **THEN** 配置应正确写入环境变量或 KV 存储
- **AND** ApiKey 应以密文形式存储

#### Scenario: 保存标签配置
- **WHEN** 用户保存标签配置(Tag1, Tag2Init, ConfidenceThreshold)
- **THEN** 配置应正确写入环境变量或 KV 存储
- **AND** 配置回显时应正确显示所有标签定义

#### Scenario: 保存任务配置
- **WHEN** 用户保存任务配置(Schedule, LogPlatform, Notification)
- **THEN** 配置应正确写入环境变量或 KV 存储
- **AND** Cron 表达式应正确生成

### Requirement: Excel 导入验证
系统 SHALL 提供正确的 Excel 导入流程,确保数据正确写入多维表格。

#### Scenario: Excel 导入成功
- **WHEN** 用户上传包含反馈数据的 Excel 文件
- **THEN** 系统应正确解析 Excel 数据
- **AND** 数据应正确写入多维表格的反馈表
- **AND** 应返回导入统计(total, written, skipped)

#### Scenario: Excel 导入失败
- **WHEN** 用户上传格式错误的 Excel 文件
- **THEN** 系统应返回明确的错误信息
- **AND** 不应写入任何数据到多维表格

### Requirement: 首次用户默认配置
系统 SHALL 为首次用户提供默认配置写入机制。

#### Scenario: 首次访问配置中心
- **WHEN** 首次用户访问配置中心
- **THEN** 系统应自动填充默认配置值
- **AND** 默认配置应包含:
  - Tag1: 7 个默认标签(疑似Bug、功能优化、界面改进、性能提升、用户教育、安全合规、无效反馈)
  - Schedule: 周同步(每周一 00:00)、月分析(每月 1 日 00:00)
  - ConfidenceThreshold: 0.8
  - LargeTenantLevels: A4,A5

#### Scenario: 首次保存配置
- **WHEN** 首次用户保存配置
- **THEN** 系统应将配置写入 KV 存储
- **AND** 应生成唯一的配置 ID

### Requirement: 配置回显验证
系统 SHALL 提供正确的配置回显功能。

#### Scenario: 配置回显
- **WHEN** 用户访问配置中心
- **THEN** 系统应从环境变量或 KV 存储读取配置
- **AND** 敏感字段(ApiKey, AppSecret)应显示为"已配置"状态
- **AND** 非敏感字段应显示实际值
- **AND** 未配置字段应显示为空或默认值

### Requirement: 消息通知修复
系统 SHALL 正确发送周打标和月分析通知。

#### Scenario: 周打标通知
- **WHEN** 周同步任务完成
- **THEN** 系统应发送周报通知到飞书群
- **AND** 通知应包含:
  - 本周反馈总数
  - 已打标数量
  - Top 问题列表
  - 多维表格链接

#### Scenario: 月分析通知
- **WHEN** 月分析任务完成
- **THEN** 系统应发送月报通知到飞书群
- **AND** 通知应包含:
  - 本月反馈总数
  - NPS 分数
  - Top 问题分析
  - 标签自进化结果
  - 会议文档链接

### Requirement: Bot 响应修复
系统 SHALL 正确响应飞书 Bot 命令。

#### Scenario: Bot 响应 /nps help
- **WHEN** 用户发送 "/nps help" 命令
- **THEN** Bot 应返回帮助卡片
- **AND** 卡片应包含所有可用命令列表

#### Scenario: Bot 响应 /nps status
- **WHEN** 用户发送 "/nps status" 命令
- **THEN** Bot 应返回系统状态信息
- **AND** 信息应包含:
  - 总反馈数
  - 已打标数
  - 待审核数
  - 平均 NPS 分数

#### Scenario: Bot 响应 /nps tag
- **WHEN** 用户发送 "/nps tag" 命令
- **THEN** Bot 应触发周同步任务
- **AND** 应返回"打标任务已触发"提示

#### Scenario: Bot 响应 /nps analyze
- **WHEN** 用户发送 "/nps analyze" 命令
- **THEN** Bot 应触发月分析任务
- **AND** 应返回"分析任务已触发"提示

#### Scenario: Bot 响应自然语言问题
- **WHEN** 用户 @Bot 发送自然语言问题
- **THEN** Bot 应调用问答引擎处理
- **AND** 应返回相关答案

### Requirement: AGENTS.md 更新
系统 SHALL 在 AGENTS.md 中添加"不猜测"规则。

#### Scenario: 不猜测规则添加
- **WHEN** 更新 AGENTS.md
- **THEN** 应添加以下规则:
  - 不猜测用户意图,必须明确确认
  - 不猜测配置值,必须从环境变量或 KV 存储读取
  - 不猜测 API 响应格式,必须查阅文档
  - 不猜测数据库结构,必须从实际数据读取
