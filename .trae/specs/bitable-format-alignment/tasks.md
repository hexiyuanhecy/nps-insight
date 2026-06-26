# 多维表格格式对齐 - The Implementation Plan

## [x] Task 1: 更新常量定义 - 反馈表字段
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 更新 `src/lib/feishu/constants.ts` 中的 FEEDBACK_FIELDS 和 FEEDBACK_FIELD_DEFS
  - 字段名严格对齐：反馈ID、租户ID、租户名称、租户规模、用户ID、创建时间、不满意原因、反馈原文、翻译后文本、tag1、tag2、tag3、评分、反馈平台、AI 置信度、需查日志、待审核、打标状态
  - 修正字段类型：租户名称为 AutoNumber（查找引用，不写入）、反馈平台为 SingleSelect、需查日志/待审核为 Textarea
  - 修正选项配置：租户规模（A1-A6）、不满意原因（6项）、tag1（8项）、tag2（28项）、tag3（2项）、反馈平台（3项：管理后台/请假员工端/打卡小程序）、打标状态（2项：未打标/已打标）
  - 移除不存在的字段：USER_NAME（用户名称）、SUMMARY、SUGGESTIONS、PRIORITY、TAG_TIME
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 检查 FEEDBACK_FIELDS 中所有字段名与实际表格完全匹配（18 个）
  - `programmatic` TR-1.2: 检查 FEEDBACK_FIELD_DEFS 中所有字段类型与实际表格一致
  - `programmatic` TR-1.3: 检查所有 SingleSelect/MultiSelect 选项配置与实际表格一致
- **Notes**: tag1/tag2/tag3 字段名均为小写

## [x] Task 2: 更新常量定义 - Tag1/Tag2/Tag3 表字段
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 更新 TAG1_FIELDS / TAG1_FIELD_DEFS：4 个字段（tagId、tagName、desc、count），tagName 为 SingleSelect，count 为 AutoNumber（自动计算，不写入）
  - 更新 TAG2_FIELDS / TAG2_FIELD_DEFS：4 个字段（tagId、tagName、desc、count），tagName 为 SingleSelect，count 为 AutoNumber（自动计算，不写入）
  - 更新 TAG3_FIELDS / TAG3_FIELD_DEFS：4 个字段（tagId、tagName、desc、count），tagName 为 SingleSelect，count 为 AutoNumber（自动计算，不写入）
  - 移除所有不存在的字段：使用次数、总使用次数、大租户使用次数、大租户占比、status、createdBy、createdAt、所属一级标签、所属二级标签、definition、标签名称（中文）、定义说明、标签描述等
  - 标签选项与反馈表对应字段保持一致（tag1 8项、tag2 28项、tag3 2项）
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-2.1: 检查 TAG1_FIELD_DEFS 字段数量为 4，名称/类型匹配
  - `programmatic` TR-2.2: 检查 TAG2_FIELD_DEFS 字段数量为 4，名称/类型匹配
  - `programmatic` TR-2.3: 检查 TAG3_FIELD_DEFS 字段数量为 4，名称/类型匹配
  - `programmatic` TR-2.4: 检查 tagName 选项与反馈表对应字段一致
- **Notes**: 字段名全部为英文：tagId、tagName、desc、count

## [x] Task 3: 更新常量定义 - Top问题表字段
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 更新 TOP_ISSUES_FIELDS 和 TOP_ISSUES_FIELD_DEFS
  - 字段列表（共 15 个）：index、所属模块、tag2、tag3、总反馈数、A4反馈数、A5反馈数、A6反馈数、大租户反馈数、大租户占比、人工排序、负责人、解决方案、状态、迭代周期
  - 标记自动计算字段（不写入）：所属模块、tag3、总反馈数、A4反馈数、A5反馈数、A6反馈数、大租户反馈数、大租户占比
  - 可写字段：index(Text)、tag2(SingleSelect)、人工排序(Number)、负责人(Text)、解决方案(Text)、状态(SingleSelect)、迭代周期(SingleSelect)
  - 状态选项：待讨论、已排期、已上线、验证中
  - 迭代周期选项：Sprint 1、Sprint 2、Sprint 3+、待定
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-3.1: 检查 TOP_ISSUES_FIELD_DEFS 字段数量为 15，名称匹配
  - `programmatic` TR-3.2: 检查可写字段类型正确
  - `programmatic` TR-3.3: 检查状态/迭代周期选项与实际表格一致
- **Notes**: index 字段为序号，不主动维护，但字段必须存在

## [x] Task 4: 更新常量定义 - 租户表字段
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 更新 TENANT_FIELDS 和 TENANT_FIELD_DEFS
  - 字段列表（共 6 个）：租户ID、租户名称、规模、是否企业版、联系人、联系邮箱
  - 增加"是否企业版"字段（Textarea 类型）
  - 移除不存在的字段：日志平台、日志端点、日志凭证、创建时间
  - 规模选项：A1、A2、A3、A4、A5、A6
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-4.1: 检查 TENANT_FIELD_DEFS 字段数量为 6
  - `programmatic` TR-4.2: 检查包含"是否企业版"字段，类型为 Textarea
  - `programmatic` TR-4.3: 检查不包含已移除的字段
