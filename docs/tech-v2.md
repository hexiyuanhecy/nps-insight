# NPS Insight 技术文档

**版本**：v2
**日期**：2026-06-22
**对应 PRD**：v2

---

## 1. 技术架构

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Next.js 14 + TypeScript + Tailwind CSS | 配置中心页面 |
| 后端 | Next.js API Routes | 统一处理定时任务、Bot 回调、配置接口 |
| AI 服务 | AgnesAI（默认）/ 自定义 OpenAI 兼容接口 | 可配置切换 |
| 数据存储 | 飞书多维表格 + Vercel KV | 表格存业务数据，KV 存用户配置 |
| 定时任务 | Vercel Cron Jobs | 周度拉取打标、月度分析 |
| 消息通知 | 飞书自建应用 Bot | 消息卡片推送 |
| 部署 | Vercel | Serverless 自动扩缩容 |

### 1.2 系统架构图

```
┌──────────────────────────────────────────────────┐
│                    Vercel                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Cron Jobs │  │ Next.js  │  │ 飞书 Bot 回调  │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │             │                 │           │
│       └──────┬──────┘                 │           │
│              │                        │           │
└──────────────┼────────────────────────┼───────────┘
               │                        │
       ┌───────▼───────┐        ┌───────▼───────┐
       │  Adapter 业务层 │        │   Bot 消息层   │
       │  - 数据源适配   │        │  - 消息卡片     │
       │  - AI 打标      │        │  - 命令处理     │
       │  - 标签进化     │        │  - 文件接收     │
       │  - 存储适配     │        └───────────────┘
       │  - 文档适配     │
       │  - 通知适配     │
       └───────┬───────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│飞书多维│ │Vercel │ │LLM   │
│ 表格   │ │  KV   │ │Provider│
└───────┘ └───────┘ └───────┘
```

### 1.3 核心原则

- **Adapter 模式**：所有外部依赖（存储、通知、文档、数据源）通过接口抽象，业务逻辑不直接依赖飞书
- **飞书原生优先**：计算、统计、可视化均使用飞书多维表格原生能力，系统只写入原始数据和标签
- **批量写入**：所有数据在内存中组装完毕后一次性写入飞书表格，避免频繁 API 调用
- **多用户隔离**：每个用户独立配置、独立表格、独立通知群，定时任务遍历所有用户依次执行
- **标签缓存**：标签体系 5 分钟内存缓存，减少重复查询
- **Excel 优先**：Excel 上传具有最高优先级，有 Excel 数据时忽略 API 拉取

---

## 2. 用户配置存储（Vercel KV）

### 2.1 存储结构

**配置键**：`config:{ownerUserId}`
**映射键**：`userConfigMapping:{userId}` → `ownerUserId`

### 2.2 配置数据结构

代码实际使用的配置结构（来自 `kv-storage.ts` `buildDefaultConfigFromEnv`）：

```typescript
interface StoredConfig {
  version: number;
  ownerUserId: string;
  feishu: {
    appId: string;
    appSecret: string;
  };
  bitable: {
    mode: string;
    appToken: string;
    url: string;
    status: 'unset' | 'linked';
  };
  dataSource: {
    apiUrl: string;
    apiKey: string;
    queryParams: string;
    timeRule: string;
  };
  webhook: { url: string };
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    modelVersion: string;
  };
  tag1: Array<{ name: string; definition: string; enabled: boolean }>;
  tag2Init: string;
  tagging: {
    confidenceThreshold: number;  // 默认 0.7
    largeTenantLevels: string[];  // 默认 ['A4', 'A5', 'A6']
  };
  schedule: {
    syncUnit: 'week';
    syncEvery: number;
    syncTime: string;          // 默认 '09:00'
    syncWeekDay: number;       // 默认 1（周一）
    syncMonthDay: number;      // 默认 1
    analysisUnit: 'month';
    analysisEvery: number;
    analysisTime: string;      // 默认 '00:00'
    analysisWeekDay: number;
    analysisMonthDay: number;
    devMode: boolean;
  };
  logPlatform: { urlTemplate: string };
  notification: {
    chatIds: string;
    adminUserIds: string;
  };
  operations: { adminUserIds: string[] };
}
```

