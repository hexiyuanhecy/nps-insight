# 多维表格结构 1:1 复刻重构 - Product Requirement Document

## Overview
- **Summary**: 基于 `nps_bitable_full_meta.json` 元数据，重构系统的新建/绑定多维表格逻辑，确保创建出的表格结构与目标表格 100% 一致（6张表、字段顺序、类型、选项完全匹配，Lookup字段用文本占位）。
- **Purpose**: 当前新建表格功能存在字段类型错误（type 7/16/18混淆）、表数量不足（4张vs6张）、缺少公式字段、缺少Lookup占位、并行创建导致顺序错乱等问题，需要按官方技术手册全面重构。
- **Target Users**: 系统管理员、首次使用配置中心的用户

## Goals
- 新建多维表格时，表数量、表名、表顺序与源表完全一致（6张表）
- 每张表的字段数量、字段顺序、字段类型与源表完全一致
- 单选/多选字段的选项 id、name、color 与源表完全一致
- 公式字段正确创建，表ID和字段ID精确替换
- Lookup 字段用文本字段占位，保证列顺序一致
- 所有操作串行执行，禁止并行
- 绑定表格时验证表结构完整性

## Non-Goals (Out of Scope)
- 手动补配 Lookup 字段的自动化操作（仅生成操作清单）
- 仪表盘（Dashboard）的创建
- 数据迁移（仅建表结构，不导入数据）
- 视图配置的精确复刻

## Background & Context
- 当前代码位于 `src/lib/feishu/bitable-setup.ts`
- 源表 app_token: `MIPVbgPfUaq2rwsPX2icCoXwnag`
- 元数据文件: `docs/nps_bitable_full_meta.json`
- 技术手册: `docs/create-table.md`
- 6张表的顺序：租户信息 → top 问题表 → 反馈列表 → Tag3表 → Tag1表 → Tag2表

## Functional Requirements
- **FR-1**: 新建多维表格时，按源表顺序串行创建 6 张数据表
- **FR-2**: 每张表的主键字段通过修改默认主键实现，禁止新建主键
- **FR-3**: 所有基础字段（type 1/2/3/4/5/7）按顺序串行创建，选项完整保留 id
- **FR-4**: Lookup 字段（type 19）用同名字段（type 1 文本）占位，保证列顺序
- **FR-5**: 公式字段（type 20）在所有基础字段创建完成后串行创建，精确替换表ID和字段ID
- **FR-6**: 关联字段（type 18/21）替换目标表ID后创建（本次元数据无关联字段，预留能力）
- **FR-7**: 每次 API 请求后强制等待 300ms 限流
- **FR-8**: 失败时自动回滚（删除已创建的表格）
- **FR-9**: 绑定表格时验证表结构完整性（表数量、表名匹配）
- **FR-10**: 生成 Lookup 字段手动补配操作清单

## Non-Functional Requirements
- **NFR-1**: 新建表格整个过程不超过 3 分钟
- **NFR-2**: 错误信息清晰，包含失败步骤和具体原因
- **NFR-3**: 代码结构清晰，便于后续维护

## Constraints
- **技术**: Next.js 14 + TypeScript + 飞书 OpenAPI
- **限制**: 飞书 API 不支持创建 type=19 Lookup 字段
- **限制**: 飞书 API 建表时默认生成一个主键字段，只能修改不能新建
- **依赖**: `nps_bitable_full_meta.json` 元数据文件作为结构模板
- **依赖**: 飞书应用需具备 bitable 读写权限

## Assumptions
- 元数据文件 `nps_bitable_full_meta.json` 结构正确且完整
- 飞书应用已正确配置权限
- 用户有足够的飞书多维表格创建权限

## Acceptance Criteria

### AC-1: 表结构一致性
- **Given**: 用户点击"新建表格"并确认
- **When**: 新建完成后打开新表格
- **Then**: 
  - 共有 6 张数据表
  - 表名和顺序与源表完全一致：租户信息、top 问题表、反馈列表、Tag3表、Tag1表、Tag2表
- **Verification**: `programmatic`

### AC-2: 字段数量与顺序一致性
- **Given**: 新建表格成功
- **When**: 逐表检查字段
- **Then**: 每张表的字段数量和从左到右的顺序与源表完全一致（含 Lookup 占位字段）
- **Verification**: `programmatic`

### AC-3: 基础字段类型正确
- **Given**: 新建表格成功
- **When**: 检查所有 type 1/2/3/4/5/7 字段
- **Then**: 字段类型与源表完全匹配
- **Verification**: `programmatic`

### AC-4: 单选/多选选项完整
- **Given**: 新建表格成功
- **When**: 检查所有单选/多选字段的选项
- **Then**: 选项的 id、name、color 与源表完全一致
- **Verification**: `programmatic`

### AC-5: 公式字段创建成功
- **Given**: 新建表格成功
- **When**: 检查公式字段
- **Then**: 公式字段创建成功，无 #计算错误 标识，公式内无残留旧表ID/字段ID
- **Verification**: `programmatic`

### AC-6: Lookup 占位字段存在
- **Given**: 新建表格成功
- **When**: 检查 type=19 的字段位置
- **Then**: 对应位置有同名字段（文本类型）占位，列顺序正确
- **Verification**: `programmatic`

### AC-7: 串行执行保证
- **Given**: 新建表格过程中
- **When**: 监控 API 请求
- **Then**: 所有建表、建字段操作串行执行，前一个完成后才发下一个
- **Verification**: `programmatic`

### AC-8: 失败回滚
- **Given**: 新建表格过程中某一步失败
- **When**: 发生错误
- **Then**: 自动删除已创建的多维表格，不留垃圾数据
- **Verification**: `programmatic`

### AC-9: 绑定表格结构验证
- **Given**: 用户输入已有表格的 app_token 并点击绑定
- **When**: 系统验证表结构
- **Then**: 检查表数量和表名是否匹配，不匹配时给出警告
- **Verification**: `programmatic`

### AC-10: 限流保护
- **Given**: 新建表格过程中
- **When**: 每次 API 请求后
- **Then**: 强制等待 300ms 再发下一个请求
- **Verification**: `programmatic`

## Open Questions
- [ ] 绑定表格时，如果表结构不完全匹配，是阻止绑定还是仅给出警告？
- [ ] Lookup 手动补配清单的输出位置和格式？
- [ ] 是否需要在前端展示建表进度？