- **Notes**: 现有表格没有日志平台、日志端点等字段

## [x] Task 5: 更新存储适配器 - feishu-storage.ts
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**: 
  - 更新 FeishuStorageAdapter 中所有读写操作的字段映射
  - 写入反馈时：只写入非自动计算字段（不写租户名称），移除不存在的字段
  - 写入标签时：只写入 tagId、tagName、desc，不写 count（自动计算）
  - 写入 Top 问题时：只写入可编辑字段（index、tag2、人工排序、负责人、解决方案、状态、迭代周期）
  - 读取数据时：正确解析新的字段名和类型
  - 修复 ensureTagExists 等函数，适配新的标签表结构
  - 全面搜索项目中所有 bitable 写入调用，确保字段名正确
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-5.1: 所有 createRecord/updateRecord 调用的字段名在目标表中存在
  - `programmatic` TR-5.2: 不尝试写入自动计算字段
- **Notes**: 需要全局搜索 FEEDBACK_FIELDS、TAG_FIELDS 等常量的使用位置

## [x] Task 6: 更新分析模块 - top-issues.ts 和 formula-sync.ts
- **Priority**: high
- **Depends On**: Task 3
- **Description**: 
  - 更新 top-issues.ts：Top 问题统计改为只写入可编辑字段，统计数据由飞书自动计算
  - 更新 formula-sync.ts：移除公式同步逻辑，因为字段为飞书自动计算
  - 确保分析结果写入的字段与现有表格匹配（tag2、状态等）
- **Acceptance Criteria Addressed**: AC-5, AC-7
- **Test Requirements**:
  - `programmatic` TR-6.1: Top 问题分析写入操作不包含自动计算字段
  - `programmatic` TR-6.2: 写入的 tag2、状态等字段值与选项匹配
- **Notes**: formula-sync 可能需要大幅简化或移除

## [x] Task 7: 更新 AI 打标模块 - tagger.ts 和 tag-evolution.ts
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**: 
  - 更新 tagger.ts 中标签写入逻辑，适配新的标签表结构
  - 更新反馈表标签字段写入：tag1、tag2、tag3（小写字段名）
  - 更新标签创建/更新逻辑：只写入 tagId、tagName、desc
  - 移除使用次数手动更新逻辑（count 由飞书自动计算）
  - 检查 tag-evolution.ts，确保标签自进化逻辑适配新结构
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-7
- **Test Requirements**:
  - `programmatic` TR-7.1: AI 打标后写入反馈表的字段名正确（tag1/tag2/tag3）
  - `programmatic` TR-7.2: 标签表创建/更新操作字段正确（tagId、tagName、desc）
- **Notes**: 标签自进化可能需要调整，因为标签结构变了

## [x] Task 8: 更新自动建表功能 - bitable-setup.ts
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**: 
  - 更新 bitable-setup.ts 中的建表逻辑
  - 确保新建的 6 张表结构与现有表格完全一致
  - 字段顺序、类型、选项配置严格对齐
  - 自动计算字段（AutoNumber/Formula）尽量通过 API 创建，如不支持则跳过
  - 更新建表后初始化逻辑（Tag1 8 个默认标签等）
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `programmatic` TR-8.1: 新建的反馈表字段数量为 18，名称/类型匹配
  - `programmatic` TR-8.2: 新建的 Tag1/Tag2/Tag3 表各 4 个字段
  - `programmatic` TR-8.3: 新建的 Top 问题表字段数量为 15
  - `programmatic` TR-8.4: 新建的租户表字段数量为 6
- **Notes**: AutoNumber 类型字段可能无法通过 OpenAPI 创建，需要确认

## [x] Task 9: 更新类型定义 - types/
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**: 
  - 更新 BitableField 类型定义
  - 更新 FeedbackRecord、TagRecord、TenantRecord、TopIssueRecord 等类型
  - 确保 TypeScript 类型与实际表格结构一致
  - 移除已废弃字段的类型引用
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `programmatic` TR-9.1: pnpm tsc --noEmit 无类型错误
- **Notes**: 先改常量再改类型，保持一致

## [x] Task 10: 构建验证与集成测试
- **Priority**: high
- **Depends On**: Task 5, Task 6, Task 7, Task 8, Task 9
- **Description**: 
  - 运行 pnpm tsc --noEmit 检查类型
  - 运行 pnpm lint 检查代码规范
  - 运行集成测试验证写入操作
  - 修复所有构建错误和运行时错误
- **Acceptance Criteria Addressed**: AC-7, AC-9
- **Test Requirements**:
  - `programmatic` TR-10.1: pnpm tsc --noEmit 通过
  - `programmatic` TR-10.2: pnpm lint 通过
  - `programmatic` TR-10.3: 关键写入操作测试通过
- **Notes**: 构建不通过视为任务未完成
