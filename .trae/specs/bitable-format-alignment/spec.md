# 多维表格格式对齐 - Product Requirement Document

## Overview
- **Summary**: 将 NPS Insight 系统的多维表格结构与现有生产环境多维表格（App Token: MIPVbgPfUaq2rwsPX2icCoXwnag）严格对齐，确保系统写入/读取的字段格式与现有表格完全一致。
- **Purpose**: 解决当前代码中多维表格字段定义与实际生产表格不一致的问题，避免因字段名、字段类型、选项配置不匹配导致的数据写入失败、读取异常等问题。
- **Target Users**: 开发团队、运维团队

## Goals
- 100% 对齐现有多维表格的 6 张表结构（字段名、字段类型、选项配置）
- 确保系统所有写入操作的字段与现有表格完全匹配
- 确保系统所有读取操作的字段名与现有表格完全匹配
- 自动建表功能生成的表格结构与现有表格一致

## Non-Goals (Out of Scope)
- 不改变业务逻辑（打标逻辑、分析逻辑等）
- 不新增任何功能
- 不修改数据迁移逻辑
- 不改变前端 UI 交互
- 不涉及仪表盘（Dashboard）结构，仅对齐数据表

## Background & Context

现有生产多维表格（MIPVbgPfUaq2rwsPX2icCoXwnag）包含 6 张数据表，结构与当前代码中的定义存在重大差异：

1. **标签表结构调整为 4 字段**：Tag1/Tag2/Tag3 表各 4 个字段（tagId、tagName、desc、count），其中 count 为自动计算字段
2. **Top问题表使用自动汇总字段**：大部分统计字段为 AutoNumber（查找引用/汇总）类型，由飞书自动计算
3. **反馈表部分字段类型不同**：租户名称为查找引用、反馈平台为单选、需查日志/待审核为多行文本
4. **租户表调整为 6 字段**：增加"是否企业版"，移除日志平台、日志端点、创建时间
5. **字段命名混合**：标签表使用英文字段名（tagId、tagName、desc、count），其他表使用中文字段名

## Functional Requirements

### FR-1: 反馈表结构对齐
- 字段名、类型、选项与现有"反馈列表"表完全一致（共 18 个字段）
- 写入时只写入非自动计算字段（租户名称为自动计算，不写入）
- 读取时正确解析所有字段类型

### FR-2: 标签表结构对齐（Tag1/Tag2/Tag3）
- 3 张标签表各 4 个字段，与现有表格完全一致
- 字段名：tagId（Text）、tagName（SingleSelect）、desc（Text）、count（AutoNumber，自动计算）
- tagName 字段为 SingleSelect 类型，选项从反馈表对应字段同步
- count 字段为自动计算，系统不写入
- 移除代码中不存在的字段（大租户使用次数、大租户占比、status、createdBy、createdAt、所属一级标签、所属二级标签等）

### FR-3: Top问题表结构对齐
- 字段名、类型与现有"top 问题表"完全一致（共 15 个字段）
- 自动计算字段不写入：所属模块、tag3、总反馈数、A4反馈数、A5反馈数、A6反馈数、大租户反馈数、大租户占比
- 可写字段：index、tag2、人工排序、负责人、解决方案、状态、迭代周期
- index 字段为序号（123456...），不需要系统主动维护，可为空，但必须作为索引列存在

### FR-4: 租户表结构对齐
- 字段名、类型与现有"租户信息"表完全一致（共 6 个字段）
- 字段列表：租户ID、租户名称、规模、是否企业版、联系人、联系邮箱
- 增加"是否企业版"字段（Textarea 类型）
- 移除不存在的字段：日志平台、日志端点、日志凭证、创建时间

### FR-5: 自动建表功能对齐
- 配置中心"新建"多维表格时，生成的表结构与现有表格完全一致
- 选项配置、字段顺序完全匹配
- 自动计算字段（AutoNumber/Formula）尽量通过 API 创建，如不支持则跳过并记录

### FR-6: 常量定义更新
- 更新 `src/lib/feishu/constants.ts` 中的所有字段定义
- 所有字段名、字段类型严格对齐现有表格

## Non-Functional Requirements
- **NFR-1**: 所有写入操作不得报错，字段名必须 100% 匹配
- **NFR-2**: 构建通过，TypeScript 类型检查通过
- **NFR-3**: 不影响现有业务功能的正常运行

## Constraints
- **Technical**: Next.js 14 + TypeScript + TailwindCSS
- **Business**: 必须严格以现有多维表格（MIPVbgPfUaq2rwsPX2icCoXwnag）为准
- **Dependencies**: 飞书多维表格 OpenAPI

