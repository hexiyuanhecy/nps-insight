# 修复打标与报告生成问题 - Implementation Plan

## [ ] Task 1: 修复标签写入逻辑
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 修复 `ensureTagExists` 函数：根据 level 参数写入对应的标签表（TAG1/TAG2/TAG3）
  - 修复 `getAllTags` 函数：从所有三个标签表读取标签
  - 确保标签已存在时更新使用次数
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 打标后 TAG1/TAG2/TAG3 表中有对应标签数据
  - `programmatic` TR-1.2: 重复打标同一标签时使用次数递增

## [ ] Task 2: 修复反馈打标流程
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 修复 `autoTagFeedbacks` 函数：确保正确更新反馈记录的打标字段
  - 修复状态值：打标后更新为 "pending"
  - 确保 AI 打标结果正确写入反馈表
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: 打标后反馈记录状态从 "new" 变为 "pending"
  - `programmatic` TR-2.2: 反馈记录包含 tag1/tag2/tag3/confidence 数据

## [ ] Task 3: 修复消息发送逻辑
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 修复 Mock 同步任务中的消息发送逻辑
  - 确保每次周打标只发送一条消息
  - 正确统计 Top5 问题（基于 tag3）
  - 消息包含完整的统计信息
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `human-judgment` TR-3.1: 飞书群只收到一条通知消息
  - `human-judgment` TR-3.2: 消息包含 Top5 问题

## [ ] Task 4: 修复周报生成
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 在周打标任务完成后调用周报生成 API
  - 确保周报文档生成并发送通知
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-4.1: 生成周报文档并获取链接
  - `human-judgment` TR-4.2: 周报通知发送到飞书群

## [ ] Task 5: 端到端测试与验证
- **Priority**: high
- **Depends On**: Task 1-4
- **Description**:
  - 执行完整的周打标任务
  - 验证标签表数据
  - 验证反馈打标结果
  - 验证消息发送和周报生成
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-5.1: 所有表格数据正确
  - `human-judgment` TR-5.2: 飞书通知正确