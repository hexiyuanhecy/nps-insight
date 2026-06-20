# NPS Insight 项目上下文

## 项目概述

NPS Insight 是一个基于飞书生态的 AI 驱动 NPS 反馈分析工具。自动收集用户反馈、智能打标签（Tag1/Tag2/Tag3）、深度分析 Top 问题，并生成周报/月报。

- **技术栈**: Next.js 14 + TypeScript + TailwindCSS
- **部署**: Vercel
- **数据源**: 飞书多维表格 (Bitable) + FeelGood API
- **AI**: 可配置 LLM (默认 AgnesAI，兼容 OpenAI Chat Completions)
- **通知**: 飞书自建应用 Bot

## 目录结构

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # 首页
│   ├── admin/page.tsx      # 配置中心
│   └── api/                # API 路由
│       ├── config/route.ts
│       ├── feedback/route.ts
│       ├── tags/route.ts
│       ├── analysis/route.ts
│       ├── cron/sync/route.ts       # 周任务
│       ├── cron/monthly/route.ts    # 月任务
│       ├── webhook/feishu/route.ts  # 飞书回调
│       └── mock/feedbacks/route.ts  # Mock 数据
├── components/
│   ├── admin/config-center/    # 配置中心组件 (3 Tabs)
│   ├── home/                   # 首页子组件
│   └── Mermaid*.tsx            # Mermaid 图表渲染
├── lib/
│   ├── ai/                     # AI 打标、标签自进化、Prompt
│   ├── analysis/               # Top 问题分析、公式同步
│   ├── data-sources/           # Adapter 模式数据源
│   ├── document/               # 文档适配器
│   ├── feishu/                 # 飞书 SDK 封装
│   ├── llm/                    # 多 LLM Provider
│   ├── notification/           # 通知适配器
│   ├── storage/                # 存储适配器
│   └── types/                  # TypeScript 类型定义
└── constants/                  # 常量配置
scripts/                        # 初始化和测试脚本
tests/                          # E2E 测试 (Playwright)
```

## 架构原则

### Adapter 模式 (飞书剥离准备)

所有飞书 API 调用必须通过 Adapter 接口封装，业务逻辑不直接依赖飞书：

- `StorageAdapter` — 存储层 (feishu-storage.ts)
- `NotificationAdapter` — 通知层 (feishu-notification.ts)
- `DocumentAdapter` — 文档层 (feishu-document.ts)
- `AdapterFactory` — 服务工厂，按配置创建不同实现

### 命名规范

- 文件: kebab-case (`tag-evolution.ts`)
- 类: PascalCase (`TagEvolution`)
- 接口: PascalCase (`StorageAdapter`)
- 变量/函数: camelCase (`calculateSimilarity`)
- 常量: UPPER_SNAKE_CASE (`TABLES.FEEDBACK`)

### 错误处理

- 所有异步操作必须 try/catch
- 错误必须记录日志
- API 路由返回统一错误格式: `{ success: false, error: 'xxx', code: 400 }`

## 标签体系

- **Tag1** (一级标签): 固定 7 类，决定处理链路
- **Tag2** (二级标签): 功能模块，可多选，动态生成
- **Tag3** (三级标签): 具体问题，可多选，从用户原话提炼

打标顺序: Tag3 → Tag2 → Tag1

## 定时任务

| 任务 | Cron | 说明 |
|------|------|------|
| 周同步 | 每周一 09:00 | 拉取反馈 + AI 打标 + Bot 通知 |
| 月分析 | 每月 1 日 00:00 | 标签自进化 → Top 问题 → 公式同步 → 会议文档 → 通知 |

## Git 提交规范

遵循 Conventional Commits:

```
type(scope): 简短描述 (中文，首字母小写，不加句号，≤72 字符)

[详细描述]

Closes #123
```

type: feat | fix | refactor | docs | test | chore | style | perf
scope: tag | api | storage | bot | doc | config | ui | test | deps

Pre-commit hook 自动运行 `pnpm tsc --noEmit && pnpm lint`。

## 关键文档

- `.trae/documents/NPS-Insight-PRD.md` — 产品需求文档
- `.trae/documents/NPS-Insight-Tech-v2.md` — 技术方案
- `.trae/documents/NPS-Insight-Tasks.md` — 任务拆解
- `.trae/rules/feature-rules.md` — 功能业务规则
- `.trae/specs/` — 功能规格文档