### 2.3 敏感字段加密

使用 AES-256-GCM 加密（`lib/auth/encryption.ts`）：

- **加密格式**：`encrypted:{base64(iv + ciphertext + authTag)}`
- **加密字段**：`feishu.appSecret`、`dataSource.apiKey`、`ai.apiKey`
- **密钥来源**：`ENCRYPTION_KEY` 环境变量（32 字节 hex）
- **降级策略**：无密钥时输出警告，使用空密钥（仅本地开发）

### 2.4 KV 读写操作

```typescript
// 读取配置（自动降级到内存缓存）
async function getConfig(ownerUserId: string): Promise<Config | null>

// 保存配置
async function setConfig(ownerUserId: string, config: Config): Promise<boolean>

// 列出所有配置键（定时任务用，scan 而非 keys）
async function listAllConfigKeys(): Promise<string[]>

// 数据迁移（从 .env 迁移到 KV，幂等）
async function migrateFromEnvToKV(): Promise<boolean>
```

KV 客户端不可用时自动降级到内存 `Map` 缓存。

---

## 3. 飞书多维表格结构

### 3.1 表结构总览

| 表名 | 说明 | 对应 PRD |
|------|------|----------|
| `feedback` | 反馈列表 | 3.1 |
| `tag1` | Tag1 标签表 | 3.2 |
| `tag2` | Tag2 标签表 | 3.2 |
| `tag3` | Tag3 标签表 | 3.2 |
| `tenants` | 租户信息 | 3.3 |
| `top_issues` | Top 问题 | 3.4 |

> **与 tech-v2 原稿的差异**：tech-v2 原稿假设三张独立标签表（`tbl_tag1`/`tbl_tag2`/`tbl_tag3`），代码实际也是三张独立表，但通过常量 `TABLE_NAMES.TAGS` 别名指向 `tags` 单表作为兼容。建表时使用 `tag1`/`tag2`/`tag3` 三个独立表。

### 3.2 反馈列表字段定义

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `反馈ID` | Text | 唯一索引 |
| `租户ID` | Text | |
| `租户名称` | Text | |
| `租户规模` | SingleSelect | A1-A6 |
| `用户ID` | Text | |
| `用户名称` | Text | |
| `创建时间` | DateTime | |
| `不满意原因` | MultiSelect | 系统卡顿/界面不美观/功能缺失/打开速度慢/其他/缺少功能 |
| `反馈内容` | Text | |
| `翻译内容` | Text | 非中文翻译结果 |
| `评分` | Number | 整数 1-5 |
| `来源` | Text | |
| `Tag1` | MultiSelect | 关联标签表 |
| `Tag2` | MultiSelect | 关联标签表 |
| `Tag3` | MultiSelect | 关联标签表 |
| `置信度` | Number | 小数 0.00-1.00 |
| `需要查日志` | Checkbox | |
| `需要人工审核` | Checkbox | |
| `状态` | SingleSelect | 未打标/已打标 |
| `打标时间` | DateTime | |

### 3.3 标签表（三张独立表）

#### Tag1 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `tagId` | Text | 唯一标识 |
| `名称` | Text | Tag1 标签名 |
| `定义` | Text | 标签解释 |
| `使用次数` | Number | 公式字段：`COUNTA(关联(反馈列表.Tag1))` |
| `大租户数` | Number | 公式字段：`COUNTA(FILTER(关联(反馈列表.Tag1), 反馈列表.租户规模 >= A4))` |
| `大租户占比` | Number | 公式字段：`IF(使用次数 > 0, 大租户数 / 使用次数, 0)` |
| `平均分` | Number | 公式字段：`AVERAGE(关联(反馈列表.Tag1).评分)` |

#### Tag2 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `tagId` | Text | 唯一标识 |
| `名称` | Text | Tag2 标签名 |
| `所属一级标签` | Text | 关联 Tag1（可选） |
| `使用次数` | Number | 公式字段 |
| `大租户数` | Number | 公式字段 |
| `大租户占比` | Number | 公式字段 |
| `平均分` | Number | 公式字段 |
| `Tag3数量` | Number | 公式字段：`COUNTA(关联(tag3.parentTag2))` |

