# Tasks

## 验证任务

- [x] Task 1: 验证配置保存功能
  - [x] SubTask 1.1: 检查飞书配置保存是否正确写入环境变量或 KV 存储
  - [x] SubTask 1.2: 检查多维表格配置保存是否正确写入环境变量或 KV 存储
  - [x] SubTask 1.3: 检查 AI 配置保存是否正确写入环境变量或 KV 存储
  - [x] SubTask 1.4: 检查标签配置保存是否正确写入环境变量或 KV 存储
  - [x] SubTask 1.5: 检查任务配置保存是否正确写入环境变量或 KV 存储
  - [x] SubTask 1.6: 验证敏感字段是否以密文形式存储

- [x] Task 2: 验证 Excel 导入流程
  - [x] SubTask 2.1: 检查 Excel 导入 API 是否正确解析数据
  - [x] SubTask 2.2: 检查数据是否正确写入多维表格的反馈表
  - [x] SubTask 2.3: 验证导入统计返回是否正确(total, written, skipped)
  - [x] SubTask 2.4: 测试错误格式 Excel 的处理逻辑

- [x] Task 3: 验证首次用户默认配置
  - [x] SubTask 3.1: 检查首次访问配置中心时是否自动填充默认配置
  - [x] SubTask 3.2: 验证默认 Tag1 配置是否正确(7 个默认标签)
  - [x] SubTask 3.3: 验证默认 Schedule 配置是否正确(周同步、月分析)
  - [x] SubTask 3.4: 验证默认 ConfidenceThreshold 和 LargeTenantLevels 是否正确

- [x] Task 4: 验证配置回显功能
  - [x] SubTask 4.1: 检查配置回显是否从环境变量或 KV 存储正确读取
  - [x] SubTask 4.2: 验证敏感字段是否显示为"已配置"状态
  - [x] SubTask 4.3: 验证非敏感字段是否显示实际值
  - [x] SubTask 4.4: 验证未配置字段是否显示为空或默认值

## 修复任务

- [x] Task 5: 修复消息通知问题
  - [x] SubTask 5.1: 检查周同步任务完成后的通知发送逻辑
  - [x] SubTask 5.2: 检查月分析任务完成后的通知发送逻辑
  - [x] SubTask 5.3: 修复通知内容缺失问题(反馈总数、Top 问题等)
  - [x] SubTask 5.4: 验证通知是否正确发送到飞书群

- [x] Task 6: 修复 Bot 响应问题
  - [x] SubTask 6.1: 检查 /nps help 命令响应逻辑
  - [x] SubTask 6.2: 检查 /nps status 命令响应逻辑
  - [x] SubTask 6.3: 检查 /nps tag 命令响应逻辑
  - [x] SubTask 6.4: 检查 /nps analyze 命令响应逻辑
  - [x] SubTask 6.5: 检查自然语言问答响应逻辑
  - [x] SubTask 6.6: 修复 Bot 响应缺失或错误的问题

- [x] Task 7: 更新 AGENTS.md
  - [x] SubTask 7.1: 在 AGENTS.md 中添加"不猜测"规则章节
  - [x] SubTask 7.2: 添加"不猜测用户意图"规则
  - [x] SubTask 7.3: 添加"不猜测配置值"规则
  - [x] SubTask 7.4: 添加"不猜测 API 响应格式"规则
  - [x] SubTask 7.5: 添加"不猜测数据库结构"规则

## 测试任务

- [x] Task 8: 编写验证测试
  - [x] SubTask 8.1: 编写配置保存验证测试脚本
  - [x] SubTask 8.2: 编写 Excel 导入验证测试脚本
  - [x] SubTask 8.3: 编写首次用户默认配置验证测试脚本
  - [x] SubTask 8.4: 编写配置回显验证测试脚本
  - [x] SubTask 8.5: 编写消息通知验证测试脚本
  - [x] SubTask 8.6: 编写 Bot 响应验证测试脚本

# Task Dependencies

- Task 5 依赖 Task 1 (需要先验证配置保存是否正确) ✅ 已完成
- Task 6 依赖 Task 1 (需要先验证配置保存是否正确) ✅ 已完成
- Task 8 依赖 Task 1-7 (需要先完成所有验证和修复) ✅ 已完成
- Task 1-4 可以并行执行(验证任务) ✅ 已完成
- Task 5-7 可以并行执行(修复任务) ✅ 已完成
