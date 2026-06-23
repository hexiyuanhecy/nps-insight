# NPS Insight 项目进度记录

## 2026-06-23 任务分析

### 分析方法
1. 读取 `projectsFiles/prd-code-diff-analysis.md`（PRD v2 vs 代码差异分析，含 T-01 至 T-13 任务清单）
2. 读取 git log 最近 15 条提交记录
3. 逐任务核对代码实际状态

---

## 已完成任务（对照差异分析文档逐一验证）

| 任务 | 描述 | 状态 | 依据 |
|------|------|------|------|
| T-02 | 公式字段配置 | 已实现 | commit 6e0c83a, bitable-setup.ts `addTagTableFormulas()` |
| T-03 | 标签关联字段 | 已实现 | commit a6bc018, Tag2/Tag3 表 type:16 关联字段 |
| T-04 | 租户信息查询 | 已实现 | commit 07e3eec, `enrichTenantInfo()` 调用租户接口 |
| T-07 | 语言翻译 | 已实现 | commit e7cbd12, tagger.ts `translatedContent` |
| T-08 | 周报文档生成 | 已实现 | commit 07230fa, sync/route.ts 调用 weekly doc API |
| T-10 | 月报 Top 问题摘要 | 已实现 | commit ffaca06, `createMonthlyReportCard` 列出前 5 条 |
| T-11 | Bot 命令处理 | 已实现 | commit de8cec2, webhook 处理 /nps status + /nps tag |
| T-09 | Excel 上传 UI | 已实现 | commit 98d108c, IntegrationTab Excel 批量导入区块 |
| T-01 | 统一字段命名 | 已实现 | commit 9059b80, constants.ts/bitable-setup.ts 字段名对齐 PRD v2 |
| T-05 | Top 问题表关联引用 | 已实现 | commit 9059b80, bitable-setup.ts/top-issues.ts 关联引用字段 |
| T-06 | 标签名称同步 | 已实现 | commit 9059b80, tag-evolution.ts 合并时更新 record_id |
| T-12 | 飞书原生仪表盘 | 暂缓 | 用户可通过飞书 UI AI 智能创建仪表盘 |

---

## 2026-06-23 浏览器完整测试结果

### 测试环境
- 服务器：Next.js 14.2.5 dev mode @ http://localhost:3000
- 飞书配置：已绑定 App Token `F9rLbvQdoanT2XsW8p3cVQ7ynjd`（来自 .env）
- 反馈数据：1022 条已写入飞书多维表格
- 通知群：`oc_29d0d49f829145b53f32dbebba1b3c40`

### 测试结果

| 测试项 | 结果 | 详情 |
|--------|------|------|
| GET /api/config | ✅ 通过 | 自动从 .env 读取所有配置 |
| GET /api/feedback | ✅ 通过 | 返回 1022 条反馈 |
| GET /api/tags | ✅ 通过 | Tag1/Tag2/Tag3 API 正常 |
| POST /api/config testFeishu | ✅ 通过 | 飞书连接正常（已修复 __SET__ 占位符问题） |
| POST /api/config testAI | ✅ 通过 | AgnesAI 连接成功 |
| POST /api/config testNotify | ✅ 通过 | 已成功发送到 1/1 个群 |
| POST /api/config runManualSync | ✅ 通过 | 立即执行同步任务 |
| POST /api/cron/sync | ✅ 通过 | 周度同步任务正常 |
| POST /api/cron/monthly | ✅ 通过 | 月度任务：标签自进化+Top问题+公式同步+文档+通知 |
| /nps tag 命令 | ✅ 通过 | 触发打标任务并发送 Bot 消息 |
| /nps analyze 命令 | ✅ 通过 | 触发月分析任务并发送 Bot 消息 |

### 修复的 Bug
1. **testFeishu 400 错误**：前端传 `__SET__` 占位符时，后端会当作有效 appSecret 调用飞书 API 导致 400。修复为：识别 `__SET__` 并回退到环境变量
2. **handleAnalysis 重复定义**：原来只有查询功能，现重写为支持 `view` 参数查询和直接触发两种模式
3. **analyze 命令路由缺失**：switch case 中添加 `case 'analyze':` 分支

---

## 本次新增功能

### Bot 交互命令

| 命令 | 功能 |
|------|------|
| `/nps tag` | 手动触发打标任务（立即拉取反馈+AI打标+发送通知） |
| `/nps analyze` | 手动触发月度分析（标签自进化+Top问题+月报） |
| `/nps analyze view [周期]` | 查询已生成的月度分析报告 |
| `/nps help` | 查看所有命令 |
| `/nps status` | 查看系统状态 |
| `/nps report` | 查看 NPS 报告 |
| `/nps feedback [N]` | 查看最新 N 条反馈 |
| `/nps config` | 查看系统配置 |

### 改动文件
1. `src/app/api/webhook/feishu/route.ts` — 修复 handleTag bug，重写 handleAnalysis 支持 view/trigger 两种模式，添加 analyze case
2. `src/lib/feishu/bot.ts` — 更新 help 卡片文档
3. `src/app/api/config/route.ts` — 修复 testFeishu 处理 __SET__ 占位符 + 兼容 BITABLE_TABLE_ID 等环境变量名

### 提交
- 待提交

---

## 后续可优化项

- Tag2/Tag3 API 返回 name 字段为空的 bug（getAllTags 的 TagRecord 结构问题）
- T-12 飞书原生仪表盘（可使用飞书 UI AI 智能创建）
- kv-storage.ts 的 @vercel/kv 模块依赖（Vercel 部署时需配置）