#### Tag3 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `tagId` | Text | 唯一标识 |
| `名称` | Text | Tag3 标签名 |
| `所属二级标签` | Text | 关联 Tag2（必填） |
| `使用次数` | Number | 公式字段 |
| `大租户数` | Number | 公式字段 |
| `大租户占比` | Number | 公式字段 |
| `平均分` | Number | 公式字段 |

> **公式字段配置**：建表时通过 `addField` API 写入公式字段。`FormulaSync` 模块负责读取多维表格中综合评分字段的公式属性（`property.formula`），与系统存储的公式对比，以用户调整为准进行同步。

### 3.4 租户信息表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `租户ID` | Text | 唯一标识 |
| `租户名称` | Text | |
| `规模` | SingleSelect | A1-A6 |
| `联系人` | Text | |
| `联系邮箱` | Text | |
| `日志平台` | Text | |
| `日志端点` | Text | |
| `日志凭证` | Text | |
| `创建时间` | DateTime | |

### 3.5 Top 问题表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `所属模块` | Text | Tag2 名称 |
| `具体问题` | Text | Tag3 名称（逗号分隔） |
| `问题标识` | Text | `tag2Name||tag3Name` |
| `总反馈数` | Number | 累计 |
| `本周期新增` | Number | 本月新增 |
| `A4反馈数` | Number | |
| `A5反馈数` | Number | |
| `A6反馈数` | Number | |
| `大租户反馈数` | Number | A4+A5+A6 |
| `大租户占比` | Number | 大租户/总反馈数 |
| `平均分` | Number | |
| `人工排序` | Number | 人工填写，系统不覆盖 |
| `负责人` | Text | 人工填写 |
| `解决方案` | Text | 人工填写 |
| `状态` | SingleSelect | 待讨论/已排期/已上线/验证中 |
| `迭代周期` | SingleSelect | Sprint 1/2/3+/待定 |

---

## 4. 数据源适配器

### 4.1 适配器工厂

所有数据源通过 `DataAdapterFactory` 创建，支持四种类型：

| 适配器 | 文件 | 说明 |
|--------|------|------|
| `ApiAdapter` | `api-adapter.ts` | REST API 拉取，支持 `{{start_unix}}` 占位符 |
| `ExcelAdapter` | `excel-adapter.ts` | Excel 文件解析 |
| `WebhookAdapter` | `webhook-adapter.ts` | Webhook 回调接收 |
| `DatabaseAdapter` | `database-adapter.ts` | 数据库直连 |

### 4.2 数据源优先级

```
Excel 上传 > API 拉取 > Webhook > Database
```

Excel 有数据时优先使用 Excel，否则走 API 拉取。

### 4.3 API 拉取实现

```typescript
// sync/route.ts:syncExternalData()
async function syncExternalData(): Promise<number> {
  // 1. 解析 DATA_SOURCE_CONFIG，创建 Adapter
  const adapter = AdapterFactory.create(config);

  // 2. 计算上周时间范围
  const [start, end] = getLastWeekRange();

  // 3. 拉取数据
  const feedbacks = await adapter.fetchData(startISO, endISO);

  // 4. 去重：查询本周已有 feedbackId
  const existingIds = await getExistingFeedbackIds(thisWeekStart, thisWeekEnd);
  const filtered = feedbacks.filter(f => !existingIds.has(f.feedbackId));

  // 5. 批量写入
  await bitableClient.batchCreateRecords(TABLE_NAMES.FEEDBACK, records);
}
```

---

## 5. AI 打标引擎

### 5.1 统一入口

所有打标必须调用 `tagger.analyzeFeedback` / `tagger.batchAnalyzeFeedbacks`，cron 任务和 Bot 命令共用此入口。

```typescript
// src/lib/ai/tagger.ts

export interface AITagResult {
  tag1: string[];
  tag2: string[];
  tag3: string[];
  confidence: number;
  needLogCheck: boolean;
  reviewNeeded: boolean;
  translatedContent: string;
}
```

### 5.2 标签缓存

