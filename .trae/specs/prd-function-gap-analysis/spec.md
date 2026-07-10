# NPS Insight PRD 功能点差异分析

## Overview
- **Summary**: 分析PRD文档中定义的所有功能点与当前代码实现的差异，重点关注用户反馈的两个问题：飞书Bot@机器人无反应、定时任务未触发
- **Purpose**: 识别缺失的功能实现，提供修复方案
- **Target Users**: 项目开发团队

## Goals
- 全面对比PRD功能点与代码实现
- 定位飞书Bot无响应的根本原因
- 定位定时任务未触发的根本原因
- 提供详细的修复方案和验收标准

## Non-Goals (Out of Scope)
- 不进行代码优化（除非是修复bug的必要部分）
- 不添加新功能
- 不修改数据库结构

## 功能点差异分析

### 1. Bot通知与命令（PRD章节6）

#### PRD要求
- `/nps help` — 显示帮助信息
- `/nps status` — 查看当前配置状态
- `/nps tag` — 手动触发打标流程
- 支持@Bot进行自然语言问答

#### 代码实现状态
| 功能点 | 状态 | 问题说明 |
|--------|------|----------|
| `/nps help` | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L252) |
| `/nps status` | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L357) |
| `/nps tag` | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L397) |
| `/nps report` | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L259) |
| `/nps analysis` | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L441) |
| @Bot自然语言问答 | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L150) |
| 机器人入群通知 | ✅ 已实现 | [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L72) |

#### 问题根因分析

**问题1：@Bot无反应**

