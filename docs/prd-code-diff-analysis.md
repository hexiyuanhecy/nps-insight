# PRD v2 vs 代码实现差异分析与任务拆解

**版本**: v1.0
**日期**: 2026-06-22
**说明**: 对比 PRD v2 与实际代码实现，识别差异点并拆解为可执行任务

---

## 一、已实现且对齐的功能

以下功能在 PRD v2 中有明确要求，代码也已完整实现：

| # | 功能 | PRD 章节 | 代码位置 | 状态 |
|---|------|----------|----------|------|
| 1 | 多用户 KV 配置存储 | 2.2 | `kv-storage.ts` | 已实现 |
| 2 | 敏感字段 AES-256-GCM 加密 | 2.2 | `encryption.ts` | 已实现 |
| 3 | 三张独立标签表 + 公式字段 | 3.2 | `constants.ts` TAG1/TAG2/TAG3 定义 | 已实现 |
| 4 | 租户信息表自动新增 | 3.3 + 差异决策-一-9 | sync/route.ts 写入 tenantName | 部分实现（写入但不查外部接口） |
| 5 | AI 批量打标（50条/批） | 5.1 步骤5 | tagger.ts + sync/route.ts | 已实现 |
| 6 | 标签 5 分钟缓存 | 4.4 | tagger.ts `getCachedTags` | 已实现 |
| 7 | 置信度阈值 + 待审核标记 | 5.1 步骤5 | tagger.ts `normalizeTagResult` | 已实现 |
| 8 | 需查日志标记 | 5.1 步骤5 | Prompt 中规则5 | 已实现 |
| 9 | Excel 优先于 API | 5.1 优先级规则 | data-sources/adapter-factory.ts | 已实现 |
| 10 | 周报通知卡片 | 6.1 | bot.ts `createWeeklyReportCard` | 已实现 |
| 11 | 月报通知卡片 | 6.2 | bot.ts `createMonthlyReportCard` | 已实现 |
| 12 | Bot 命令体系 | 6.5 | bot.ts `createHelpCard` | 已实现 |
| 13 | 周报文档每次新建 | 3.5 + 差异决策-四 | documents/weekly/route.ts | 已实现 |
| 14 | 月报文档生成 | 3.5 | documents/monthly/route.ts | 已实现 |
| 15 | 月度分析：标签自进化 | 5.2 步骤1 | tag-evolution.ts | 已实现 |
| 16 | 月度分析：Top 问题生成 | 5.2 步骤2 | top-issues.ts | 已实现 |
| 17 | 月度分析：公式同步 | tech-v2 7.2 | formula-sync.ts | 已实现 |
| 18 | 月度分析：月报通知 | 5.2 步骤4 | bot.ts `createMonthlyReportCard` | 已实现 |
| 19 | 配置中心 3 Tabs | 第7节 | admin/ConfigCenter.tsx | 已实现 |
| 20 | Tag1 增删改查 | 7 Tab2 | AiTagsTab.tsx | 已实现 |
| 21 | 定时周期可配置 | 7 Tab3 | OpsTab.tsx + schedule-utils.ts | 已实现 |
| 22 | NPS 分析报告卡片 | 6.4 | bot.ts `createAnalysisCard` | 已实现 |
| 23 | 入欢迎卡片 | 代码决策-二-3 | bot.ts `createOnboardingCard` | 已实现 |
| 23 | 入群欢迎卡片 | 代码决策-二-3 | bot.ts `createOnboardingCard` | 已实现 |
| 24 | 评分分布可视化卡片 | 代码决策-二-2 | bot.ts `createScoreDistributionCard` | 已实现 |

---

## 二、PRD 有但代码未完整实现的功能