```typescript
// 5 分钟内存缓存
let _tagCache: TagRecord[] | null = null;
const TAG_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCachedTags(): Promise<TagRecord[]> {
  const now = Date.now();
  if (_tagCache && now - _tagCacheTime < TAG_CACHE_TTL_MS) {
    return _tagCache;
  }
  _tagCache = await getAllTags();
  _tagCacheTime = now;
  return _tagCache;
}
```

### 5.3 批量打标流程

```typescript
// sync/route.ts:autoTagFeedbacks()
async function autoTagFeedbacks(batchSize: number = 50): Promise<number> {
  // 1. 查询未打标反馈
  const allRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
    filter: { status: '未打标' },
    pageSize: 500,
  });

  // 2. 预加载标签缓存
  const existingTags = await tagger.getCachedTags();

  // 3. 分批处理（每批 50 条）
  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize);

    // 4. 批量 LLM 调用
    const results = await tagger.batchAnalyzeFeedbacks(feedbacks, existingTags);

    // 5. 批量更新飞书（先 batchUpdate，失败则逐条回退）
    await bitableClient.batchUpdateRecords(TABLE_NAMES.FEEDBACK, updates);
  }
}
```

### 5.4 Prompt 模板

```typescript
// src/lib/ai/prompts.ts — generateBatchTaggingPrompt()
function generateBatchTaggingPrompt(
  feedbacks: Array<{ id, content, score, source, unsatisfactoryReason }>,
  tag1List: string[], tag2List: string[], tag3List: string[],
  confidenceThreshold: number
): string
```

Prompt 注入已有标签列表，要求 LLM 输出严格 JSON 数组。

### 5.5 标签创建与更新

```typescript
// tagger.ts — ensureTagExists()
async function ensureTagExists(tag1Name, tag2Name, tag3Name, level) {
  const existing = await getAllTags();
  const found = existing.find(t => t[`${level}Name`] === tagName);
  if (!found) {
    // 创建新标签，usageCount = 1
    const table = TABLE_NAMES[level]; // tag1 / tag2 / tag3
    await bitableClient.createRecord(table, { tagId, name, usageCount: 1 });
  } else {
    // 更新已有标签，usageCount++
    await bitableClient.updateRecord(table, found.recordId, {
      usageCount: found.usageCount + 1,
    });
  }
}
```

### 5.6 标签查询

```typescript
// tagger.ts — getAllTags()
async function getAllTags(): Promise<TagRecord[]> {
  // 从 tag1/tag2/tag3 三张表分别读取
  const [tag1Records, tag2Records, tag3Records] = await Promise.all([
    bitableClient.listRecords(TABLE_NAMES.TAG1, { pageSize: 500 }),
    bitableClient.listRecords(TABLE_NAMES.TAG2, { pageSize: 500 }),
    bitableClient.listRecords(TABLE_NAMES.TAG3, { pageSize: 500 }),
  ]);
  // 合并为统一 TagRecord 列表
}
```

### 5.7 置信度与审核标记

```typescript
function normalizeTagResult(raw, confidenceThreshold): AITagResult {
  const confidence = clamp(raw.confidence, 0, 1);
  const reviewNeeded = confidence < confidenceThreshold
    || raw.tag1.length === 0
    || raw.tag2.length === 0
    || raw.tag3.length === 0;
  return { ...raw, confidence, reviewNeeded };
}
```

---

## 6. 标签自进化

### 6.1 核心类

```typescript
// src/lib/ai/tag-evolution.ts — TagEvolution 类

class TagEvolution {
  private similarityThreshold = 0.9;
  private splitThreshold = 10;

  async execute(): Promise<EvolutionReport> {
    // 1. 从 tag1/tag2/tag3 三张独立表分别读取全量标签
    const [tag1Records, tag2Records, tag3Records] = await Promise.all([
      this.storage.listRecords(TABLE_NAMES.TAG1),
      this.storage.listRecords(TABLE_NAMES.TAG2),
      this.storage.listRecords(TABLE_NAMES.TAG3),
    ]);
    // 2. 检测重复标签（tag2/tag3 两两计算语义相似度）
    // 3. 检测可拆分标签（Tag2 下 Tag3 > 10 且分布明显）
    // 4. 自动执行拆分
    // 5. 检测冷门标签（usageCount < 5）
    // 6. 检测热门标签（usageCount > 20）
  }
}
```

