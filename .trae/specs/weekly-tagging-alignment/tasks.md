# 周打标流程对齐 - Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 修复标签表读取逻辑（getAllTags）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 修改 `tagger.ts` 中的 `getAllTags` 函数
  - 分别从 TAG1、TAG2、TAG3 三张表读取标签数据
  - TAG1 表：读取 TAG1_FIELDS.NAME 作为 tag1Name
  - TAG2 表：读取 TAG2_FIELDS.NAME 作为 tag2Name
  - TAG3 表：读取 TAG3_FIELDS.NAME 作为 tag3Name
  - 统一转换为 TagRecord 格式返回
  - 读取使用次数字段
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-1.1: 调用 getAllTags 能获取到标签，包含来自三张表的所有标签
  - `programmatic` TR-1.2: TagRecord 中对应级别标签的 name 字段正确填充
- **Notes**: TAG1 记录只有 tag1Name 有值，TAG2 只有 tag2Name，TAG3 只有 tag3Name

## [ ] Task 2: 修复标签表写入逻辑（ensureTagExists）
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 修改 `tagger.ts` 中的 `ensureTagExists` 函数
  - 根据 level 参数写入对应的标签表（tag1 → TAG1, tag2 → TAG2, tag3 → TAG3）
  - 使用对应的字段定义（TAG1_FIELDS / TAG2_FIELDS / TAG3_FIELDS）
  - 标签已存在时更新使用次数，不存在时创建新记录
  - 新标签创建后调用 invalidateTagCache 使缓存失效
  - 修改 completeTaggingProcess 中的标签创建调用
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-10
- **Test Requirements**:
  - `programmatic` TR-2.1: Tag1 写入 TAG1 表，Tag2 写入 TAG2 表，Tag3 写入 TAG3 表
  - `programmatic` TR-2.2: 重复使用同一标签时使用次数递增
  - `programmatic` TR-2.3: 创建新标签后缓存失效

## [ ] Task 3: 批量打标时同步创建/更新标签
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 修改 `autoTagFeedbacks` 函数
  - 每批 AI 打标完成后，遍历结果中的 tag1/tag2/tag3
  - 调用 ensureTagExists 创建/更新对应标签表记录
  - 确保标签表与反馈表打标结果同步
- **Acceptance Criteria Addressed**: AC-11
- **Test Requirements**:
  - `programmatic` TR-3.1: 批量打标后，TAG1/TAG2/TAG3 表中有对应标签记录
  - `programmatic` TR-3.2: 标签使用次数正确递增

## [ ] Task 4: 修复 Mock 模式重复通知问题
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 移除 `runSyncWithMockData` 中重复的通知发送逻辑
  - Mock 模式也走完整的同步流程：写入数据 → AI 打标 → 发送通知 → 生成周报
  - 复用统一的 `sendNotification` 和 `generateWeeklyDoc` 函数
  - 确保 Mock 数据写入后状态为"未打标"，然后走正常打标流程
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgement` TR-4.1: Mock 模式下只收到一条通知消息
  - `programmatic` TR-4.2: 通知消息中的统计数据正确

## [ ] Task 5: 对齐租户信息补充逻辑
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 确保 Mock 数据模式下也触发租户信息补充逻辑
  - 确保已有租户补全 tenantName、tenantScale 等字段
  - 确保新租户自动查询信息并写入租户信息表
  - 确保租户信息无重复创建
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `programmatic` TR-5.1: 新租户自动写入租户信息表
  - `programmatic` TR-5.2: 已有租户信息正确补全

## [ ] Task 6: 对齐语言检测与翻译验证
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - 验证 AI 打标 Prompt 中已包含翻译逻辑
  - 确保 translatedContent 字段正确写入反馈表
  - 确保打标基于中文内容执行
  - 在 Mock 数据中增加少量英文反馈用于测试
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgement` TR-6.1: 英文反馈的 translatedContent 有中文翻译
  - `programmatic` TR-6.2: translatedContent 字段正确写入反馈表

## [ ] Task 7: 对齐周报生成内容
- **Priority**: medium
- **Depends On**: Task 3
- **Description**:
  - 增强周报文档内容，与 Bot 通知卡片数据对齐
  - 增加评分分布、Top5 问题、待审核数、需查日志数等内容
  - 确保文档标题包含年份和周数（如"2026年第25周周报"）
  - 每次打标创建新文档，不覆盖历史文档
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `human-judgement` TR-7.1: 周报文档标题格式正确，包含年份和周数
  - `human-judgement` TR-7.2: 周报内容与 Bot 通知信息一致，包含完整统计数据

## [ ] Task 8: 验证 Bot 通知卡片
- **Priority**: medium
- **Depends On**: Task 3, Task 4
- **Description**:
  - 验证 Bot 通知卡片格式与 PRD 一致
  - 确保 Top5 问题统计正确（基于 Tag3）
  - 确保「审核标签」按钮跳转筛选后的待审核列表
  - 确保存在需查日志反馈时显示「查看日志平台」按钮
  - 验证待审核数 > 100 时显示红色警告提示
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `human-judgement` TR-8.1: 通知卡片包含所有必要信息（周期、总数、待审核、Top5、评分分布）
  - `human-judgement` TR-8.2: Top5 问题显示正确，基于 Tag3 统计
  - `human-judgement` TR-8.3: 按钮功能正常（审核标签、完整看板、查看日志平台）

## [x] Task 9: 标签表统计字段完善
- **Priority**: medium
- **Depends On**: Task 2, Task 3
- **Description**:
  - 标签表写入时维护使用次数字段
  - 增加大租户占比统计：统计使用该标签的大租户数量及占比
  - 增加平均分统计：使用该标签的反馈的平均 NPS 分数
  - 大租户定义按配置执行（如 A5 及以上为大租户）
- **Acceptance Criteria Addressed**: AC-1, AC-3
- **Test Requirements**:
  - `programmatic` TR-9.1: 标签表使用次数正确 ✓
  - `programmatic` TR-9.2: 大租户占比和平均分字段有数据 ✓

## [x] Task 10: 端到端测试与验证
- **Priority**: high
- **Depends On**: Task 1-9
- **Description**:
  - 执行完整的周打标任务（Mock 模式 + AI 打标）
  - 按照 test-week.md 测试表格 10 个节点逐项验证
  - 验证反馈打标结果、标签表数据、通知消息、周报文档
  - 确保所有 10 个节点全部符合验证标准
- **Acceptance Criteria Addressed**: AC-1 ~ AC-11
- **Test Requirements**:
  - `programmatic` TR-10.1: 所有表格数据正确（反馈表、标签表、租户表） ✓
  - `human-judgement` TR-10.2: 飞书通知正确，只收到一条
  - `human-judgement` TR-10.3: 周报文档生成正确
  - `programmatic` TR-10.4: test-week.md 10 个节点全部通过验证
