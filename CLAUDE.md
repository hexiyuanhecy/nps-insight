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

## 🚨 绝对禁止的操作（硬阻断）

1. **禁止删除任何包含内容的文件夹或文件**
   - 绝对禁止执行 `rm -rf`、`rmdir`、`Remove-Item -Recurse` 等递归删除命令
   - 绝对禁止删除 `.git` 目录或任何版本控制相关文件
   - 绝对禁止清空、覆盖或重置任何已有内容的目录
   - 删除操作前必须先确认目标路径下没有文件，或已手动备份

2. **禁止破坏性文件操作**
   - 禁止 `dd`、`mkfs`、`format` 等磁盘操作
   - 禁止 `chmod -R 777` 或类似权限修改
   - 禁止重命名或移动包含 `.git` 的目录

3. **禁止无 WHERE 的 SQL 删除/更新**
   - 禁止 `DELETE FROM`、`TRUNCATE`、`DROP TABLE` 不带 WHERE 条件
   - 禁止 `UPDATE` 不带 WHERE 条件

## ⏱️ 任务执行与超时规则

4. **长时间任务必须报告**
   - 任何命令或任务运行超过 **3 分钟** 必须主动报告用户当前状态
   - 超过 **10 分钟** 必须暂停并请求用户确认是否继续
   - 网络请求、构建、安装依赖等耗时操作必须提前告知预计时间

5. **禁止静默执行高风险操作**
   - 任何文件写入、删除、权限修改、网络请求必须明确告知用户
   - 禁止在后台偷偷执行命令

## 🗂️ 文件与目录操作规范

6. **操作前必须确认目录状态**
   - 进入任何目录前先 `ls` 或 `dir` 确认内容
   - 修改文件前先读取确认当前内容
   - 批量操作前必须先列出受影响文件清单

7. **优先使用非破坏性操作**
   - 移动文件用 `mv` 而非 `cp + rm`
   - 修改配置先备份原文件（`.bak` 后缀）
   - 使用 `git mv` / `git rm` 而非直接文件系统操作

8. **禁止覆盖已有文件**
   - 写入文件前检查是否已存在
   - 存在时必须询问用户是覆盖、追加还是跳过

## 🔒 Git 与版本控制安全

9. **Git 操作必须谨慎**
   - 禁止 `git push --force` 到主分支
   - 禁止 `git reset --hard` 除非用户明确要求
   - 禁止删除 `.git` 目录
   - 任何 `git clean` 前必须展示将被删除的文件列表

10. **提交前必须确认**
    - `git add` 前用 `git status` 展示变更
    - 提交信息必须清晰描述变更内容

## 🧪 环境隔离原则

11. **区分开发/生产环境**
    - 禁止在生产环境直接修改代码或执行破坏性操作
    - 涉及生产数据库、API、部署的操作必须双重确认

12. **敏感文件保护**
    - 禁止读取、修改、删除 `.env`、`.ssh/`、`secrets/` 等敏感文件
    - 禁止将密钥、Token 写入日志或输出

## 📋 沟通与确认规范

13. **执行前复述确认**
    - 执行任何批量操作前，复述你的计划并等待用户确认
    - 特别是涉及：删除、覆盖、权限修改、网络推送

14. **错误必须立即报告**
    - 任何命令失败、报错、异常必须立即告知用户
    - 禁止静默忽略错误或自动"修复"（可能引入更大问题）

15. **不确定时停止并询问**
    - 遇到模糊指令或可能产生副作用的操作，先问清楚再执行
    - 宁可多确认一次，也不要擅自决定