### 6.2 重复检测

```typescript
private async detectDuplicates(tag2List, tag3List): Promise<TagDuplicate[]> {
  // 分别在 tag2 和 tag3 列表中进行两两相似度检测
  const detectInList = async (list) => {
    for i, j in pairs:
      similarity = calculateSimilarity(name_i, name_j);
      if similarity > 0.9:
        return { tags: [i, j], similarity, suggestion: '合并' };
  };
  return [...detectInList(tag2List), ...detectInList(tag3List)];
}
```

使用 `lib/utils/similarity.ts` 中的相似度算法。

### 6.3 拆分检测

```typescript
private async detectSplittables(tag2List, tag3List): Promise<TagSplittable[]> {
  for each tag2:
    tag3s = tag3List.filter(t => t.definition.includes(tag2.name));
    if tag3s.length > 10:
      distribution = analyzeTag3Distribution(tag3s);
      dominant = distribution.filter(d => d.percentage > 60);
      if dominant.length > 0:
        return { tag2, tag3Count, distribution, suggestion };
}
```

### 6.4 执行合并

```typescript
async executeMerge(tag1: TagRecord, tag2: TagRecord, mergedName: string): Promise<void> {
  // 1. 在对应表（tag1/tag2/tag3）中创建合并后的新标签
  //    usageCount = tag1.usageCount + tag2.usageCount
  // 2. 扫描反馈列表，更新受影响的 tagValue（Tag1/Tag2/Tag3 字段）
  // 3. 旧标签保留不做处理
}
```

### 6.5 执行拆分

```typescript
async executeSplit(originalTag: TagRecord, newTagNames: string[]): Promise<void> {
  // 1. 在对应表中批量创建新标签
  // 2. 扫描反馈记录，更新 tagValue
}
```

---

## 7. Top 问题分析

### 7.1 生成器

```typescript
// src/lib/analysis/top-issues.ts — TopIssuesGenerator 类

class TopIssuesGenerator {
  private weights = { count: 0.5, largeTenant: 0.3, quality: 0.2 };

  async generate(): Promise<TopIssue[]> {
    // 1. 加载标签映射（recordId → name）
    // 2. 读取全量反馈
    // 3. 按 Tag2+Tag3 分组统计
    // 4. 计算综合评分（大租户反馈数降序）
    // 5. 取 Top 30
  }

  async writeToTable(issues: TopIssue[]): Promise<void> {
    // 1. 读取已有 Top 问题
    // 2. 已存在的问题：只更新统计字段，不覆盖人工字段
    // 3. 新问题：全量写入
  }
}
```

### 7.2 公式同步

```typescript
// src/lib/analysis/formula-sync.ts — FormulaSync 类

class FormulaSync {
  async sync(): Promise<void> {
    // 1. 读取系统存储的公式
    const systemFormula = await this.getSystemFormula();

    // 2. 读取多维表格中综合评分字段的公式
    //    通过 storage.getTableFields() 获取 Top问题表字段列表
    //    查找 compositeScore 字段（ANALYSIS_FIELDS.COMPOSITE_SCORE）
    //    飞书 API 返回 type=15 的公式字段，property.formula 包含公式内容
    const tableFormula = await this.getTableFormula();

    // 3. 对比差异，以用户调整为准
    if (tableFormula && tableFormula !== systemFormula) {
      // 4. 更新系统存储的公式
      await this.updateSystemFormula(tableFormula);
      // 5. 解析公式，更新权重配置
      const weights = this.parseFormula(tableFormula);
      await this.updateWeights(weights);
    }
  }

  private getDefaultFormula(): string {
    return '(totalCount * 0.5) + (largeTenantRatio * 0.3) + ((10 - avgScore) * 0.2)';
  }

  // 解析公式提取权重：
  // totalCountMatch → weights.count
  // largeTenantRatioMatch → weights.largeTenant
  // avgScoreMatch → weights.quality
}
```

---

## 8. 定时任务

### 8.1 周度任务

**路由**：`/api/cron/sync`（GET/POST）
**触发**：Vercel Cron，用户配置的 weeklyCron

