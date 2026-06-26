# 用户资源隔离与云文件夹自动初始化 - Product Requirement Document

## Overview
- **Summary**: 基于飞书多维表格的 NPS 自动周报/月报生成系统，实现用户首次登录自动初始化整套云资源（根文件夹、周报归档子文件夹、月报汇总子文件夹、多维表格、管理员权限），多用户完全资源隔离，每个用户拥有独立的云盘结构和数据。
- **Purpose**: 解决多用户资源混用、表格不存在报错、文件散落无归档等问题，实现开箱即用的用户专属资源初始化，以及周报/月报的自动归档管理。
- **Target Users**: NPS Insight 系统所有使用用户（每个用户独立一套资源）

## Goals
- 用户首次登录自动完成整套云资源初始化（5步全自动化）
- 多用户完全资源隔离，每人独立文件夹、独立多维表格
- 自动授予登录用户文件夹管理员权限，可管理所有子资源
- 4个核心 Token（root/report/month/bitable）持久化存储
- 周报自动归档到【周报归档】子文件夹
- 月报自动归档到【月报汇总】子文件夹
- 本地开发环境使用 .env.local 静态复用
- 生产/测试环境使用数据库按用户隔离存储
- Mock 数据严格遵循平台绑定、租户一致性规则

## Non-Goals (Out of Scope)
- 不做已有资源的迁移（只对新用户新资源生效）
- 不做文件夹内文件的 UI 展示和管理
- 不做用户角色/权限系统（默认每个用户都是自己资源的管理员）
- 不做资源删除/重置功能（避免误操作）
- 不做多级子文件夹嵌套结构（固定 1 根 + 2 子）

## Background & Context
- 历史问题：TABLE_NAMES.FEEDBACK 不存在报错，根源是缺少 bitableBaseToken
- 现状：文件散落在云空间根目录，无归档结构，无用户隔离
- 架构调整：从单租户全局配置转向多用户资源隔离
- 技术栈：Next.js 14 + TypeScript + 飞书开放平台 API

## 云盘目录结构（标准）
```
用户专属根文件夹（NPS业务资源_用户名）
  ┣━ 多维表格【NPS Insight 反馈中心】（所有业务子表）
  ┣━ 子文件夹【周报归档】（所有自动生成周报存放处）
  ┗━ 子文件夹【月报汇总】（所有自动生成月报存放处）
```

### 文件夹用途定义
- **根文件夹**：用户总资源容器，用户拥有管理员权限
- **周报归档文件夹**：所有周期自动生成的 .docx 周报统一存放
- **月报汇总文件夹**：所有月度自动生成的 .docx 月报统一存放
- **多维表格**：存储反馈数据、租户数据、问题标签数据（业务核心）

## 首次登录自动初始化流程（核心）
用户登录系统时，后端判断：当前用户是否已初始化资源
未初始化 → 全自动执行以下 5 步（只执行一次）

**步骤1：创建用户专属【根云文件夹】**
- 创建位置：飞书云盘根目录
- 命名规则：`NPS业务资源_用户名`
- 产出：`rootFolderToken`

**步骤2：根目录下创建两个业务子文件夹**
- 周报归档文件夹 → `reportFolderToken`
- 月报汇总文件夹 → `monthFolderToken`

**步骤3：根目录下创建业务多维表格**
- 表格名称：`NPS Insight 反馈中心`
- 产出：`bitableBaseToken`（关键！解决表不存在报错）
- 内部固定子表名（代码写死，无需动态创建）：
  - `feedback`（反馈列表）
  - `tenants`（租户信息）
  - `top_issues`（问题统计）

**步骤4：自动授权当前登录用户为【文件夹管理员】**
- 对根文件夹赋权：`perm = admin`
- 授权对象：当前用户 open_id
- 权限效果：用户拥有该文件夹下所有表格、文档、子文件夹的修改/管理权限
- 子资源自动继承权限，无需逐个授权

**步骤5：保存全部 Token 资源绑定用户**
四个核心 Token 必须永久存储，后续所有生成文件、读取表格全部依赖它们。

