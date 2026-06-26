# NPS Insight 标签自进化 V2 - 产品需求文档

## Overview
- **Summary**: 基于 LLM 语义分析的新一代标签自进化系统，替代原有基于字符串相似度的简单实现。支持小数据全量分析/大数据高频过滤双模式，严格按 Tag3→Tag2 顺序执行合并与拆分，模糊判定统一走人工复核。
- **Purpose**: 解决现有标签自进化仅靠字符串匹配导致的语义识别不准、拆分逻辑简单、无人工复核机制等问题，提升标签体系的准确性和可维护性。
- **Target Users**: 产品运营人员、NPS 分析人员

## Goals
- 基于独立 LLM 做语义级标签分析，而非简单字符串匹配
- 支持双模式分流：≤2000 条全量分析，>2000 条高频过滤
- 严格执行顺序：先全部 Tag3 合并/拆分，再 Tag2 合并
- 每条 Tag3 附带真实用户反馈样本（5 条/3 条）供 AI 参考
- 所有模糊判定统一进入人工复核清单，系统不自动改表
- 每步操作做数据校验，失败则阻断并移入人工清单
- 完全独立于周打标逻辑，不影响周打标功能

## Non-Goals (Out of Scope)
- 不修改周打标（`tagger.ts`）的任何逻辑
- 不改动飞书多维表格的表结构和字段定义
- 不实现标签的人工审核 UI 界面（仅生成清单）
- 不涉及 Top 问题生成、公式同步等月度后续环节
- 不修改 Tag1 标签体系（Tag1 固定 7 类）

## Background & Context
- 现有 `tag-evolution.ts` 基于 `calculateSimilarity` 做字符串相似度，无法识别语义相近但文字不同的标签
- 现有实现拆分逻辑过于简单（占比 >60% 即拆分），缺乏业务场景判断
- 现有实现无人工复核机制，自动操作可能误判
- 周打标功能正在并行优化中，必须确保互不影响
- 字段体系已具备：Tag3 有 `所属二级标签`、Tag2 有 `所属一级标签`、均有 `usageCount`、`largeTenantCount`

## Functional Requirements
- **FR-1**: 并行读取 5 类数据：反馈总数、Tag1/Tag2/Tag3 全量表、Tag3 反馈样本
- **FR-2**: 根据 total_feedback_count 自动分流：≤2000 全量模式，>2000 高频过滤模式
- **FR-3**: 全量模式下所有 Tag2/Tag3 参与分析，manual_tag_list 为空
- **FR-4**: 高频模式下 Tag3 使用<5 次、Tag2 使用<10 次移入人工清单，不参与 AI 分析
- **FR-5**: 组装 AI 入参：全局标签参考（tag1/tag2/tag3 精简信息）+ 待分析数据 + 模式标识
- **FR-6**: 拼接固定 Prompt，单次调用 LLM 获取 JSON 优化方案
- **FR-7**: 校验 AI 返回 JSON 格式，缺失字段则终止进化并告警
- **FR-8**: 执行 Tag3 合并：更新反馈关联、更新 Tag3 表、删除废弃标签、数值校验
- **FR-9**: 执行 Tag3 拆分生成新 Tag2：新建 Tag2、更新 Tag3 归属、同步反馈 Tag2、校验无游离
- **FR-10**: 执行 Tag2 合并：更新 Tag3 归属、更新反馈关联、更新 Tag2 表、数值校验
- **FR-11**: 汇总变更记录：自动变更统计 + AI 人工复核 + 低频过滤清单
- **FR-12**: 执行完成后清空标签缓存（调用 tagger.ts 的 invalidateTagCache）

## Non-Functional Requirements
- **NFR-1**: 所有异步操作必须 try/catch，错误记录日志
- **NFR-2**: 每步操作前做数据校验，校验失败阻断执行不回滚，移入人工清单
- **NFR-3**: AI 调用超时/报错捕获，终止进化并推送告警
- **NFR-4**: 代码与周打标逻辑完全解耦，通过缓存失效函数间接交互
- **NFR-5**: 使用现有 `chatCompletionJSON` 调用 LLM，不新建 AI 客户端

## Constraints
- **Technical**: Next.js 14 + TypeScript + TailwindCSS，复用现有 LLM 调用模块
- **Business**: 标签操作不可逆，必须确保数据校验通过才执行
- **Dependencies**: 飞书多维表格（Tag1/Tag2/Tag3/反馈列表）、AgnesAI LLM

## Assumptions
- Tag3 表的 `所属二级标签` 字段存储的是 Tag2 的 tagId（文本格式）
- Tag2 表的 `所属一级标签` 字段存储的是 Tag1 的 tagId（文本格式）
- 反馈表的 tag1/tag2/tag3 字段是 MultiSelect，存储标签名称（与现有周打标一致）
- 飞书多维表格 API 支持批量更新和批量删除
- 现有 `bitableClient` 提供 listRecords / createRecord / updateRecord / deleteRecord 方法

