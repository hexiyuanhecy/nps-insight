# NPS Insight 标签自进化 V2 - 任务拆解与实现计划

## [x] Task 1: 创建标签自进化 V2 类型定义与 Prompt 模板
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 新建 `src/lib/ai/tag-evolution-v2.ts` 的类型定义部分
  - 定义 `TagInfo`（三层标签通用结构）、`Tag3AnalysisItem`（待分析Tag3）、`Tag2AnalysisItem`（待分析Tag2）
  - 定义 AI 返回类型 `TagEvolutionAIResult`（tag3_opt_result、tag2_opt_result、manual_review）
  - 定义执行结果类型 `TagEvolutionResultV2`（变更统计 + 人工清单 + 错误信息）
  - 编写固定 Prompt 模板函数，严格按照文档中的格式
- **Acceptance Criteria Addressed**: [AC-4, AC-5]
- **Test Requirements**:
  - `programmatic` TR-1.1: 类型定义完整，所有字段与文档中 JSON 结构一一对应
  - `programmatic` TR-1.2: Prompt 模板与文档中的固定 Prompt 文本完全一致
  - `human-judgement` TR-1.3: 类型命名清晰，注释说明每类数据的来源和用途

## [x] Task 2: 实现并行数据读取与分流逻辑
- **Priority**: high
- **Depends On**: [Task 1]
- **Description**:
  - 实现并行读取：反馈列表（统计总数）、Tag1表、Tag2表、Tag3表
  - 实现 Tag3 反馈样本抽取：遍历反馈列表，按 Tag3 名称分组，随机抽取 5/3 条
  - 实现分流判断：total_feedback_count ≤ 2000 走全量模式，否则高频过滤模式
  - 全量模式：组装所有 Tag2/Tag3 进入待分析集合
  - 高频模式：过滤 Tag3 使用<5、Tag2 使用<10，剩余进入待分析集合，过滤项存入 manual_tag_list
- **Acceptance Criteria Addressed**: [AC-1, AC-2, AC-3]
- **Test Requirements**:
  - `programmatic` TR-2.1: 5 个并行任务全部成功返回才进入下一步
  - `programmatic` TR-2.2: 小数据模式（mock ≤2000）manual_tag_list 为空，所有标签都在待分析集合
  - `programmatic` TR-2.3: 大数据模式（mock >2000）Tag3<5 次、Tag2<10 次都在 manual_tag_list
  - `programmatic` TR-2.4: 小数据模式每条 Tag3 样本数 ≤5，大数据模式 ≤3
  - `programmatic` TR-2.5: 样本为真实绑定该 Tag3 的反馈原文，无绑定则为空数组

## [x] Task 3: 实现 AI 调用与结果解析校验
- **Priority**: high
- **Depends On**: [Task 2]
- **Description**:
  - 组装 AI 入参：global_tag_reference（三层标签精简信息）+ analysis_data + mode
  - 拼接固定 Prompt + 业务 JSON，调用 `chatCompletionJSON`
  - 实现 AI 返回结果校验：检查 tag3_opt_result、tag2_opt_result、manual_review 顶级字段
  - 格式错误时抛出异常，终止进化
  - 格式正确时拆分为：Tag3合并清单、Tag3拆分清单、Tag2合并清单、人工复核清单
- **Acceptance Criteria Addressed**: [AC-4, AC-5, AC-12]
- **Test Requirements**:
  - `programmatic` TR-3.1: AI 入参结构与文档完全一致，包含所有必需字段
  - `programmatic` TR-3.2: AI 调用失败（mock 网络错误）时捕获异常，不崩溃
  - `programmatic` TR-3.3: 返回格式缺失顶级字段时，抛出明确的格式错误
  - `programmatic` TR-3.4: 格式正确时正确拆分为 4 组数据

## [x] Task 4: 实现 Tag3 合并操作
- **Priority**: high
- **Depends On**: [Task 3]
- **Description**:
  - 循环执行每一组 Tag3 合并：
    1. 确定主标签（retain_tag_id），其余为废弃标签
    2. 全量遍历反馈列表，将废弃 Tag3 名称替换为主 Tag3 名称
    3. 更新 Tag3 表主标签的使用次数（累加）
    4. 删除 Tag3 表中的废弃标签行
    5. 数据校验：合并前各标签使用次数之和 = 合并后主标签使用次数
  - 校验失败时，该组合并操作移入人工复核清单，不回滚已执行的其他合并
  - 注意：反馈表 tag3 是 MultiSelect（字符串数组），需按名称匹配替换
- **Acceptance Criteria Addressed**: [AC-6]
- **Test Requirements**:
  - `programmatic` TR-4.1: 合并后反馈表中原废弃 Tag3 全部替换为主 Tag3
  - `programmatic` TR-4.2: 合并后主标签使用次数 = 所有被合并标签使用次数之和
  - `programmatic` TR-4.3: 废弃标签从 Tag3 表中删除
  - `programmatic` TR-4.4: 校验失败时该组合并被移入人工清单，不影响其他组合并

