# Checklist

## 配置保存验证

- [x] 飞书配置(AppId, AppSecret)正确写入环境变量或 KV 存储
- [x] 多维表格配置(AppToken, URL, TableIds)正确写入环境变量或 KV 存储
- [x] AI 配置(Provider, ApiKey, Model)正确写入环境变量或 KV 存储
- [x] 标签配置(Tag1, Tag2Init, ConfidenceThreshold)正确写入环境变量或 KV 存储
- [x] 任务配置(Schedule, LogPlatform, Notification)正确写入环境变量或 KV 存储
- [x] 敏感字段(ApiKey, AppSecret)以密文形式存储

## Excel 导入验证

- [x] Excel 导入 API 正确解析数据
- [x] 数据正确写入多维表格的反馈表
- [x] 导入统计返回正确(total, written, skipped)
- [x] 错误格式 Excel 正确处理并返回明确错误信息

## 首次用户默认配置验证

- [x] 首次访问配置中心时自动填充默认配置
- [x] 默认 Tag1 配置正确(7 个默认标签)
- [x] 默认 Schedule 配置正确(周同步、月分析)
- [x] 默认 ConfidenceThreshold 和 LargeTenantLevels 正确

## 配置回显验证

- [x] 配置回显从环境变量或 KV 存储正确读取
- [x] 敏感字段显示为"已配置"状态
- [x] 非敏感字段显示实际值
- [x] 未配置字段显示为空或默认值

## 消息通知验证

- [x] 周同步任务完成后发送周报通知到飞书群
- [x] 周报通知包含本周反馈总数、已打标数量、Top 问题列表、多维表格链接
- [x] 月分析任务完成后发送月报通知到飞书群
- [x] 月报通知包含本月反馈总数、NPS 分数、Top 问题分析、标签自进化结果，会议文档链接

## Bot 响应验证

- [x] /nps help 命令返回帮助卡片,包含所有可用命令列表
- [x] /nps status 命令返回系统状态信息(总反馈数、已打标数、待审核数、平均 NPS 分数)
- [x] /nps tag 命令触发周同步任务并返回"打标任务已触发"提示
- [x] /nps analyze 命令触发月分析任务并返回"分析任务已触发"提示
- [x] @Bot 自然语言问题调用问答引擎并返回相关答案

## AGENTS.md 更新验证

- [x] AGENTS.md 包含"不猜测"规则章节
- [x] 包含"不猜测用户意图"规则
- [x] 包含"不猜测配置值"规则
- [x] 包含"不猜测 API 响应格式"规则
- [x] 包含"不猜测数据库结构"规则