```typescript
// sync/route.ts

async function runSyncTask(): Promise<SyncResult> {
  // 1. 多用户支持：遍历所有 KV 配置
  // 2. 数据拉取（Adapter 模式，支持 API/Excel/Webhook）
  // 3. 去重（按时间范围查询已有 feedbackId）
  // 4. 批量 AI 打标（50 条/批，标签缓存 5 分钟）
  // 5. 生成每日报告（写入 TOP_ISSUES 表）— 保留
  // 6. 发送周报通知卡片
  // 7. 生成周报文档（POST /api/documents/weekly）
}
```

### 8.2 月度任务

**路由**：`/api/cron/monthly`（GET/POST）
**触发**：Vercel Cron，用户配置的 monthlyCron
**超时保护**：`maxDuration = 120`

```typescript
// monthly/route.ts

async function handleMonthlyTaskSingleUser(): Promise<MonthlyTaskResult> {
  // 1. 标签自进化（TagEvolution.execute()）
  // 2. Top 问题生成（TopIssuesGenerator.generate()）
  // 3. 公式同步（FormulaSync.sync()）
  // 4. 生成会议文档（飞书文档）
  // 5. 发送月报通知卡片
}
```

### 8.3 月报文档

**路由**：`/api/documents/monthly`（GET/POST）

```typescript
async function generateMonthlyReport(year?, month?): Promise<MonthlyReportResult> {
  // 1. 读取当月反馈
  // 2. 计算 NPS（推荐者≥4 / 被动者=3 / 贬损者≤2）
  // 3. 标签自进化
  // 4. Top 问题生成
  // 5. 生成飞书文档
  // 6. 保存到分析表
  // 7. 发送通知
}
```

### 8.4 周报文档

**路由**：`/api/documents/weekly`（GET/POST）

```typescript
async function generateWeeklyReport(weekOffset?): Promise<WeeklyReportResult> {
  // 1. 读取当周反馈
  // 2. 计算 NPS
  // 3. 统计 Top 5 问题
  // 4. 生成飞书文档（每次新建）
  // 5. 保存到分析表
  // 6. 发送通知
}
```

---

## 9. Bot 通知

### 9.1 消息发送

```typescript
// src/lib/feishu/bot.ts

// 基础发送
sendMessage(options: SendMessageOptions): Promise<messageId>
sendTextMessage(receiveId, text): Promise<messageId>
sendPostMessage(receiveId, title, content): Promise<messageId>
sendCardMessage(receiveId, card): Promise<messageId>
```

### 9.2 周报卡片

```typescript
createWeeklyReportCard({
  weekNumber,           // 如 "2026年第25周"
  totalFeedbacks,       // 本周拉取数
  reviewCount,          // 待审核数
  topIssues,            // Top 5 问题 [{tag1, tag2, tag3, count, pct}]
  scoreDistribution,    // 评分分布 [{score, pct}]
  bitableUrl,
  logPlatformUrl,
  hasNeedLogCheck,      // 是否有需查日志的反馈
  hasReviewNeeded,      // 是否有待审核反馈
}): InteractiveMessageContent
```

卡片结构：
- 标题：`📊 【Feelgood 打标周报】${weekNumber}`
- 概览：拉取数 + 待审核数
- Top 5 问题：`tag3 (tag2) - count次 (pct%)`
- 评分分布：`1分占X% | 2-3分占X% | 4-5分占X%`
- 按钮：审核标签（有条件）/ 完整看板 / 查看日志平台（有条件）
- 警告：待审核 > 100 时红色警告

### 9.3 月报卡片

```typescript
createMonthlyReportCard({
  periodName,
  topIssueUrl,
  documentUrl,
  dashboardUrl,
  mergeCount,    // 合并组数
  splitCount,    // 拆分组数
}): InteractiveMessageContent
```

### 9.4 其他卡片

| 卡片 | 函数 | 用途 |
|------|------|------|
| NPS 分析报告 | `createAnalysisCard()` | 月分析体系，含 NPS 得分/评分分布/标签统计 |
| 评分分布详情 | `createScoreDistributionCard()` | 独立评分分布可视化 |
| 入群欢迎 | `createOnboardingCard()` | 机器人入群自动发送 |
| 命令帮助 | `createHelpCard()` | `/nps help` 快捷命令 |

