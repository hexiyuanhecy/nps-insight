# 周打标流程对齐 - Product Requirement Document

## Overview
- **Summary**: 将周打标流程的代码实现与 test-week.md 中定义的标准流程严格对齐，修复标签表读写错误、Mock 模式重复通知等核心问题，确保 10 个节点全部符合验证标准
- **Purpose**: 解决当前周打标流程中标签表空白、反馈未正确打标、通知重复发送等问题，使系统行为与 test-week.md 定义完全一致
- **Target Users**: NPS Insight 系统管理员、产品测试人员

## Goals
- 修复标签表读写逻辑：ensureTagExists 按 level 写入对应表，getAllTags 从三张表读取
- 标签表写入使用次数、大租户占比等统计字段
- 修复 Mock 模式下重复发送通知的问题
- 确保周报生成与 Bot 通知内容一致
- 全流程通过 test-week.md 测试表格的所有 10 个节点验证

## Non-Goals (Out of Scope)
- 不新增 Excel 数据源读取功能（当前仅 Mock/API 模式）
- 不修改标签体系的三级结构
- 不重构飞书多维表格的字段定义
- 不修改定时任务调度逻辑
- 不将标签从纯文本 MultiSelect 改为关联类型（保持现有存储方式）

## Background & Context
test-week.md 定义了周打标流程的 10 个节点及验证标准，当前代码实现存在以下核心差异：

**已确认的代码与文档差异：**

1. **标签表读写错误（严重）**：
   - `ensureTagExists` 函数硬编码写入 `TABLE_NAMES.TAG1`，所有标签（Tag1/Tag2/Tag3）都写入同一张表
   - `getAllTags` 函数只从 `TABLE_NAMES.TAGS` 读取，导致标签体系为空
   - 标签表字段名使用 `TAG_FIELDS`（旧的 TAGS 表字段），而不是对应的 TAG1_FIELDS/TAG2_FIELDS/TAG3_FIELDS

2. **Mock 模式重复通知（严重）**：
   - `runSyncWithMockData` 中单独实现了一套通知发送逻辑
   - 同时 `runSyncTaskSingleUser` 也会调用 `sendNotification`
   - 导致每次 Mock 打标发送两条重复消息

3. **批量打标未创建标签**：
   - `autoTagFeedbacks` 函数只调用 `tagger.batchAnalyzeFeedbacks`，没有调用 `ensureTagExists` 创建/更新标签
   - 导致标签表始终为空

4. **租户信息补充**：
   - 只补充了 tenantName，缺少 tenantScale 等字段
   - Mock 数据模式下未明确是否触发租户信息补充

5. **语言检测与翻译**：
   - 依赖 AI 打标时同步处理，无独立语言检测步骤
   - 需验证 translatedContent 是否正确写入

6. **标签缓存失效机制**：
   - 有 `invalidateTagCache` 函数，但标签变更后是否主动调用待确认

7. **周报生成与通知一致性**：
   - 周报文档内容较简单，与 Bot 通知卡片数据不完全对齐
   - test-week.md 要求"内容与 Bot 通知信息一致"

8. **标签表统计字段**：
   - 节点 8 明确要求标签表有使用次数、大租户占比等公式字段
   - 当前使用次数由代码手动递增，缺少大租户占比统计

## Functional Requirements

### FR-1: 修复标签表读取逻辑
系统 SHALL 从所有三张标签表读取标签数据：
- 分别读取 TAG1、TAG2、TAG3 三张表的数据
- TAG1 表：使用 TAG1_FIELDS.NAME 作为标签名
- TAG2 表：使用 TAG2_FIELDS.NAME 作为标签名
- TAG3 表：使用 TAG3_FIELDS.NAME 作为标签名
- 统一转换为 TagRecord 格式返回
- 缓存机制保持 5 分钟 TTL 不变

### FR-2: 修复标签表写入逻辑
系统 SHALL 根据标签级别写入对应的标签表：
- Tag1 写入 TAG1 表，使用 TAG1_FIELDS 字段定义
- Tag2 写入 TAG2 表，使用 TAG2_FIELDS 字段定义
- Tag3 写入 TAG3 表，使用 TAG3_FIELDS 字段定义
- 标签已存在时使用次数 +1，不存在时创建新标签
- 新标签创建时生成唯一 tagId
- 批量打标时也必须创建/更新标签表记录

### FR-3: 标签表统计字段
系统 SHALL 在标签表中维护统计字段：
- 使用次数字段：每次使用标签时递增
- 大租户数：统计使用该标签的大租户数量
- 大租户占比：大租户数 / 使用次数（代码计算后写入，或依赖表格公式）
- 平均分：使用该标签的反馈的平均 NPS 分数

### FR-4: 修复 Mock 模式重复通知
系统 SHALL 在 Mock 模式下只发送一次通知：
- `runSyncWithMockData` 复用统一的 `sendNotification` 函数
- 移除 Mock 函数内部的重复通知发送逻辑
- 确保通知统计数据基于打标后的真实结果
- Mock 模式走完整的同步 → 打标 → 通知 → 周报流程

### FR-5: 批量打标时创建标签
系统 SHALL 在批量打标时同步创建/更新标签：
- `autoTagFeedbacks` 中，每批 AI 打标完成后，遍历结果创建/更新标签
- 确保 Tag1/Tag2/Tag3 分别写入对应的标签表
- 使用次数正确递增

