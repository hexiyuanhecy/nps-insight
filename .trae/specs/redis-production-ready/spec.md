# Redis 存储生产化规格

## Why
项目已部署上线，当前使用内存缓存作为 KV 存储的降级方案。内存缓存在 Serverless 环境中无法持久化数据，每次函数实例重启都会丢失数据。需要配置真正的 Redis 实例（Vercel KV / Upstash）实现配置数据的持久化存储。

## What Changes
- 安装 `@vercel/kv` SDK
- 在 Vercel 项目中创建 KV 存储实例
- 配置 KV_REST_API_URL 和 KV_REST_API_TOKEN 环境变量
- 更新存储层代码，移除强制降级逻辑
- 保留内存缓存作为 Redis 不可用时的紧急 fallback
- 移除 `__SET__` 占位符逻辑，改用真正的密钥检测机制

## Impact
- 受影响的能力：配置持久化、用户映射存储、定时任务配置读取
- 受影响代码：
  - `src/lib/storage/kv-storage.ts` - 核心存储适配器
  - `src/app/api/config/route.ts` - 配置路由
  - `.env.example` - 环境变量示例
  - `vercel.json` - Vercel 配置

## ADDED Requirements

### Requirement: Vercel KV 生产存储
系统 SHALL 使用 Vercel KV（Upstash Redis）作为配置数据的持久化存储。

#### Scenario: 正常生产环境
- **WHEN** 应用在 Vercel 生产环境运行
- **AND** KV 环境变量已配置
- **THEN** 所有配置读写操作使用 Vercel KV
- **AND** 数据跨函数实例持久化

#### Scenario: 开发环境
- **WHEN** 应用在本地开发环境运行
- **AND** KV 环境变量未配置
- **THEN** 使用本地内存缓存作为 fallback
- **AND** 控制台输出降级警告日志

#### Scenario: Redis 连接失败
- **WHEN** Redis 连接出现网络错误
- **THEN** 使用内存缓存作为 fallback
- **AND** 记录错误日志
- **AND** 返回操作成功（数据写入内存）

### Requirement: 环境变量配置
系统 SHALL 支持通过环境变量配置 Vercel KV 连接信息。

#### Scenario: 生产部署
- **GIVEN** Vercel 项目已创建 KV 存储
- **WHEN** 配置 KV_REST_API_URL 和 KV_REST_API_TOKEN
- **AND** 重新部署项目
- **THEN** 系统自动使用 KV 存储

### Requirement: 本地开发支持
系统 SHALL 支持本地开发时使用模拟 KV 存储。

#### Scenario: 本地开发
- **WHEN** 环境变量未配置
- **THEN** 使用内存缓存
- **AND** 功能与生产环境一致（除了数据不持久化）

## MODIFIED Requirements

### Requirement: 密钥检测机制
**原逻辑**：使用 `__SET__` 占位符标记已配置的密钥
**新逻辑**：通过检查密钥长度 > 0 且不等于空字符串来检测

#### Scenario: 读取已配置密钥
- **WHEN** API 返回配置数据
- **AND** 密钥字段有值且长度 > 0
- **THEN** 返回 `__SET__` 占位符（安全考虑不暴露真实密钥）

#### Scenario: 读取未配置密钥
- **WHEN** API 返回配置数据
- **AND** 密钥字段为空或未定义
- **THEN** 返回空字符串

## REMOVED Requirements

### Requirement: 强制内存降级
**原逻辑**：KV 不可用时强制使用内存缓存，并在日志中警告
**新逻辑**：KV 不可用时静默降级到内存缓存（仅开发模式输出警告）
**Reason**: 生产环境应使用真实 KV，开发环境的降级不应产生大量警告日志

## Technical Notes

### Vercel KV vs Upstash Redis
- Vercel KV 是 Vercel 官方提供的 Serverless Redis 解决方案
- 基于 Upstash Redis，兼容 Redis 协议
- 提供 REST API 和 SDK 两种访问方式
- 免费套餐：1KB 存储，30K 命令/天

### SDK 选择
- `@vercel/kv` - Vercel 官方 SDK，封装了 REST API 调用
- 支持 nextjs/v8 edge runtime
- 已在 Vercel 平台深度集成

### 环境变量命名
```
KV_REST_API_URL=redis://default.xxxxx.upstash.io:6379
KV_REST_API_TOKEN=xxxxxxxxx
```

### 降级策略
1. 检查环境变量是否存在
2. 存在则初始化 KV 客户端
3. 尝试连接 Redis
4. 连接失败或超时则降级到内存缓存
5. 内存缓存仅用于临时数据，不适合生产环境