### 9.5 Bot 命令

| 命令 | 功能 |
|------|------|
| `/nps help` | 显示帮助 |
| `/nps report` | NPS 报告 |
| `/nps analysis [周期]` | 周期分析 |
| `/nps feedback [数量]` | 反馈列表 |
| `/nps config` | 系统配置 |

### 9.6 Excel 文件接收

Bot 接收 `.xlsx` 文件 → 解析 → 标记"待打标" → 提示用户输入 `/nps tag` 执行。

---

## 10. Adapter 架构

### 10.1 存储适配器

```typescript
// src/lib/storage/base-storage.ts

interface StorageAdapter {
  getType(): string;
  testConnection(): Promise<{ success: boolean; message: string }>;
  createRecord(tableId, fields): Promise<BitableRecord>;
  batchCreateRecords(tableId, records): Promise<BitableRecord[]>;
  updateRecord(tableId, recordId, fields): Promise<BitableRecord>;
  batchUpdateRecords(tableId, records): Promise<BitableRecord[]>;
  deleteRecord(tableId, recordId): Promise<void>;
  listRecords(tableId, params?): Promise<BitableRecord[]>;
  searchRecords(tableId, fieldName, fieldValue): Promise<BitableRecord[]>;
  searchRecordsFuzzy(tableId, fieldName, fieldValue): Promise<BitableRecord[]>;
  loadAllToMap(tableId, keyField?): Promise<Map<string, BitableRecord>>;
  listRecordsByTimeRange(tableId, timeField, start, end): Promise<BitableRecord[]>;
  getTableFields(tableId): Promise<Array<{field_id, field_name, type}>>;
  listTables(): Promise<Array<{table_id, name}>>;
  createTable(name, fields): Promise<string>;
  addField(tableId, fieldName, fieldType, property?): Promise<void>;
}
```

```typescript
// src/lib/feishu/constants.ts — 表名常量

export const TABLE_NAMES = {
  FEEDBACK: 'feedback',
  TAGS: 'tags',          // 兼容别名
  TAG1: 'tag1',          // 独立表
  TAG2: 'tag2',          // 独立表
  TAG3: 'tag3',          // 独立表
  TENANTS: 'tenants',
  TOP_ISSUES: 'top_issues',
} as const;
```

实现：`FeishuStorageAdapter`（`feishu-storage.ts`）

### 10.2 通知适配器

```typescript
// src/lib/notification/base-notification.ts

interface NotificationAdapter {
  getType(): string;
  testConnection(): Promise<{ success: boolean; message: string }>;
  sendText(channel, content): Promise<boolean>;
  sendCard(channel, card): Promise<boolean>;
  sendToMultiple(channelIds, card): Promise<void>;
  sendPost(channel, title, content): Promise<boolean>;
}
```

实现：`FeishuNotificationAdapter`（`feishu-notification.ts`）

### 10.3 文档适配器

```typescript
// src/lib/document/base-document.ts

interface DocumentAdapter {
  getType(): string;
  testConnection(): Promise<{ success: boolean; message: string }>;
  create(title, content): Promise<{ documentId, url }>;
  append(documentId, content, position?): Promise<void>;
  update(documentId, content): Promise<void>;
  getContent(documentId): Promise<string>;
  delete(documentId): Promise<void>;
}
```

实现：`FeishuDocumentAdapter`（`feishu-document.ts`），支持 Markdown → 飞书 Block 转换

### 10.4 工厂与默认实例

```typescript
// src/lib/adapter-factory.ts

class AdapterFactory {
  static createStorage(type?): StorageAdapter;
  static createNotification(type?): NotificationAdapter;
  static createDocument(type?): DocumentAdapter;
}

// 单例模式
getDefaultStorage()       // FeishuStorageAdapter
getDefaultNotification()  // FeishuNotificationAdapter
getDefaultDocument()      // FeishuDocumentAdapter
```

### 10.5 数据源适配器