### FR-6: 对齐租户信息补充
系统 SHALL 在数据同步时完整补充租户信息：
- 已有租户补全 tenantName、tenantScale 等字段
- 新租户自动查询信息并写入租户信息表
- 租户信息无重复创建

### FR-7: 对齐语言检测与翻译
系统 SHALL 在 AI 打标流程中正确处理非中文反馈：
- 非中文反馈自动翻译为中文，写入 translatedContent 字段
- 打标基于中文内容执行
- 中文反馈 translatedContent 为空

### FR-8: 标签缓存失效机制
系统 SHALL 在标签变更后使缓存失效：
- 创建新标签后调用 `invalidateTagCache`
- 更新标签后调用 `invalidateTagCache`
- 确保下次打标重新加载最新标签

### FR-9: 对齐周报生成
系统 SHALL 生成与 Bot 通知一致的周报文档：
- 文档标题包含年份和周数标识（如"2026年第25周周报"）
- 内容包含：反馈总数、NPS 分数、评分分布、Top 问题、待审核数
- 内容与 Bot 通知信息一致
- 每次打标创建新文档，不覆盖历史文档

### FR-10: 对齐 Bot 周报通知
系统 SHALL 发送符合 PRD 定义的周报通知卡片：
- 卡片包含：周期信息、反馈总数、待审核数、Top5 问题、评分分布
- 「审核标签」按钮跳转筛选后的待审核列表
- 存在需查日志反馈时显示「查看日志平台」按钮
- 待审核数 > 100 时显示红色警告提示
- 每次周打标只发送一条通知消息

## Non-Functional Requirements

- **NFR-1**: 批量打标处理 50 条反馈的时间不超过 3 分钟
- **NFR-2**: 所有数据写入操作必须有错误处理和日志记录
- **NFR-3**: API 响应时间不超过 10 秒
- **NFR-4**: 标签缓存命中率 > 80%（5 分钟内重复打标）

## Constraints
- **Technical**: Next.js 14 + TypeScript + TailwindCSS
- **Business**: 不影响现有数据结构，向后兼容
- **Dependencies**: 飞书多维表格 API、AgnesAI API

## Assumptions
- 飞书多维表格已正确配置 TAG1/TAG2/TAG3 三张表
- AI API 可用且返回格式符合预期
- 开发模式使用 Mock 数据进行测试
- 通知群 ID 已正确配置
- 标签表的大租户占比等统计字段由代码计算写入（暂不依赖多维表格公式）

## Acceptance Criteria

### AC-1: 标签表数据正确写入
- **Given**: 执行周打标任务，AI 生成了 Tag1/Tag2/Tag3 标签
- **When**: 打标完成后
- **Then**: TAG1 表中有 Tag1 标签数据，TAG2 表中有 Tag2 标签数据，TAG3 表中有 Tag3 标签数据
- **Verification**: `programmatic`

### AC-2: 标签表数据正确读取
- **Given**: TAG1/TAG2/TAG3 表中已有标签数据
- **When**: 调用 getCachedTags 获取标签
- **Then**: 返回的 TagRecord 数组包含所有三张表的标签数据
- **Verification**: `programmatic`

### AC-3: 标签使用次数正确递增
- **Given**: 某标签已存在且使用次数为 N
- **When**: 再次打标使用了该标签
- **Then**: 该标签的使用次数变为 N+1
- **Verification**: `programmatic`

### AC-4: Mock 模式只发送一次通知
- **Given**: 开发模式下执行周打标
- **When**: 打标完成后
- **Then**: 飞书群只收到一条通知消息
- **Verification**: `human-judgment`

### AC-5: 反馈记录打标正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 反馈表中状态为"未打标"的记录更新为"已打标"，且包含 tag1/tag2/tag3/confidence/needLogCheck/reviewNeeded 数据
- **Verification**: `programmatic`

### AC-6: 非中文反馈翻译正确
- **Given**: 存在英文反馈内容
- **When**: AI 打标完成后
- **Then**: translatedContent 字段包含中文翻译，打标基于中文内容
- **Verification**: `human-judgment`

### AC-7: 周报文档生成正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 生成飞书周报文档，标题包含年份和周数，内容包含完整统计数据且与 Bot 通知一致
- **Verification**: `human-judgment`

### AC-8: Bot 通知卡片正确
- **Given**: 执行周打标任务
- **When**: 打标完成后
- **Then**: 飞书群收到周报通知卡片，包含 Top5 问题、评分分布、操作按钮，且只收到一条
- **Verification**: `human-judgment`

### AC-9: 租户信息正确补充
- **Given**: 新反馈包含新的 tenantId
- **When**: 数据同步完成后
- **Then**: 租户信息表中新增该租户记录，反馈记录中补全租户名称
- **Verification**: `programmatic`

### AC-10: 标签缓存机制正常
- **Given**: 首次打标已加载标签到缓存
- **When**: 5 分钟内再次打标
- **Then**: 直接使用缓存标签，不重复查询多维表格；标签变更后缓存失效
- **Verification**: `programmatic`

### AC-11: 批量打标时标签表同步更新
- **Given**: 执行批量 AI 打标
- **When**: 打标完成后
- **Then**: 所有打标使用到的标签都在对应标签表中有记录，使用次数正确
- **Verification**: `programmatic`