| # | PRD 章节 | 功能 | 当前状态 | 差异说明 | 任务编号 |
|---|----------|------|----------|----------|----------|
| A | 3.1 反馈平台 | `反馈平台` 字段 | 代码无此字段 | PRD 要求"如小程序打卡、Web 端"，代码只有 `source` 字段，语义不明确 | T-01 |
| B | 3.2 公式字段配置 | 标签表公式自动配置 | 建表时未配置公式 | `bitable-setup.ts` 建表时只定义了字段类型，没有通过 API 写入公式字段（`COUNTA`/`AVERAGE`/`FILTER`）。公式需在表创建后单独配置 | T-02 |
| C | 3.2 所属 Tag1/Tag2 | Tag2 关联 Tag1、Tag3 关联 Tag2 | 代码无关联字段 | `TAG2_FIELDS` 有 `PARENT_TAG1`，`TAG3_FIELDS` 有 `PARENT_TAG2`，但建表时未创建为关联引用类型 | T-03 |
| D | 3.3 租户信息查询 | 新租户自动查询名称 | 代码只写入不查询 | 代码在 syncExternalData 中直接写入 `tenantName`，没有调用租户查询接口。差异决策-一-9 说"调用租户查询接口"，但代码未实现 | T-04 |
| E | 3.4 Top 问题 | `功能模块` 关联 Tag2 | 代码用文本字段 | PRD 要求"关联 Tag2"，代码 `TOP_ISSUES_FIELDS.TAG2_NAME` 是纯文本，不是关联引用 | T-05 |
| F | 3.4 Top 问题 | `具体问题` 关联 Tag3（多选） | 代码用逗号分隔文本 | PRD 要求"关联 Tag3（多选）"，代码 `TAG3_NAMES` 是 `string[]` 但写入时为逗号分隔文本 | T-06 |
| G | 4.2 标签名称同步 | 修改标签名自动同步到所有反馈 | 未实现 | 代码没有监听标签名变更并同步更新反馈引用的逻辑 | T-07 |
| H | 5.1 步骤4 语言翻译 | 非中文自动翻译 | 代码无翻译逻辑 | Prompt 中要求输出 `translatedContent`，但 tagger.ts 的 `analyzeFeedback` 没有调用翻译 API，`batchAnalyzeFeedbacks` 也没有翻译步骤 | T-08 |
| I | 5.1 步骤7 周报文档 | 发送 Bot 通知后写入飞书文档 | 独立路由但未被周任务调用 | `documents/weekly/route.ts` 已实现，但 `cron/sync/route.ts` 的 `sendNotification` 没有调用周报文档 API | T-09 |
| J | 6.2 月报 Top 问题摘要 | 月报卡片列出 Top 3-5 条摘要 | 代码只显示"Top问题已更新至分析表" | `createMonthlyReportCard` 没有列出 Top 问题摘要，只显示了一行文字 | T-10 |
| K | 6.5 机器人命令 | `/nps status` 查看配置状态 | 代码未实现 | `createHelpCard` 列出了命令但 Bot 回调中没有处理 `/nps status` 和 `/nps tag` | T-11 |
| L | 7 Tab1 Excel 上传 | 配置页上传 Excel 文件 | 有 API 路由但 UI 未实现 | `/api/config/excel` 路由存在，但 `IntegrationTab.tsx` 没有文件上传区域 | T-12 |
| M | 3.6 可视化仪表盘 | 飞书原生仪表盘配置 | 未实现 | `bitable-setup.ts` 没有创建仪表盘的逻辑 | T-13 |

---

## 三、代码有但 PRD 未明确提到的功能

| # | 代码位置 | 功能 | 建议 | 任务编号 |
|---|----------|------|------|----------|
| 1 | `tag-evolution.ts` | 热门标签检测（usageCount > 20） | PRD 未提及，保留 | T-14 |
| 2 | `top-issues.ts` | 公式权重可配置（`FormulaSync`） | PRD 未提及，保留 | T-15 |
| 3 | `webhook-adapter.ts` | Webhook 数据源 | PRD 未提及，保留 | T-16 |
| 4 | `database-adapter.ts` | 数据库数据源 | PRD 未提及，保留 | T-17 |
| 5 | `delay-notifier.ts` | 延迟通知 | PRD 未提及，保留 | T-18 |

---

## 四、任务拆解

### T-01: 统一字段命名
**优先级**: 低  
**涉及文件**: `constants.ts`, `tagger.ts`  
**任务**: 将 `content` → `反馈原文`，`source` → `反馈平台`，与 PRD 字段名对齐

### T-02: 配置标签表公式字段
**优先级**: 高  
**涉及文件**: `bitable-setup.ts`  
**任务**: 在创建 Tag1/Tag2/Tag3 表后，通过飞书 API 写入公式字段：
- `使用次数` = `COUNTA(关联(反馈列表.TagX))`
- `大租户数` = `COUNTA(FILTER(关联(反馈列表.TagX), 反馈列表.租户规模 >= A4))`
- `大租户占比` = `IF(使用次数 > 0, 大租户数 / 使用次数, 0)`
- `平均分` = `AVERAGE(关联(反馈列表.TagX).评分)`