## [x] Task 5: 实现 Tag3 拆分生成新 Tag2
- **Priority**: high
- **Depends On**: [Task 4]
- **Description**:
  - 循环执行每条原 Tag2 的拆分方案：
    1. 为每个 new_tag2_list 项在 Tag2 表新建记录，自动生成唯一 tagId
    2. 批量更新对应 Tag3 表内「所属二级标签」为新 tag2Id
    3. 全量遍历反馈列表，同步更新反馈中 tag2 名称（旧 Tag2 名称 → 新 Tag2 名称）
    4. 数据校验：原 Tag2 下所有 Tag3 全部分配至新旧 Tag2，无游离标签
  - 校验失败时阻断当前拆分，移入人工清单
  - 注意：需要维护 tag2 名称映射关系，用于更新反馈表
- **Acceptance Criteria Addressed**: [AC-7]
- **Test Requirements**:
  - `programmatic` TR-5.1: 新 Tag2 成功创建，有唯一 tagId 和名称
  - `programmatic` TR-5.2: 被分配的 Tag3 的「所属二级标签」更新为新 Tag2 的 tagId
  - `programmatic` TR-5.3: 反馈表中对应的 tag2 名称同步更新
  - `programmatic` TR-5.4: 原 Tag2 下所有 Tag3 都有归属（旧 Tag2 或新 Tag2），无游离

## [x] Task 6: 实现 Tag2 合并操作
- **Priority**: high
- **Depends On**: [Task 5]
- **Description**:
  - 循环执行每一组 Tag2 合并：
    1. 确定主 Tag2（retain_tag_id），其余为废弃 Tag2
    2. 批量更新 Tag3 表：废弃 Tag2 下所有 Tag3 的「所属二级标签」替换为主 Tag2 的 tagId
    3. 全量遍历反馈列表，废弃 Tag2 名称替换为主 Tag2 名称
    4. 删除 Tag2 表中的废弃标签行
    5. 更新主 Tag2 的使用次数（累加）
    6. 数值校验：合并前后关联反馈总数一致
  - 校验失败时阻断当前合并，移入人工清单
- **Acceptance Criteria Addressed**: [AC-8]
- **Test Requirements**:
  - `programmatic` TR-6.1: 废弃 Tag2 下所有 Tag3 归属切换为主 Tag2
  - `programmatic` TR-6.2: 反馈表中废弃 Tag2 名称全部替换为主 Tag2 名称
  - `programmatic` TR-6.3: 废弃 Tag2 从 Tag2 表删除
  - `programmatic` TR-6.4: 合并后主 Tag2 使用次数 = 各标签使用次数之和

## [x] Task 7: 实现变更汇总与缓存失效
- **Priority**: medium
- **Depends On**: [Task 6]
- **Description**:
  - 统计自动变更数量：合并 Tag3 数、新增 Tag2 数、合并 Tag2 数
  - 合并人工待处理清单：AI 返回 manual_review + 大数据过滤 manual_tag_list + 各步骤校验失败移入的项
  - 调用 `invalidateTagCache()` 清空周打标标签缓存
  - 返回统一格式的执行结果
- **Acceptance Criteria Addressed**: [AC-9, AC-10]
- **Test Requirements**:
  - `programmatic` TR-7.1: 变更统计数字与实际执行的操作数一致
  - `programmatic` TR-7.2: 人工清单包含 AI 模糊项 + 低频过滤项 + 校验失败项，无重复
  - `programmatic` TR-7.3: 执行完成后调用了 invalidateTagCache

## [x] Task 8: 对接月度任务 API，替换旧实现
- **Priority**: medium
- **Depends On**: [Task 7]
- **Description**:
  - 修改 `src/app/api/cron/monthly/route.ts` 中的标签自进化步骤
  - 导入新的 `TagEvolutionV2` 类（或函数），替换原来的 `TagEvolution`
  - 调整 EvolutionReport 类型适配，保持月度任务接口返回格式兼容
  - 更新会议文档生成中的标签自进化报告部分，适配新的数据结构
  - 保留旧 `tag-evolution.ts` 文件不动，仅不再被调用
- **Acceptance Criteria Addressed**: [AC-11]
- **Test Requirements**:
  - `programmatic` TR-8.1: 月度任务 API 调用新的自进化模块，不引用旧 TagEvolution 类
  - `programmatic` TR-8.2: 周打标 API 和逻辑完全未改动
  - `programmatic` TR-8.3: 月度任务返回结构兼容，不影响下游 Top 问题生成等环节
  - `human-judgement` TR-8.4: 会议文档中的自进化报告展示正确

## [x] Task 9: 集成测试与端到端验证
- **Priority**: high
- **Depends On**: [Task 8]
- **Description**:
  - 构造 mock 数据测试全流程（小数据模式 + 大数据模式）
  - 验证各节点输出与文档验收表一致
  - 验证错误场景：AI 调用失败、格式错误、校验失败等
  - 验证周打标功能不受影响
- **Acceptance Criteria Addressed**: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12]
- **Test Requirements**:
  - `programmatic` TR-9.1: 小数据模式全流程跑通，13 个节点全部完成
  - `programmatic` TR-9.2: 大数据模式全流程跑通，低频标签正确进入人工清单
  - `programmatic` TR-9.3: AI 返回格式错误时正确终止，不修改任何表格
  - `programmatic` TR-9.4: 周打标功能在自进化前后均正常工作
  - `human-judgement` TR-9.5: 代码结构清晰，注释完整，符合项目规范
