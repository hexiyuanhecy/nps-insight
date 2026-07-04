# Embedding 向量打标 Spec

## 可行性结论：条件可行（Conditional GO）

**总体判断**：技术方案成熟、基础设施就绪、降级兜底完善，可以落地。但有 3 个关键风险必须在 Phase 1 阶段验证通过后再进入后续阶段。

---

## 一、可行性分析

### ✅ 支持可行的理由（5 条）

#### 1. 基础设施已就绪
- **KV 存储**：生产环境使用 Upstash Redis 真实持久化，`getValue/setValue` 已封装好，384 维向量 JSON 序列化后约 2KB/标签，5000 标签仅占 ~10MB，远低于 256MB 免费额度。
- **cosineSimilarity 已实现**：`src/lib/ai/semantic-cache.ts` 第 94-110 行已有手写余弦相似度，且有单元测试覆盖，可直接复用。
- **KV 索引模式已验证**：语义缓存的「索引列表 + 详情键」读写模式，可直接套用到标签向量检索。

#### 2. 痛点真实且收益明确
当前 [tagger.ts](file:///Users/xigua/ai%20Projects/nps-insight/src/lib/ai/tagger.ts) 中 `batchAnalyzeFeedbacks` 将 **全量标签** 注入 Prompt：
```handlebars
【已有标签】
Tag1: {{join tag1List ", "}}
Tag2: {{join tag2List ", "}}
Tag3: {{join tag3List ", "}}
```
随标签库增长（设计预估 Tag3 可达数百到数千），每批次 token 成本线性增加，LLM 在长标签列表中漏选/错选概率上升。Embedding Top-K 候选注入可将 Prompt 中标签列表从「全量」缩减到「Top-5 候选」，**预估 token 节省 60%+**。

#### 3. 零成本零依赖
- `Xenova/all-MiniLM-L6-v2` 模型仅 ~23MB，本地推理，**无需额外 API Key、无需付费**。
- 首次下载后从 Transformers.js 缓存加载，后续推理耗时 ~10-50ms。
- 暴力扫描 5000 条 384 维向量 < 5ms，无外部向量数据库依赖。

#### 4. 降级兜底链路完善
设计文档已规划三级降级：
1. 模型加载失败 → `embed()` 返回零向量
2. 零向量 → `cosineSim` 返回 0 → `searchSimilar` 返回空
3. 候选为空 → Prompt 不注入候选 → LLM 自由判断（等价于 v2 原有行为）
**保证引入 Embedding 不会破坏现有打标流程。**

#### 5. 冷启动聚类是真实价值
当前冷启动场景：标签库为空时，200 条反馈完全靠 LLM 零样本生成标签，导致同一类问题可能产出 N 种不同表述（"定位失败"、"定位不准"、"GPS问题"），后续需大量人工合并。
K-Means 聚类 + LLM 命名是工业界最佳实践，可一次性生成一致性标签。

### ⚠️ 需要解决的风险（3 条）

#### 风险 1：Vercel 函数超时（高优先级）
- **问题**：Vercel Serverless 默认 10s 超时（Hobby），首次模型下载需 10-20s。
- **影响**：首次冷启动大概率超时，导致打标任务失败。
- **应对**：
  1. 升级 Vercel Pro（60s 超时）
  2. 或配置 `vercel.json` 中 `functions.maxDuration: 60`
  3. 或在部署后手动调用 warmup 接口预热模型
  4. 兜底：`embed()` 内部 15s 超时，超时返回零向量

#### 风险 2：Transformers.js webpack 配置（中优先级）
- **问题**：Transformers.js 依赖 ONNX runtime 的 wasm 文件，Next.js webpack 默认配置可能无法正确处理。
- **影响**：构建失败或运行时 wasm 加载失败。
- **应对**：
  1. 在 `next.config.mjs` 中添加 `transpilePackages: ['@xenova/transformers']`
  2. 配置 webpack `resolve.fallback` 处理 Node 原生模块
  3. Phase 1 阶段先验证本地 `npm run build` 通过

#### 风险 3：中文语义匹配效果（中优先级）
- **问题**：`all-MiniLM-L6-v2` 主要用英文训练，中文语义匹配可能不如 `bge-large-zh-v1.5`。
- **影响**：Top-K 候选准确率不足，导致打标质量下降。
- **应对**：
  1. Phase 1 阶段用真实中文反馈数据测试准确率
  2. 如准确率不足，切换到 `Xenova/multilingual-e5-small`（多语言优化，~47MB）
  3. 兜底：LLM 最终仲裁不变，即使候选不准也只是影响 Prompt 长度，不影响最终打标质量

### ❌ 不存在硬性不可行项
经审查，未发现技术阻断点：
- KV 存储已就绪（非内存模拟）
- 无 API Key 依赖（本地推理）
- 降级路径完整（零向量 → 空候选 → 原有行为）
- 现有测试覆盖完整（89 个用例可通过）

---

## 二、What Changes

### 新增文件
- `src/lib/ai/embedding.ts` — Embedding 推理 + 余弦相似度 + ANN 检索
- `src/lib/ai/tag-vector-store.ts` — KV 读写标签向量 + 反馈质心存储
- `src/lib/ai/cold-start-cluster.ts` — 冷启动聚类 + LLM 命名
- `src/lib/ai/tag-evolution-v2.ts` — 双向量协同自进化（合并/拆分/漂移检测）
- `src/lib/ai/evolution-snapshot.ts` — 进化快照与回滚机制
- `src/lib/diagnostics/metrics-collector.ts` — 诊断数据采集器
- `src/lib/diagnostics/tsne-cache.ts` — t-SNE 预计算与缓存
- `src/app/api/diagnostics/route.ts` — 诊断数据 API
- `src/app/api/evolution/route.ts` — 进化操作 API（检测/执行/回滚）
- `src/components/admin/config-center/DiagnosticsTab.tsx` — 诊断面板
- `src/components/admin/config-center/EvolutionTab.tsx` — 进化管理面板

### 修改文件
- `src/lib/ai/tagger.ts` — 加 ANN 检索 + 向量去重 + 反馈质心增量更新
- `src/lib/ai/prompts.ts` / `src/lib/ai/templates/tagging/batch-tagging.hbs` — 只注入 Top-5 候选
- `src/lib/ai/semantic-cache.ts` — `simpleTextFeatures` 替换为真实 `embed()`（可选优化）
- `src/app/api/cron/sync/sync-task.ts` — 冷启动路径分流 + 进化检测触发
- `src/app/api/cron/monthly/route.ts` — 月度任务加向量库重建 + 进化扫描
- `vercel.json` — 配置函数超时
- `next.config.mjs` — Transformers.js webpack 配置
- `package.json` — 新增 `@xenova/transformers` 依赖
- `src/constants/config-center.ts` — 新增诊断 Tab + 进化 Tab
- `src/components/admin/ConfigCenter.tsx` — 新增 Tab 注册

### 不改动
- `src/lib/ai/tagger-tool-based.ts`（工具调用打标引擎，独立路径）
- `src/lib/ai/user-profile.ts`（用户画像系统，独立路径）
- 飞书 Bitable 表结构（向量存 KV，不存 Bitable）

---

## 三、ADDED Requirements

### Requirement: Embedding 推理服务
系统 SHALL 提供 `embed(text: string): Promise<number[]>` 函数，将文本转为 384 维归一化向量。

#### Scenario: 正常推理
- **WHEN** 调用 `embed("打卡定位失败")`
- **THEN** 返回 384 维 Float32Array，已归一化（模长 ≈ 1）

#### Scenario: 模型加载失败降级
- **WHEN** Transformers.js 模型加载失败或超时（15s）
- **THEN** 返回 384 维零向量，记录错误日志，不抛出异常

#### Scenario: 批量推理
- **WHEN** 调用 `embedBatch(["反馈1", "反馈2", ...])`
- **THEN** 逐条处理返回向量数组，避免内存溢出

### Requirement: 标签向量存储
系统 SHALL 在 KV 中持久化标签向量，键格式为 `tag-vectors:{ownerId}`，值为 `{ [tagId]: number[] }`。

#### Scenario: 写入标签向量
- **WHEN** 新建标签时调用 `upsertTagVector(ownerId, tagId, name, definition)`
- **THEN** 向量写入 KV，不影响已有标签向量

#### Scenario: 读取向量库
- **WHEN** 打标时调用 `loadTagVectors(ownerId)`
- **THEN** 返回该用户所有标签的向量映射表

### Requirement: ANN 检索 Top-K 候选
系统 SHALL 在打标前用余弦相似度检索 Top-5 候选标签，只将候选注入 Prompt。

#### Scenario: 高匹配度
- **WHEN** 反馈向量与某标签向量余弦相似度 ≥ 0.5
- **THEN** 该标签进入候选列表

#### Scenario: 全部低分
- **WHEN** Top-5 最高分 < 0.5
- **THEN** 候选列表为空，Prompt 不注入候选，LLM 自由判断

### Requirement: 向量去重
系统 SHALL 在新建标签时用向量相似度检测重复，阈值 0.85。

#### Scenario: 检测到重复
- **WHEN** 新标签向量与已有标签向量余弦相似度 ≥ 0.85
- **THEN** 复用已有标签，不创建新标签

### Requirement: 冷启动聚类
系统 SHALL 在标签库为空且反馈数 ≥ 50 时，触发 K-Means 聚类 + LLM 命名流程。

#### Scenario: 触发冷启动
- **WHEN** `existingTags.length === 0 && untaggedRecords.length >= 50`
- **THEN** 执行聚类流程，生成标签后写入 Bitable + KV

#### Scenario: 不触发冷启动
- **WHEN** `existingTags.length > 0` 或 `untaggedRecords.length < 50`
- **THEN** 走日常打标流程

### Requirement: 反馈质心向量存储
系统 SHALL 为每个 Tag3 标签维护反馈质心向量（该标签下所有反馈的 embedding 平均值），增量更新。

#### Scenario: 增量更新
- **WHEN** 一条新反馈被打上 Tag3 标签
- **THEN** 该 Tag3 的反馈质心向量更新为 `(旧质心 × 旧数量 + 新向量) / (旧数量 + 1)`

#### Scenario: 质心持久化
- **WHEN** 质心更新后
- **THEN** 质心向量与标签向量一起存入 KV（`tag-vectors:{ownerId}` 中增加 `feedbackCentroid` 字段）

### Requirement: 双向量协同标签自进化
系统 SHALL 基于「标签定义向量 + 反馈质心向量」双向量协同，检测标签合并、拆分、漂移、层级调整。

#### Scenario: 综合相似度计算
- **WHEN** 计算两个标签的相似度
- **THEN** 综合相似度 = 标签向量相似度 × 0.4 + 反馈质心相似度 × 0.6

#### Scenario: 三态判定矩阵
- **WHEN** 两个标签的 tagSim 和 feedbackSim 已知
- **THEN** 分类为：true_duplicate（真重复，tagSim>0.85 且 feedbackSim>0.75）、pseudo_similar（伪相似，tagSim>0.85 且 feedbackSim<0.50）、hidden_duplicate（隐藏重复，tagSim<0.65 且 feedbackSim>0.80）、distinct（独立）

#### Scenario: 合并检测
- **WHEN** 检测到 true_duplicate
- **THEN** 生成合并建议，置信度 > 0.95 时自动执行

#### Scenario: 拆分检测
- **WHEN** 标签内反馈簇间距离 > 0.35 且每簇 ≥ 5 条
- **THEN** 生成分拆建议，最多拆 5 个簇

#### Scenario: 漂移检测
- **WHEN** 标签存在 > 30 天且使用次数 > 20，质心与定义向量相似度 < 0.55
- **THEN** 建议重命名；0.55~0.70 间进入观察名单

#### Scenario: 层级调整
- **WHEN** Tag3 与非父级 Tag2 的质心相似度 > 0.40
- **THEN** 建议移动到该 Tag2 下

### Requirement: 进化快照与回滚
系统 SHALL 在每次进化操作（合并/拆分/重命名/移动）前创建快照，支持回滚。

#### Scenario: 创建快照
- **WHEN** 执行进化操作前
- **THEN** 创建 EvolutionSnapshot，记录操作前的标签 ID 列表和反馈映射关系，保留 6 个月

#### Scenario: 回滚快照
- **WHEN** 用户触发回滚指定快照
- **THEN** 恢复飞书表格中的标签-反馈映射和标签表

### Requirement: 诊断数据采集
系统 SHALL 提供诊断数据采集，包含标签复用率、重复拦截、Token 节省、向量覆盖率、内聚度评分、散点图数据、进化时间线。

#### Scenario: 获取诊断数据
- **WHEN** 调用 `/api/diagnostics`
- **THEN** 返回 EmbeddingDiagnostics，包含 7 项指标

#### Scenario: 散点图渲染策略
- **WHEN** 散点图点数 ≤ 300 → SVG 渲染
- **WHEN** 点数 ≤ 1000 → Canvas 渲染
- **WHEN** 点数 > 1000 → Hexbin 聚合渲染

### Requirement: 进化操作 API
系统 SHALL 提供进化操作 API，支持检测、执行、回滚。

#### Scenario: 检测进化
- **WHEN** POST `/api/evolution` body `{ action: 'detect' }`
- **THEN** 返回所有待处理的进化建议列表

#### Scenario: 执行进化
- **WHEN** POST `/api/evolution` body `{ action: 'execute', type: 'merge'|'split'|'rename'|'move', ...params }`
- **THEN** 执行操作并返回快照 ID

#### Scenario: 回滚进化
- **WHEN** POST `/api/evolution` body `{ action: 'rollback', snapshotId }`
- **THEN** 回滚到指定快照

### Requirement: 前端诊断面板
系统 SHALL 在配置中心新增「诊断」Tab，展示指标卡片、散点图、进化时间线。

#### Scenario: 指标卡片
- **WHEN** 进入诊断面板
- **THEN** 展示 4 个指标卡片：标签复用率、重复拦截、Token 节省、向量覆盖率

#### Scenario: 散点图
- **WHEN** 进入诊断面板
- **THEN** 展示 2 个散点图：标签向量空间（按 Tag2 着色）、反馈聚类空间（按 Tag3 着色）

#### Scenario: 进化时间线
- **WHEN** 进入诊断面板
- **THEN** 展示历史进化操作时间线

### Requirement: 前端进化管理面板
系统 SHALL 在配置中心新增「进化」Tab，展示进化建议列表，支持手动确认/执行/回滚。

#### Scenario: 进化建议列表
- **WHEN** 进入进化面板
- **THEN** 展示待处理的进化建议，按类型分组（合并/拆分/漂移/层级），显示置信度

#### Scenario: 手动执行
- **WHEN** 用户点击「执行」按钮
- **THEN** 创建快照 → 执行操作 → 刷新列表

#### Scenario: 回滚
- **WHEN** 用户在历史记录中点击「回滚」
- **THEN** 回滚到指定快照

---

## 四、Impact

- **Affected specs**:
  - `ai-capability-upgrade`（AI 能力升级，embedding 是其中一环）
  - `2026-tech-review`（技术审查，embedding 是推荐项）
- **Affected code**:
  - `src/lib/ai/tagger.ts` — 打标主流程改造
  - `src/lib/ai/semantic-cache.ts` — cosineSimilarity 复用
  - `src/app/api/cron/sync/sync-task.ts` — 冷启动分流
  - `vercel.json` / `next.config.mjs` — 部署配置
- **向后兼容**：是。降级路径保证不破坏现有打标流程。
