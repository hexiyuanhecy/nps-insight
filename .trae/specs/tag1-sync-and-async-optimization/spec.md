# 配置中心完整验收 Spec（基于 docs/test-config.md）

## Why
根据 `docs/test-config.md` 文档，需要修复配置中心以下核心缺陷：
1. 表格新建/绑定时同步阻塞页面
2. Tag1 修改后不同步更新多维表格
3. 缺少手动重打标历史数据功能
4. 缺少 5 分钟延时自动重打标
5. 置信度阈值可能硬编码

## What Changes

### 1. 表格新建/绑定异步并行
- `createBitableAction`：表格创建后，启动并行异步任务
- `linkBitableAction`：绑定后，启动并行异步任务
- 异步任务：检查表结构完整性 + 添加管理员协作者
- 主线程不等待，页面立即返回成功

### 2. Tag1 双向同步存储
- 保存 Tag1 配置时，同时更新 KV/.env 和多维表格 Tag1 表
- 支持新增/修改/删除 Tag1

### 3. 手动重打标历史数据
- 实现【立即重新打标历史数据】按钮和 API

### 4. 5 分钟延时自动重打标
- Tag1 配置变更后，自动创建 5 分钟延时任务

### 5. 置信度阈值动态读取
- 确保从配置动态读取，无硬编码

## Impact
- Affected specs: 配置中心、Tag1 联动、定时任务
- Affected code:
  - `src/app/api/config/route.ts`
  - `src/components/admin/config-center/TaggingTab.tsx`
  - `src/app/api/cron/sync/route.ts`
  - `src/lib/feishu/bitable-setup.ts`

## ADDED Requirements

### Requirement: 新建表格双异步并行
系统 SHALL 在创建表格后启动并行异步任务组。

#### Scenario: 创建新表格
- **WHEN** 用户点击创建新表格
- **THEN** 创建 6 张工作表
- **AND** 写入 DEFAULT_TAG1 到 Tag1 表
- **AND** 启动并行异步任务（检查表结构 + 添加管理员）
- **AND** 页面立即返回成功，不等待异步任务

### Requirement: 绑定表格双异步并行
系统 SHALL 在绑定表格后启动并行异步任务组。

#### Scenario: 绑定已有表格
- **WHEN** 用户输入表格 ID 执行绑定
- **THEN** 校验表格权限，补齐缺失字段
- **AND** Tag1 表为空时自动写入 DEFAULT_TAG1
- **AND** 启动并行异步任务（检查表结构 + 添加管理员）
- **AND** 页面立即返回成功，不等待异步任务

### Requirement: Tag1 双向同步存储
系统 SHALL 保存 Tag1 配置时同步更新两处存储。

#### Scenario: 保存 Tag1 配置
- **WHEN** 用户编辑/新增/删除 Tag1 并保存
- **THEN** 更新后端 KV/.env 配置
- **AND** 更新多维表格 Tag1 表对应行
- **AND** 刷新全局标签内存缓存

### Requirement: 手动重打标历史数据
系统 SHALL 提供一键全量历史反馈重打标功能。

#### Scenario: 手动触发重打标
- **WHEN** 用户点击【立即重新打标历史数据】
- **THEN** 启动全量历史反馈重打标任务
- **AND** 同步更新反馈列表 Tag1 关联

### Requirement: 5 分钟延时自动重打标
系统 SHALL 在 Tag1 配置变更后自动创建延时重打标任务。

#### Scenario: 延时重打标
- **WHEN** 用户修改 Tag1 后未手动重打标
- **THEN** 创建 5 分钟延时任务
- **AND** 到期后执行全量历史反馈重打标

### Requirement: 置信度阈值动态读取
系统 SHALL 从配置动态读取置信度阈值。

#### Scenario: 动态读取阈值
- **WHEN** 周打标执行时
- **THEN** 从 KV 读取配置的置信度阈值
- **AND** 无配置时使用默认值 0.8
- **AND** 无硬编码阈值