## 4 个核心 Token（必须持久化）
每套用户资源固定 4 个字段：
1. `rootFolderToken` — 用户根文件夹 ID
2. `reportFolderToken` — 周报归档文件夹 ID
3. `monthFolderToken` — 月报汇总文件夹 ID
4. `bitableBaseToken` — 多维表格 Base 总 Token

## 两套环境存储策略（严格区分）

### 本地开发环境
所有 Token 写入 `.env.local` 静态复用，不读数据库
```
ROOT_FOLDER_TOKEN=xxx
REPORT_FOLDER_TOKEN=xxx
MONTH_FOLDER_TOKEN=xxx
BITABLE_BASE_APP_TOKEN=xxx
```
适用：单用户本地调试、快速迭代、不需要多用户隔离

### 测试/生产环境
全部 Token 存入数据库，每个用户一条独立资源记录
字段：`userOpenId`、`rootFolderToken`、`reportFolderToken`、`monthFolderToken`、`bitableBaseToken`
优势：多用户完全隔离，每个人拥有自己的表格、文档、文件夹

## 周报/月报生成归档规则

### 周报生成规则
- 数据来源：当前用户 `bitableBaseToken` + 子表 `feedback`
- 文档存放目录：固定 `reportFolderToken`
- 自动计算周数、NPS、推荐/被动/贬损、Top5 问题
- 自动飞书消息推送

### 月报生成规则
- 数据来源：当前用户多维表格（bitableBaseToken）
- 存放目录：固定 `monthFolderToken`

## Mock 数据规则（最终版）

### 反馈 Mock 规则
- 平台固定枚举：打卡小程序、休假小程序、休假员工端、假勤管理后台、考勤机
- 反馈文案与平台强绑定（每个平台专属文案池，不串场景）
- 不满意原因多选：系统卡顿、界面不美观、功能缺失、打开速度慢、其他、缺少功能
- 评分 1-5 随机，保留 1 位小数

### 租户 Mock 规则（强一致性）
- 根据反馈数据中已存在的租户 ID 生成租户信息
- 同一个租户 ID：租户名称、租户规模全局绝对一致
- 租户规模枚举：A1 - A6

## Functional Requirements
- **FR-1**: 用户资源状态检测 - 登录时判断当前用户是否已初始化云资源
- **FR-2**: 根文件夹自动创建 - 首次登录自动创建用户专属根文件夹
- **FR-3**: 子文件夹自动创建 - 在根文件夹下创建周报归档、月报汇总两个子文件夹
- **FR-4**: 多维表格自动创建 - 在根文件夹下创建业务多维表格（含固定子表结构）
- **FR-5**: 管理员权限自动授予 - 自动将当前用户设为根文件夹管理员
- **FR-6**: Token 持久化存储 - 4 个核心 Token 按环境策略存储（本地 env / 生产数据库）
- **FR-7**: 周报归档 - 生成周报时存入 reportFolderToken 对应文件夹
- **FR-8**: 月报归档 - 生成月报时存入 monthFolderToken 对应文件夹
- **FR-9**: 多用户资源隔离 - 生产环境每个用户独立一套资源，互不干扰
- **FR-10**: 幂等性保证 - 初始化流程只执行一次，重复触发不重复创建
- **FR-11**: Mock 数据平台绑定 - 反馈文案与平台强绑定，不串场景
- **FR-12**: Mock 租户一致性 - 同一租户 ID 的名称和规模全局一致

## Non-Functional Requirements
- **NFR-1**: 幂等性 - 初始化操作可重复调用，不会产生重复资源
- **NFR-2**: 错误容错 - 某一步创建失败时，已创建的资源保留，下次从失败处继续
- **NFR-3**: 向后兼容 - 现有单用户配置（.env）继续可用
- **NFR-4**: 类型安全 - 全链路 TypeScript 类型覆盖，无 any

## Constraints
- **Technical**: Next.js 14 App Router + TypeScript + 飞书开放平台
- **Business**: 仅支持飞书生态，不支持其他办公平台
- **Dependencies**: 飞书 Drive API、Bitable API、Permission API