## Acceptance Criteria

### AC-1: 并行数据读取
- **Given**: 飞书多维表格中有反馈数据和标签数据
- **When**: 启动标签自进化
- **Then**: 并行完成 5 项读取：反馈总数、tag1_map、tag2_map、tag3_map、tag3_sample_map
- **Verification**: `programmatic`
- **Notes**: 读取失败应抛出异常并终止流程

### AC-2: 小数据模式分流
- **Given**: total_feedback_count ≤ 2000
- **When**: 进入分流判断
- **Then**: 所有 Tag2/Tag3 全部进入待分析集合，manual_tag_list 为空，每条 Tag3 附带 5 条反馈样本
- **Verification**: `programmatic`

### AC-3: 大数据模式分流
- **Given**: total_feedback_count > 2000
- **When**: 进入分流判断
- **Then**: Tag3 使用<5 次、Tag2 使用<10 次移入 manual_tag_list，每条 Tag3 附带 3 条反馈样本
- **Verification**: `programmatic`

### AC-4: AI 入参打包
- **Given**: 分流完成后的待分析集合
- **When**: 组装 AI 请求
- **Then**: 入参包含 global_tag_reference（三层标签精简信息）+ analysis_data（tag3_list/tag2_list）+ mode 字段，Prompt 文本完全固定
- **Verification**: `programmatic`

### AC-5: AI 返回格式校验
- **Given**: LLM 返回了响应
- **When**: 解析返回结果
- **Then**: 包含 tag3_opt_result（merge_tag3 + split_tag3_to_new_tag2）+ tag2_opt_result（merge_tag2）+ manual_review，格式错误终止进化
- **Verification**: `programmatic`

### AC-6: Tag3 合并执行
- **Given**: AI 返回了 merge_tag3 清单
- **When**: 执行 Tag3 合并
- **Then**: 废弃 Tag3 的所有反馈关联切换为主标签，废弃标签从表删除，主标签使用次数更新，合并前后反馈总数相等
- **Verification**: `programmatic`
- **Notes**: 校验失败则阻断，移入人工清单

### AC-7: Tag3 拆分生成新 Tag2
- **Given**: AI 返回了 split_tag3_to_new_tag2 清单
- **When**: 执行拆分
- **Then**: 新建 Tag2 记录并生成唯一 tagId，对应 Tag3 的「所属二级标签」更新，反馈表 tag2 同步更新，原 Tag2 下所有 Tag3 无游离
- **Verification**: `programmatic`
- **Notes**: 校验失败则阻断

### AC-8: Tag2 合并执行
- **Given**: Tag3 全部处理完成，AI 返回了 merge_tag2 清单
- **When**: 执行 Tag2 合并
- **Then**: 废弃 Tag2 下全部 Tag3 归属切换为主 Tag2，反馈表 tag2 同步更新，废弃 Tag2 删除，数值校验通过
- **Verification**: `programmatic`
- **Notes**: 校验失败则阻断，移入人工清单

### AC-9: 变更汇总
- **Given**: 所有变更操作完成
- **When**: 汇总结果
- **Then**: 输出合并 Tag3 数量、新增 Tag2 数量、合并 Tag2 数量，以及合并后的人工待处理清单（AI 模糊 + 低频过滤）
- **Verification**: `programmatic`

### AC-10: 缓存失效
- **Given**: 标签自进化执行完成（无论成功或部分失败）
- **When**: 流程结束
- **Then**: 调用 `invalidateTagCache()` 清空周打标标签缓存，下次打标拉取最新数据
- **Verification**: `programmatic`

### AC-11: 不影响周打标
- **Given**: 标签自进化运行中或运行后
- **When**: 执行周打标任务
- **Then**: 周打标功能正常，打标结果不受影响，仅标签数据为最新进化后的状态
- **Verification**: `programmatic`

### AC-12: 错误处理
- **Given**: 执行过程中出现错误（AI 调用失败、表格操作失败等）
- **When**: 异常发生
- **Then**: 记录错误日志，已执行的操作不回滚，未执行的跳过，错误信息包含在最终结果中
- **Verification**: `human-judgment`

## Open Questions
- [ ] Tag3 表的「所属二级标签」字段目前存的是 tagId 还是名称？需要确认
- [ ] 反馈表的 tag2 字段存的是标签名称还是 tagId？（目前周打标存的是名称）
- [ ] 大数据模式下低频标签仅放入人工清单，是否需要在月报中展示？
- [ ] AI 返回的 manual_review 格式是字符串数组，如何标准化存储和展示？