## Assumptions
- 现有多维表格的结构是正确的、权威的
- 自动计算字段（AutoNumber/Formula）由飞书自动维护，系统无需写入
- 标签表中的 tagName 选项与反馈表中对应字段的选项保持一致
- 标签表的 count 字段由飞书自动统计使用次数，系统无需手动更新
- 仪表盘（Dashboard）为视图层配置，不需要代码对齐

## Acceptance Criteria

### AC-1: 反馈表字段完全匹配
- **Given**: 现有生产多维表格的"反馈列表"表结构
- **When**: 对比代码中反馈表字段定义与实际表格
- **Then**: 所有字段的名称、类型、选项配置 100% 一致
- **Verification**: `programmatic`
- **Notes**: 共 18 个字段，需逐一核对

### AC-2: Tag1表字段完全匹配
- **Given**: 现有生产多维表格的"Tag1表"结构
- **When**: 对比代码中 Tag1 表字段定义与实际表格
- **Then**: 所有字段的名称、类型、选项配置 100% 一致
- **Verification**: `programmatic`
- **Notes**: 共 4 个字段：tagId、tagName（单选）、desc、count（自动计算）

### AC-3: Tag2表字段完全匹配
- **Given**: 现有生产多维表格的"Tag2表"结构
- **When**: 对比代码中 Tag2 表字段定义与实际表格
- **Then**: 所有字段的名称、类型、选项配置 100% 一致
- **Verification**: `programmatic`
- **Notes**: 共 4 个字段：tagId、tagName（单选）、desc、count（自动计算）

### AC-4: Tag3表字段完全匹配
- **Given**: 现有生产多维表格的"Tag3表"结构
- **When**: 对比代码中 Tag3 表字段定义与实际表格
- **Then**: 所有字段的名称、类型、选项配置 100% 一致
- **Verification**: `programmatic`
- **Notes**: 共 4 个字段：tagId、tagName（单选）、desc、count（自动计算）

### AC-5: Top问题表字段完全匹配
- **Given**: 现有生产多维表格的"top 问题表"结构
- **When**: 对比代码中 Top 问题表字段定义与实际表格
- **Then**: 所有字段的名称、类型 100% 一致，自动计算字段不写入
- **Verification**: `programmatic`
- **Notes**: 共 15 个字段，其中 8 个为自动计算字段；index 字段为序号，不主动维护

### AC-6: 租户表字段完全匹配
- **Given**: 现有生产多维表格的"租户信息"表结构
- **When**: 对比代码中租户表字段定义与实际表格
- **Then**: 所有字段的名称、类型、选项配置 100% 一致
- **Verification**: `programmatic`
- **Notes**: 共 6 个字段，包含"是否企业版"，不包含日志平台/日志端点/创建时间

### AC-7: 写入操作不报错
- **Given**: 对齐后的字段定义
- **When**: 执行所有写入操作（创建反馈、更新标签、写入Top问题等）
- **Then**: 所有写入操作成功，无字段不存在或类型不匹配错误
- **Verification**: `programmatic`

### AC-8: 自动建表结构一致
- **Given**: 对齐后的建表逻辑
- **When**: 使用配置中心"新建"多维表格
- **Then**: 新创建的表格结构与现有表格（MIPVbgPfUaq2rwsPX2icCoXwnag）完全一致
- **Verification**: `programmatic`

### AC-9: 构建通过
- **Given**: 所有代码修改完成
- **When**: 执行 `pnpm tsc --noEmit && pnpm lint`
- **Then**: TypeScript 类型检查通过，Lint 通过
- **Verification**: `programmatic`

## Open Questions
- [x] ~~Top问题表中的 `index` 字段的业务含义是什么？是否需要系统维护？~~ → 序号，不需要维护，可为空，但必须为索引列
- [x] ~~Tag3表中同时存在"标签名字"（单选）和"标签名称"（文本）两个字段，业务上以哪个为准？~~ → 以单选（tagName）为主，文本（desc）为描述
- [x] ~~反馈表中"需查日志"和"待审核"是多行文本类型，而非单选的"是/否"，业务逻辑是否需要调整？~~ → 保持现状，以现有表格为准
- [x] ~~反馈表中"反馈平台"是单选类型，选项为"管理后台/请假员工端/打卡小程序"，是否需要支持更多平台？~~ → 不需要，就是单平台
- [x] ~~标签表缺少"使用次数"等统计字段，原有的使用次数统计逻辑如何处理？~~ → 使用次数统计保留，由飞书 count 自动计算字段维护，系统不手动写入