## Assumptions
- 飞书应用具有 `space:folder:create`、`docs:permission.member:create` 等必要权限
- 用户身份通过 open_id 唯一标识
- 子资源自动继承父文件夹权限（飞书机制）
- 多维表格创建 API 支持指定 folder_token 创建到目标文件夹

## Acceptance Criteria

### AC-1: 首次登录自动完成全部初始化
- **Given**: 用户首次登录，无任何资源记录
- **When**: 用户登录系统（或首次访问需要资源的页面）
- **Then**: 自动完成 5 步初始化：根文件夹、2个子文件夹、多维表格、管理员授权、Token 存储
- **Verification**: `programmatic`

### AC-2: 重复登录不重复创建（幂等）
- **Given**: 用户已完成资源初始化
- **When**: 用户再次登录
- **Then**: 直接读取已有 Token，不创建任何新资源
- **Verification**: `programmatic`

### AC-3: 4个核心Token正确存储
- **Given**: 初始化完成
- **When**: 读取用户资源配置
- **Then**: rootFolderToken、reportFolderToken、monthFolderToken、bitableBaseToken 四个字段均有有效值
- **Verification**: `programmatic`

### AC-4: 云盘目录结构正确
- **Given**: 初始化完成
- **When**: 查看飞书云盘
- **Then**: 根文件夹下包含 1 个多维表格 + 2 个子文件夹，命名符合规范
- **Verification**: `programmatic`

### AC-5: 用户拥有文件夹管理员权限
- **Given**: 初始化完成
- **When**: 检查根文件夹权限列表
- **Then**: 当前用户在权限列表中，权限级别为 admin/full_access
- **Verification**: `programmatic`

### AC-6: 周报自动归档到周报文件夹
- **Given**: 已完成资源初始化
- **When**: 执行周打标流程生成周报
- **Then**: 周报文档创建在 reportFolderToken 对应文件夹内
- **Verification**: `programmatic`

### AC-7: 月报自动归档到月报文件夹
- **Given**: 已完成资源初始化
- **When**: 执行月分析流程生成月报
- **Then**: 月报文档创建在 monthFolderToken 对应文件夹内
- **Verification**: `programmatic`

### AC-8: 本地开发环境使用 ENV 配置
- **Given**: .env.local 中配置了 4 个 Token 环境变量
- **When**: 本地开发启动
- **Then**: 系统直接使用环境变量中的 Token，不触发自动初始化
- **Verification**: `programmatic`

### AC-9: 生产环境多用户隔离
- **Given**: 生产环境，两个不同用户
- **When**: 两个用户分别完成初始化
- **Then**: 各自拥有独立的文件夹和多维表格，资源互不干扰
- **Verification**: `programmatic`

### AC-10: Mock数据平台绑定正确
- **Given**: 生成 100 条 Mock 反馈数据
- **When**: 检查每条数据的平台和反馈文案
- **Then**: 文案与平台对应，不出现跨平台串场景
- **Verification**: `programmatic`

### AC-11: Mock租户一致性
- **Given**: 生成 Mock 数据
- **When**: 查找同一租户 ID 的多条记录
- **Then**: 租户名称、租户规模完全一致
- **Verification**: `programmatic`

### AC-12: 多维表格子表结构正确
- **Given**: 自动创建的多维表格
- **When**: 列出所有子表
- **Then**: 包含 feedback、tenants、top_issues 三个子表，名称完全匹配
- **Verification**: `programmatic`

## Open Questions
- [ ] 生产环境的用户资源存储用什么数据库？（KV 还是独立数据库表）
- [ ] 用户登录身份如何获取？（飞书扫码登录还是其他方式）
- [ ] 初始化失败后的重试/恢复机制需要多完善？
- [ ] 多维表格创建后是否需要自动建字段？还是依赖模板/副本？
- [ ] 用户名称从哪里获取？用于文件夹命名 `NPS业务资源_用户名`