```typescript
// src/lib/data-sources/adapter-factory.ts

class AdapterFactory {
  static create(config: DataSourceConfig): DataSourceAdapter;
  static createFromEnv(): DataSourceAdapter | null;
}
```

四种实现：`ApiAdapter`、`ExcelAdapter`、`WebhookAdapter`、`DatabaseAdapter`

---

## 11. 配置中心 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/config` | GET | 获取当前用户配置（敏感字段脱敏） |
| `/api/config` | PUT | 保存配置 |
| `/api/config/test-feishu` | POST | 测试飞书连接 |
| `/api/config/test-datasource` | POST | 测试数据源连接 |
| `/api/config/test-llm` | POST | 测试 AI 模型连接 |
| `/api/config/excel` | POST | 上传 Excel 文件 |
| `/api/cron/sync` | GET/POST | 手动触发周度任务 |
| `/api/cron/monthly` | GET/POST | 手动触发月度任务 |
| `/api/documents/weekly` | GET/POST | 生成/获取周报 |
| `/api/documents/monthly` | GET/POST | 生成/获取月报 |
| `/api/webhook/feishu` | POST | 飞书 Bot 回调 |
| `/api/webhook/feelgood` | POST | FeelGood 数据回调 |
| `/api/feedback` | GET | 查询反馈列表 |
| `/api/tags` | GET | 查询标签列表 |
| `/api/tenants` | GET | 查询租户信息 |
| `/api/analysis` | GET | 获取分析结果 |
| `/api/notify` | POST | 发送通知 |
| `/api/setup` | POST | 初始化配置 |

---

## 12. 前端架构

### 12.1 页面结构

```
src/app/
├── page.tsx                    # 首页（功能介绍 + Mermaid 架构图）
├── admin/page.tsx              # 配置中心入口
└── api/                        # API 路由（见上节）

src/components/
├── admin/
│   ├── ConfigCenter.tsx        # 配置中心主组件（3 Tabs）
│   └── config-center/
│       ├── IntegrationTab.tsx  # Tab 1: 连接与集成
│       ├── AiTagsTab.tsx       # Tab 2: AI 与标签
│       ├── OpsTab.tsx          # Tab 3: 任务与运营
│       ├── use-config-center.ts
│       ├── use-config-actions.ts
│       ├── config-updaters.ts
│       ├── schedule-utils.ts
│       └── types.ts
├── home/
│   ├── FeatureCard.tsx
│   └── RoleCards.tsx
└── Mermaid*.tsx                # Mermaid 图表渲染
```

### 12.2 配置中心 Tabs

**Tab 1 - 连接与集成**：
- 飞书应用凭据（App ID、App Secret）
- 多维表格（新建或绑定已有）
- 数据源配置（API/Excel）
- Webhook 地址展示

**Tab 2 - AI 与标签**：
- AI 模型配置（预设/自定义）
- Tag1 一级标签管理（增删改查）
- Tag2 预设
- 打标规则（置信度阈值、大租户定义）

**Tab 3 - 任务与运营**：
- 数据拉取周期（可配置 Cron）
- 月度分析周期（可配置 Cron）
- 日志平台 URL
- 通知群配置
- 表格管理员配置
- "立即执行"按钮

---

## 13. 开发计划

| 阶段 | 内容 | 预估时间 |
|------|------|----------|
| Week 1 | 项目初始化、Vercel KV 封装、飞书 SDK 封装 | 2 天 |
| Week 1-2 | 多维表格创建 API、标签体系初始化 | 2 天 |
| Week 2 | AI 打标引擎（tag prompt、批量处理、标签缓存） | 2 天 |
| Week 2-3 | 数据拉取同步（API + Excel + Webhook + Database）、租户补充 | 1.5 天 |
| Week 3 | Bot 通知（周报/月报卡片、命令处理、文件接收） | 1.5 天 |
| Week 3 | 标签自进化（合并/拆分检测与执行） | 1 天 |
| Week 3-4 | 定时任务、多用户调度、配置中心页面 | 2 天 |
| Week 4 | 联调、测试、修复 | 1.5 天 |

**预计总工期**：约 4 周

---

*文档版本：v2*
*创建时间：2026-06-22*
*基于代码实际实现生成*
