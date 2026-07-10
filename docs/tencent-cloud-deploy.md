# NPS Insight 腾讯云部署指南

## 概述

本文档说明 NPS Insight 在腾讯云开发（CloudBase）环境下的部署流程、定时任务配置、认证方案。

> **注意**：项目已从 Vercel 迁移到腾讯云开发。`vercel.json` 文件保留为兼容历史参考，但不再用于实际部署和定时任务。

---

## 部署架构

```
┌──────────────────────────────────────────┐
│  飞书客户端（Web/App）                     │
└──────────────┬───────────────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────────────────┐
│  腾讯云 API 网关（CloudBase 流量入口）        │
└──────────────┬───────────────────────────┘
               │ 内网
               ▼
┌──────────────────────────────────────────┐
│  SCF 云函数（nps-insight-function）        │
│  ├─ scf-handler.js  ← 入口适配            │
│  ├─ server.js       ← Next.js standalone  │
│  └─ 依赖 + .next/static                  │
└──────────────┬───────────────────────────┘
               │
       ┌───────┼────────┬──────────────┐
       ▼       ▼        ▼              ▼
  Upstash   飞书 API  AgnesAI      飞书
  Redis     (Bitable)  (LLM)      Webhook
```

---

## 一键部署

### 前置条件

1. 已安装 Node.js 18+
2. 已安装 CloudBase CLI：
   ```bash
   npm install -g @cloudbase/cli
   ```
3. 已登录腾讯云账号：
   ```bash
   tcb login
   ```
4. 已配置 `.env` 文件（包含所有必需的密钥）

### 部署命令

```bash
# 一键部署（构建 + 部署 + 配置触发器）
./scripts/deploy-tencent.sh

# 部署到指定环境
./scripts/deploy-tencent.sh --env your-env-id

# 跳过构建直接部署
./scripts/deploy-tencent.sh --skip-build

# 仅配置定时触发器（不重新部署）
./scripts/deploy-tencent.sh --triggers-only
```

部署完成后，会得到一个访问 URL：
```
https://hexiyuan-d0g6ll45k94275810.service.tcloudbase.com/nps-insight-function
```

---

## 定时任务配置

定时任务在腾讯云函数控制台配置，**不使用 vercel.json 的 crons 字段**。

### 已有触发器

| 任务名称 | Cron 表达式 | 触发时间 | 调用的 API |
|---------|-----------|---------|-----------|
| weekly-sync-trigger | `0 0 9 ? * MON` | 每周一 09:00（北京时间） | `GET /api/cron/sync` |
| monthly-analysis-trigger | `0 0 0 1 * ?` | 每月 1 日 00:00（北京时间） | `GET /api/cron/monthly` |

### 手动配置触发器

如果自动配置失败，可在腾讯云控制台手动创建：

1. 进入 [腾讯云开发控制台](https://console.cloud.tencent.com/tcb)
2. 选择环境 → 云函数 → `nps-insight-function`
3. 触发管理 → 创建触发器
4. 填写：
   - 触发方式：定时触发
   - 名称：weekly-sync-trigger
   - Cron 表达式：`0 0 9 ? * MON`
   - 附加信息：`{"task":"weekly-sync"}`
5. 重复步骤 3-4 创建 monthly-analysis-trigger（Cron: `0 0 0 1 * ?`）

### Cron 表达式说明

腾讯云 SCF 使用 6 位 Cron 格式：`分 时 日 月 星期 年`

| 表达式 | 含义 |
|--------|------|
| `0 0 9 ? * MON` | 每周一 09:00 |
| `0 0 0 1 * ?` | 每月 1 日 00:00 |
| `0 */30 * * * ?` | 每 30 分钟一次 |

---

## 认证方案

### 定时任务认证

腾讯云定时触发器调用 API 时，HTTP 请求会带特定 User-Agent（如 `TencentCloud-SCF-Timer/1.0`）。`src/app/api/cron/*.ts` 已适配此认证方式：

```typescript
// src/app/api/cron/sync/route.ts
const userAgent = request.headers.get('user-agent') || '';
const isTencentCloud = userAgent.includes('SCF') || userAgent.includes('TencentCloud');
const isDev = process.env.NODE_ENV === 'development';

if (isTencentCloud || isDev) {
  // 腾讯云触发器或本地开发：放行
} else if (cronSecret) {
  // 外部调用：需要 CRON_SECRET 认证
  const token = authHeader?.replace('Bearer ', '');
  if (token !== cronSecret && cronSecretHeader !== cronSecret) {
    return 401;
  }
}
```

### 手动触发 API

通过外部工具（如 curl）调用定时任务 API 时，需要提供密钥：

```bash
# 通过 Authorization 头
curl -X POST https://your-domain.com/api/cron/sync \
  -H "Authorization: Bearer your-cron-secret"

# 通过 X-Cron-Secret 头（更直观）
curl -X POST https://your-domain.com/api/cron/sync \
  -H "X-Cron-Secret: your-cron-secret"
```

`CRON_SECRET` 在腾讯云函数环境变量中配置。

### 飞书 Webhook 认证

飞书 Webhook 走 API 网关的公网入口，按飞书开放平台的签名验证流程处理（参见飞书文档）。

---

## 环境变量配置

在腾讯云函数控制台配置以下环境变量：

### 必需

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `FEISHU_APP_ID` | 飞书应用 App ID | `cli_xxxxx` |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | `xxxxx` |
| `AGNESAI_API_KEY` | AgnesAI API 密钥 | `sk-xxxxx` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token | `AXxx...` |

### 可选

| 变量名 | 说明 |
|--------|------|
| `CRON_SECRET` | 定时任务外部调用密钥 |
| `DEFAULT_OWNER_ID` | 默认所有者 ID（多租户场景） |
| `DATA_SOURCE_API_KEY` | 外部数据源 API 密钥 |
| `TENANT_SOURCE_API_KEY` | 租户数据源 API 密钥 |
| `SYSTEM_NAME` | 系统显示名称（卡片标题） |

---

## 常见问题

### Q1: 部署后访问 502/504？
**A**: 云函数冷启动需要几秒，请等待 5 秒后刷新。如频繁出现，可将 MEM_SIZE 调到 1024。

### Q2: 定时任务没有触发？
**A**:
1. 检查腾讯云控制台 → 触发器状态是否为"已启用"
2. 检查云函数日志（tcb fn log）查看是否有调用记录
3. 确认 Cron 表达式是否正确（SCF 是 6 位格式）

### Q3: 手动 curl 定时任务返回 401？
**A**: 外部调用必须带 `X-Cron-Secret` 或 `Authorization: Bearer xxx` 头。

### Q4: 飞书 Webhook 收不到消息？
**A**:
1. 在飞书开放平台配置事件回调 URL 为 `https://your-domain/api/webhook/feishu`
2. 确认订阅了 `im.message.receive_v1` 事件
3. 用 `curl -X POST https://your-domain/api/webhook/feishu -d '{"type":"url_verification","challenge":"test"}'` 测试 URL 验证

---

## 相关文件

- `scripts/deploy-tencent.sh` — 一键部署脚本
- `scripts/prepare-deploy.sh` — 准备部署包
- `tencent-scf-triggers.json` — 触发器配置参考
- `scf_bootstrap` — 云函数启动脚本
- `scf-handler.js` — HTTP 入口适配
- `next.config.js` — Next.js standalone 配置
- `.trae/specs/tencent-cloud-deployment/` — 部署规格文档
