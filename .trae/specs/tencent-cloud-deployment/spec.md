# 腾讯云开发部署 - Product Requirement Document

## Overview
- **Summary**: 将 NPS Insight Next.js 项目从 Vercel 迁移到腾讯云开发（CloudBase），解决国内访问问题。使用云函数 SCF Web Function 部署全栈应用，保留 Upstash Redis 作为配置存储。
- **Purpose**: 解决 Vercel 在国内访问慢/不可用的问题，确保国内用户可以正常访问和使用 NPS Insight 系统。
- **Target Users**: 国内使用 NPS Insight 的产品、运营和研发团队。

## Goals
- Next.js 全栈应用可在腾讯云开发环境正常运行
- 国内访问速度明显优于 Vercel
- 配置数据持久化（Upstash Redis 或腾讯云 Redis）
- 所有 API 路由、定时任务、飞书回调正常工作
- 部署流程自动化（CLI 一键部署）

## Non-Goals (Out of Scope)
- 不重构业务逻辑
- 不替换飞书数据源
- 不实现腾讯云开发的 CI/CD 流水线（先手动部署）
- 不替换 Redis 为腾讯云数据库（先用 Upstash，后续再评估）
- 不实现自定义域名绑定（先用腾讯云分配的子域名）

## Background & Context
- 项目已在 Vercel 部署完成，但国内访问存在严重网络问题
- 用户已有腾讯云开发环境（hexiyuan-d0g6ll45k94275810）
- 项目使用 Next.js 14 App Router，有多个 API 路由
- 配置存储使用 Upstash Redis（原 Vercel KV 的底层）
- 定时任务通过外部 Cron 调用 API 触发

## Functional Requirements
- **FR-1**: Next.js 应用完整部署到腾讯云开发云函数
- **FR-2**: 所有页面路由可正常访问（首页、配置中心、日志页面）
- **FR-3**: 所有 API 路由可正常调用（config、feedback、tags、analysis、cron、webhook）
- **FR-4**: 环境变量可在云函数中正常读取
- **FR-5**: Upstash Redis 连接正常，配置数据可读写
- **FR-6**: 飞书 Webhook 回调可正常接收和处理

## Non-Functional Requirements
- **NFR-1**: 国内访问首屏加载时间 < 3 秒
- **NFR-2**: API 响应时间 < 1 秒（不含 AI 打标等长任务）
- **NFR-3**: 云函数冷启动时间 < 5 秒
- **NFR-4**: 部署过程可在 10 分钟内完成

## Constraints
- **Technical**: Next.js 14 + TypeScript + Node.js 18+
- **Business**: 腾讯云开发环境已存在，直接使用
- **Dependencies**: Upstash Redis（需确认国内可访问）、飞书开放平台、AgnesAI API

## Assumptions
- 腾讯云开发环境已开通云函数、静态托管能力
- Upstash Redis 在国内可以正常访问（如不行则后续切换腾讯云 Redis）
- Node.js 18 是云函数支持的运行时版本
- 云函数 Web Function 支持 Next.js 14

## Acceptance Criteria

### AC-1: 部署脚本可用
- **Given**: 项目已安装 CloudBase CLI 并登录
- **When**: 执行部署命令
- **Then**: 项目成功构建并部署到腾讯云开发环境
- **Verification**: `programmatic`
- **Notes**: 部署后返回访问 URL

### AC-2: 首页可正常访问
- **Given**: 项目已成功部署
- **When**: 访问腾讯云分配的域名
- **Then**: 首页正常渲染，无报错
- **Verification**: `programmatic`

### AC-3: 配置中心页面正常
- **Given**: 项目已成功部署
- **When**: 访问 /admin 页面
- **Then**: 配置中心页面正常展示，3 个 Tab 可切换
- **Verification**: `programmatic`

### AC-4: 配置数据可读写
- **Given**: 项目已部署，Redis 已配置
- **When**: 在配置中心修改配置并保存
- **Then**: 刷新页面后配置仍然存在
- **Verification**: `programmatic`
- **Notes**: 验证 Redis 持久化生效

### AC-5: API 路由正常工作
- **Given**: 项目已部署
- **When**: 调用 /api/config、/api/feedback 等 API
- **Then**: API 返回正确的响应格式
- **Verification**: `programmatic`

### AC-6: 日志查询页面正常
- **Given**: 项目已部署
- **When**: 访问 /log-viewer 页面
- **Then**: 日志页面正常展示，Mock 数据正常生成
- **Verification**: `programmatic`

### AC-7: 环境变量正确读取
- **Given**: 云函数已配置环境变量
- **When**: API 读取环境变量
- **Then**: 能正确获取配置的环境变量值
- **Verification**: `programmatic`

### AC-8: 国内访问速度达标
- **Given**: 项目已部署
- **When**: 从国内网络访问
- **Then**: 首屏加载时间 < 3 秒
- **Verification**: `human-judgment`
- **Notes**: 人工感知访问速度明显优于 Vercel

## Open Questions
- [ ] Upstash Redis 在国内访问速度如何？是否需要切换腾讯云 Redis？
- [ ] 是否需要配置自定义域名？
- [ ] 定时任务（周同步、月分析）怎么触发？腾讯云有定时触发器吗？
- [ ] 飞书 Webhook 地址需要更新吗？