### T-03: 创建标签关联字段
**优先级**: 高  
**涉及文件**: `bitable-setup.ts`, `constants.ts`  
**任务**: 
- Tag2 表添加 `所属一级标签` 关联引用字段，指向 Tag1 表
- Tag3 表添加 `所属二级标签` 关联引用字段，指向 Tag2 表

### T-04: 实现租户信息查询
**优先级**: 中  
**涉及文件**: `sync/route.ts`, `tenants/route.ts`  
**任务**: 在 `syncExternalData` 中发现新 `tenantId` 时，调用租户查询接口（FeelGood API 或其他）获取 `tenantName`，写入租户信息表

### T-05: Top 问题表改为关联引用
**优先级**: 中  
**涉及文件**: `bitable-setup.ts`, `top-issues.ts`, `constants.ts`  
**任务**: 
- `功能模块` 字段改为关联引用类型，指向 Tag2 表
- `具体问题` 字段改为多选关联引用类型，指向 Tag3 表
- 更新写入逻辑

### T-06: 标签名称同步
**优先级**: 低  
**涉及文件**: `tag-evolution.ts`, `bitable.ts`  
**任务**: 当标签名称变更时，扫描所有引用该标签的反馈记录，更新关联

### T-07: 实现语言翻译
**优先级**: 中  
**涉及文件**: `tagger.ts`, `ai/index.ts`  
**任务**: 在批量打标前增加翻译步骤，非中文内容调用 LLM 翻译为中文

### T-08: 周任务调用周报文档 API
**优先级**: 中  
**涉及文件**: `sync/route.ts`  
**任务**: 在 `sendNotification` 成功后，调用 `POST /api/documents/weekly` 生成周报文档

### T-09: 月报卡片增加 Top 问题摘要
**优先级**: 高  
**涉及文件**: `bot.ts`, `monthly/route.ts`  
**任务**: `createMonthlyReportCard` 增加 Top 3-5 问题摘要列表

### T-10: 实现 Bot 命令处理
**优先级**: 高  
**涉及文件**: `webhook/feishu/route.ts`, `ai/chatbot.ts`  
**任务**: 在 Bot 回调中处理 `/nps status` 和 `/nps tag` 命令

### T-11: 配置页添加 Excel 上传 UI
**优先级**: 高  
**涉及文件**: `IntegrationTab.tsx`  
**任务**: 在 Tab 1 添加文件上传区域，对接 `/api/config/excel` 接口

### T-12: 创建飞书原生仪表盘
**优先级**: 低  
**涉及文件**: `bitable-setup.ts`  
**任务**: 在多维表格创建后，通过 API 创建仪表盘及图表

---

## 五、任务优先级排序

| 优先级 | 任务 | 预估工时 |
|--------|------|----------|
| P0 紧急 | T-02 公式字段配置 | 0.5 天 |
| P0 紧急 | T-03 标签关联字段 | 0.5 天 |
| P1 重要 | T-09 月报卡片 Top 摘要 | 0.5 天 |
| P1 重要 | T-10 Bot 命令处理 | 1 天 |
| P1 重要 | T-11 Excel 上传 UI | 1 天 |
| P2 一般 | T-08 周任务调用文档 API | 0.5 天 |
| P2 一般 | T-07 语言翻译 | 1 天 |
| P2 一般 | T-04 租户信息查询 | 1 天 |
| P3 低优 | T-05 Top 问题关联引用 | 1 天 |
| P3 低优 | T-06 标签名称同步 | 1 天 |
| P3 低优 | T-01 字段命名统一 | 0.5 天 |
| P3 低优 | T-12 仪表盘创建 | 1 天 |

**总计**: 约 9 天工作量

---

## 六、决策记录

> 以下由用户确认后执行

| 编号 | 决策项 | 建议 | 用户决策 |
|------|--------|------|----------|
| D-01 | 公式字段配置 | 通过 API 写入，与 PRD 对齐 | |
| D-02 | 标签关联字段 | 创建关联引用类型 | |
| D-03 | 租户信息查询 | 调用 FeelGood API 获取租户名称 | |
| D-04 | Top 问题关联引用 | 改为关联引用类型 | |
| D-05 | 月报卡片 Top 摘要 | 列出前 5 条 | |
| D-06 | Bot 命令处理 | 实现 /nps status + /nps tag | |
| D-07 | Excel 上传 UI | 在 Tab 1 添加上传区域 | |