通过分析 [route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/webhook/feishu/route.ts#L123-L127) 的Bot识别逻辑：

```typescript
const isMentioned = message.mentions?.some(
  (m) =>
    m.name.toLowerCase().includes('nps') ||
    m.name.toLowerCase().includes('insight')
)
```

**根本原因**：
1. **Bot名称匹配依赖硬编码关键词**：代码通过检查 `mentions` 中的 `name` 是否包含 "nps" 或 "insight" 来判断是否@了Bot。如果飞书应用的Bot名称不包含这些关键词，就无法识别。
2. **Webhook地址配置混淆**：配置中心显示的Webhook地址是 `/api/webhook/feelgood`（数据源回调），而不是 `/api/webhook/feishu`（Bot回调）。用户可能在飞书后台配置了错误的地址。
3. **缺少飞书应用凭证配置验证**：如果 `FEISHU_APP_ID` 或 `FEISHU_APP_SECRET` 未正确配置，飞书API调用会失败。

### 2. 定时任务（PRD章节5.1、5.2）

#### PRD要求
- 周同步任务：默认每周一 09:00 自动执行
- 月度分析任务：默认每月1日 00:00 自动执行
- 支持用户配置定时时间

#### 代码实现状态
| 功能点 | 状态 | 问题说明 |
|--------|------|----------|
| 周同步API | ✅ 已实现 | [sync/route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/cron/sync/route.ts) |
| 月度分析API | ✅ 已实现 | [monthly/route.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/cron/monthly/route.ts) |
| 手动触发 | ✅ 已实现 | POST方法支持手动触发 |
| Vercel Cron配置 | ❌ 缺失 | vercel.json中没有配置crons |
| 用户配置的定时生效 | ❌ 缺失 | KV中保存的cron表达式未同步到Vercel |
| 多用户定时任务 | ⚠️ 部分实现 | 代码遍历KV配置，但缺少持久化调度 |

#### 问题根因分析

**问题2：定时任务未触发**

通过分析 [vercel.json](file:///Users/xigua/ai Projects/nps-insight/vercel.json)：

```json
{
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["hkg1"],
  "functions": {
    "src/app/api/cron/**": {
      "maxDuration": 60
    }
  }
}
```

**根本原因**：
1. **vercel.json中缺少crons配置**：Vercel的定时任务需要在 `vercel.json` 中声明 `crons` 字段才能生效。当前文件只有 `functions` 配置，没有任何cron定义。
2. **配置中心的定时设置未连接到Vercel**：用户在配置中心设置的 `syncCron` 和 `analysisCron` 只保存在KV存储中，不会自动同步到Vercel的定时任务配置。
3. **缺少运行时动态调度能力**：项目没有使用 `node-cron` 等运行时调度库，完全依赖Vercel的Cron Jobs。

### 3. 核心流程（PRD章节5）

#### PRD要求
1. 数据拉取 → 去重 → 补充租户名 → 语言翻译 → AI打标 → 写入表格 → 发送Bot通知 → 生成周报文档
2. 标签自进化 → 生成Top问题表 → 生成会议文档 → 发送Bot通知

#### 代码实现状态
| 功能点 | 状态 | 说明 |
|--------|------|------|
| 数据拉取 | ✅ | [sync-task.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/cron/sync/sync-task.ts#L273) |
| 去重 | ✅ | [sync-task.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/cron/sync/sync-task.ts#L308) |
| 补充租户名 | ✅ | 代码中有相关逻辑 |
| 语言翻译 | ⚠️ | 需要确认实现 |
| AI打标 | ✅ | 使用tagger模块 |
| 写入表格 | ✅ | 使用bitableClient |
| 发送Bot通知 | ✅ | [sync-task.ts](file:///Users/xigua/ai Projects/nps-insight/src/app/api/cron/sync/sync-task.ts#L548) |
| 生成周报文档 | ✅ | 使用weekly-generator |
| 标签自进化 | ✅ | 使用embedding-evolution |
| 生成Top问题表 | ✅ | 使用monthly-task-runner |
| 生成会议文档 | ✅ | 使用文档生成器 |

### 4. 配置中心（PRD章节7）

#### PRD要求
- Tab1：飞书与集成配置
- Tab2：AI与标签配置
- Tab3：任务与运营配置
- 全局编辑/保存模式

#### 代码实现状态
| 功能点 | 状态 | 说明 |
|--------|------|------|
| 飞书与集成Tab | ✅ | FeishuTab.tsx |
| 数据源Tab | ✅ | DatasourceTab.tsx |
| AI与标签Tab | ✅ | TaggingTab.tsx |
| 用户画像Tab | ✅ | ProfileTab.tsx（新增） |
| 诊断Tab | ✅ | DiagnosticsTab.tsx（新增） |
| 标签进化Tab | ✅ | EvolutionTab.tsx（新增） |
| 全局编辑/保存 | ✅ | 已实现 |
| 定时任务配置UI | ✅ | [TaggingTab.tsx](file:///Users/xigua/ai Projects/nps-insight/src/components/admin/config-center/TaggingTab.tsx#L308) |

### 5. 数据存储（PRD章节3）

#### PRD要求
- 6张数据表：反馈列表、Tag1、Tag2、Tag3、租户信息、Top问题
- 支持公式字段自动计算

#### 代码实现状态
| 功能点 | 状态 | 说明 |
|--------|------|------|
| 反馈列表 | ✅ | 使用BITABLE |
| Tag1表 | ✅ | 使用BITABLE |
| Tag2表 | ✅ | 使用BITABLE |
| Tag3表 | ✅ | 使用BITABLE |
| 租户信息表 | ✅ | 使用BITABLE |
| Top问题表 | ✅ | 使用BITABLE |
| 公式字段 | ✅ | 使用BITABLE原生公式 |

## 修复方案

### 修复1：飞书Bot@机器人无响应

**问题根因**：
1. Bot名称匹配逻辑依赖硬编码关键词
2. Webhook地址配置混淆

**修复方案**：
1. 修改 `isMentioned` 判断逻辑，使用飞书应用的 `appId` 或 `bot_id` 来识别Bot，而不是依赖名称匹配
2. 在配置中心添加专门的飞书Bot Webhook配置项，明确区分数据源Webhook和Bot Webhook
3. 添加飞书应用配置验证机制

**验收标准**：
- AC-BOT-01：无论Bot名称是什么，@Bot后能正确识别
- AC-BOT-02：配置中心能正确显示和配置Bot Webhook地址
- AC-BOT-03：飞书应用凭证配置错误时能给出明确提示

### 修复2：定时任务未触发

**问题根因**：
1. vercel.json中缺少crons配置
2. 用户配置的定时时间未同步到Vercel

**修复方案**：
1. 在 `vercel.json` 中添加默认的crons配置（每周一09:00同步、每月1日00:00分析）
2. 实现定时任务配置的动态同步机制，当用户修改定时时间后自动更新Vercel配置
3. 添加定时任务状态监控和日志

**验收标准**：
- AC-CRON-01：vercel.json包含正确的crons配置
- AC-CRON-02：默认定时任务能按计划触发
- AC-CRON-03：用户修改定时时间后，新配置能生效

## Acceptance Criteria

### AC-BOT-01：Bot名称不影响@识别
- **Given**：飞书应用的Bot名称为任意名称（不一定包含"NPS"或"Insight"）
- **When**：用户在群里@Bot并发送消息
- **Then**：系统能正确识别并响应
- **Verification**: `programmatic`

### AC-BOT-02：Bot Webhook配置清晰
- **Given**：用户打开配置中心
- **When**：用户查看Webhook配置区域
- **Then**：能明确看到"数据源Webhook"和"飞书Bot Webhook"两个独立配置项
- **Verification**: `human-judgment`

### AC-BOT-03：凭证配置验证
- **Given**：用户配置了飞书应用凭证
- **When**：用户点击"测试连接"按钮
- **Then**：能正确验证凭证有效性并给出反馈
- **Verification**: `programmatic`

### AC-CRON-01：Vercel Cron配置存在
- **Given**：项目已部署到Vercel
- **When**：查看vercel.json文件
- **Then**：文件中包含crons配置，定义了周同步和月分析任务
- **Verification**: `programmatic`

### AC-CRON-02：默认定时任务触发
- **Given**：系统已部署且配置正确
- **When**：到达预定时间（每周一09:00或每月1日00:00）
- **Then**：系统自动执行对应的任务并发送通知
- **Verification**: `programmatic`

### AC-CRON-03：用户配置定时时间生效
- **Given**：用户在配置中心修改了定时任务时间
- **When**：保存配置并重新部署
- **Then**：新的定时时间生效
- **Verification**: `programmatic`

## Open Questions
- [ ] 用户当前飞书应用的Bot名称是什么？（用于验证修复）
- [ ] 用户在飞书后台配置的Webhook地址是什么？（用于验证修复）
- [ ] 定时任务是否需要支持动态更新而不需要重新部署？（影响技术方案选择）
