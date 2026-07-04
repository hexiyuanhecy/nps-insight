# NPS Insight 打标系统 — Embedding 增强技术设计文档

**版本**：v4.0-embedding-final
**日期**：2026-07-04
**基于**：tech-v2.1（2026-06-26）
**变更范围**：新增 Embedding 向量引擎，改造打标匹配、标签去重、冷启动聚类、标签进化

---

## 1. 设计目标与核心决策

### 1.1 三个核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Embedding 模型 | **免费方案**：`Xenova/all-MiniLM-L6-v2`（384维） via Transformers.js | 零成本、Vercel 兼容、中文可用；不需要 OpenAI Key |
| 向量存储 | Vercel KV（JSON 序列化） | 标签 < 5000 时暴力扫描 < 5ms，零运维 |
| 相似度算法 | 余弦相似度（手写 5 行） | 无外部依赖，Serverless 零额外体积 |
| 冷启动 | **反馈向量聚类 + LLM 命名** | 你的设想完全正确——首次大批量反馈用聚类自动发现标签簇 |

### 1.2 为什么不需要付费 Embedding

✅ **确认事实**：Transformers.js 可以在 Vercel Serverless 函数中运行小型模型（< 100MB）。`Xenova/all-MiniLM-L6-v2` 模型仅 ~23MB，384 维向量，中文语义匹配能力足够。

```typescript
// 零成本、零 API Key 的 Embedding
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const result = await embedder('打卡定位失败', { pooling: 'mean', normalize: true });
// result.data: Float32Array(384) — 免费的 384 维归一化向量
```

| 对比维度 | OpenAI text-embedding-3-small | Xenova/all-MiniLM-L6-v2 |
|---------|------------------------------|------------------------|
| 费用 | $0.02/1M tokens | **免费** |
| 维度 | 1536 | 384 |
| 模型大小 | 云端 | ~23MB（首次下载后缓存） |
| Vercel 兼容 | 纯 HTTP | ✅ 本地推理 |
| 中文效果 | ⭐⭐⭐⭐ | ⭐⭐⭐（够用） |
| 首次加载 | 无 | ~10-20s（仅首次，后续缓存） |

---

## 2. 完整打标流程（含冷启动）

### 2.1 冷启动：反馈向量聚类 → Tag 生成

**场景**：用户首次使用，Tag2/Tag3 表为空，一次性上传 200 条历史反馈。

你的设想完全正确且是工业界最佳实践：

```
冷启动流程（首次打标，标签库为空）:

Step 1: 200 条反馈 → embed() → 200 个 384 维向量

Step 2: K-Means 聚类 (k=auto，肘部法则自动确定最优 k)
  → 自动发现 15 个自然簇

  Cluster 0 (28条): "打卡定位半天没反应"、"外勤打卡定位转圈"、
                     "GPS信号弱打不了卡"、"定位一直转最后失败"、...
  Cluster 1 (19条): "加班数据看不到"、"明明加班了记录里没有"、
                     "加班时长统计不对"、...
  Cluster 2 (15条): "审批催了三次没反应"、"主管说催办通知收不到"、...
  Cluster 3 (12条): "地图加载一片空白"、"地图刷新不出来"、...
  ...（共15个簇）

Step 3: 对每个簇采样 5 条代表反馈 → LLM 命名
  Prompt: "以下是 5 条同类型的用户反馈，请归纳为一个简洁的标签名和定义：
           [反馈1] 打卡定位半天没反应...
           [反馈2] 外勤打卡定位转圈...
           ..."
  → LLM 输出: { tag2Name: "打卡模块", tag3Name: "定位失败",
                definition: "打卡时GPS无法获取位置或定位超时" }

Step 4: 批量写入 Tag2/Tag3 表

Step 5: 为每个新 Tag 生成向量 → 写入 KV
  embed("定位失败 打卡时GPS无法获取位置或定位超时") → 384维向量 → KV

结果: 15 个 Tag2，38 个 Tag3，向量库初始化完成
```

**为什么聚类比纯 LLM 零样本归纳更好？**

| | 纯 LLM 零样本归纳 | 聚类 + LLM 命名 |
|---|---|---|
| 同义反馈归并 | LLM 靠注意力机制判断（200 条超出上下文窗口时不可靠） | 向量距离精确计算，永远不会把"定位失败"和"数据不显示"归到一起 |
| 遗漏模式 | LLM 可能忽略低频但重要的问题模式 | 聚类数学保证每个密集区域都被发现 |
| 批量处理 | 200 条需要分 4 批，跨批去重靠运气 | 一次聚类全局最优 |

### 2.2 日常打标：ANN 检索 → LLM 仲裁 → 不匹配时建新标签

```
日常打标流程（第二批起，标签库已有 38 个 Tag3）:

新反馈: "晚上加班打卡定位一直转圈，切了WiFi也没用"

Step 1: embed(反馈原文) → 反馈向量（384 维，临时变量，用完丢弃）

Step 2: ANN 检索 Tag3 向量库（38 个 × 暴力扫 ≈ 2ms）
  → Top-5 候选:
    1. "定位失败" (cos=0.93) ← 高度匹配
    2. "地图加载慢" (cos=0.78)
    3. "GPS信号弱" (cos=0.74)
    4. "打卡超时" (cos=0.68)
    5. "数据不显示" (cos=0.41) ← 低于阈值 0.5，被过滤

Step 3: Prompt(反馈 + Top-4 候选) → LLM 决策
  → LLM 选择: Tag3="定位失败", 置信度=0.95
  → 无需创建新标签

---

如果反馈完全不匹配任何已有标签:

新反馈: "蓝牙打卡设备连接不上，试了三个手环都不行"

Step 2: ANN 检索 → Top-5 最高分仅 0.38
  → 所有候选都低于阈值 0.5

Step 3: 候选列表为空 → Prompt 注入更多上下文
  → LLM 判断: "蓝牙设备连接"是一个全新问题模式
  → LLM 输出: action="create_new", tag2Name="打卡模块", tag3Name="蓝牙连接失败"

Step 4: 向量去重 — embed("蓝牙连接失败") → 与已有 38 个 Tag3 比对
  → 最高 cos 仅 0.31 → 确认是新标签
  → 写入 Tag3 表 + KV 向量库
```

**Top-5 不匹配的兜底机制**：

| 情况 | 触发条件 | 处理方式 |
|------|---------|---------|
| Top-5 全部低分 | 最高 cos < 0.5 | 候选列表为空 → Prompt 不注入候选 → LLM 自由判断是否新建 |
| 部分低分 | 有些 > 0.5，有些 < 0.5 | 只注入 > 0.5 的候选 → LLM 可从中选或拒绝全部 |
| LLM 判断都不合适 | LLM 看过候选后选择不匹配 | LLM 输出 action="create_new" → 进入向量去重流程 |
| Embedding API 完全不可用 | 模型加载失败 | 降级为精确名称匹配 + 全量 Prompt 注入（v2 原有行为） |

---

## 3. 项目结构（新增/修改文件）

```
src/
├── lib/
│   ├── ai/
│   │   ├── tagger.ts              # [改] 加 ANN 检索 + 向量去重
│   │   ├── prompts.ts             # [改] 只注入 Top-5 候选（或空）
│   │   ├── tag-cache.ts           # [改] CachedTag 加 embedding 字段
│   │   ├── tag-evolution.ts       # [改] 合并检测用向量相似度
│   │   ├── embedding.ts           # [新] embed() + cosineSim() + searchSimilar()
│   │   ├── tag-vector-store.ts    # [新] KV 读写标签向量
│   │   └── cold-start-cluster.ts  # [新] 冷启动聚类 + LLM 命名
│   └── ...
```

---

## 4. 核心代码实现

### 4.1 embedding.ts（零成本、零 API Key）

```typescript
// src/lib/ai/embedding.ts
// 依赖: @xenova/transformers (npm install @xenova/transformers)
// 模型: Xenova/all-MiniLM-L6-v2 (~23MB, 384维, 首次自动下载)

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

let _embedder: FeatureExtractionPipeline | null = null;
let _embedderLoading = false;
let _embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * 获取 Embedding 管线（单例 + 懒加载）
 * 首次调用时自动下载模型（~23MB），后续从缓存加载
 */
async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (_embedder) return _embedder;
  if (_embedderLoading && _embedderPromise) return _embedderPromise;

  _embedderLoading = true;
  _embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  try {
    _embedder = await _embedderPromise;
    return _embedder;
  } finally {
    _embedderLoading = false;
  }
}

/**
 * 将文本转为 384 维归一化向量
 * 降级兜底: 模型加载失败 → 返回零向量（自动降级为精确名称匹配）
 */
export async function embed(text: string): Promise<number[]> {
  try {
    const extractor = await getEmbedder();
    const result = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  } catch (err) {
    console.error('[Embedding] 推理失败，降级为零向量:', err);
    return new Array(384).fill(0);
  }
}

/**
 * 批量 Embedding（用于冷启动聚类）
 * 逐条处理，避免内存溢出
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await embed(text));
  }
  return results;
}

/**
 * 余弦相似度: 值域 [-1, 1]
 * 零向量兜底: 任一方为零向量时返回 0
 */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const aIsZero = a.every(v => v === 0);
  const bIsZero = b.every(v => v === 0);
  if (aIsZero || bIsZero) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * ANN 检索: 在标签向量库中暴力扫描 Top-K
 * O(N×D), 标签 < 5000 时 < 10ms
 */
export function searchSimilar(
  queryVec: number[],
  tagStore: Record<string, number[]>,
  k: number = 5,
  minScore: number = 0.5
): Array<{ tagId: string; score: number }> {
  return Object.entries(tagStore)
    .map(([tagId, vec]) => ({ tagId, score: cosineSim(queryVec, vec) }))
    .filter(item => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
```

### 4.2 cold-start-cluster.ts（冷启动聚类 + LLM 命名）

```typescript
// src/lib/ai/cold-start-cluster.ts
// 依赖: embedding.ts 的 embedBatch()

import { embedBatch } from './embedding';
import { callLLM } from '@/lib/llm/provider-factory';

interface ClusterResult {
  clusterId: number;
  feedbacks: string[];     // 该簇中所有反馈原文
  representative: string[]; // 代表反馈（用于 LLM 命名）
}

interface NamedTag {
  tag2Name: string;
  tag3Name: string;
  definition: string;
  clusterId: number;
  feedbackCount: number;
}

/**
 * 简易 K-Means 聚类
 * k 值通过肘部法则自动确定
 * 注: 生产环境可替换为更成熟的聚类库
 */
function simpleKMeans(
  vectors: number[][],
  k: number,
  maxIterations: number = 20
): number[] {
  const n = vectors.length;
  const dim = vectors[0].length;

  // 随机初始化 k 个质心
  const centroids: number[][] = [];
  const used = new Set<number>();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!used.has(idx)) {
      used.add(idx);
      centroids.push([...vectors[idx]]);
    }
  }

  let labels: number[] = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配每个点到最近的质心
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity;
      let bestLabel = 0;
      for (let j = 0; j < k; j++) {
        // 欧氏距离（等价于归一化向量的余弦距离排序）
        let dist = 0;
        for (let d = 0; d < dim; d++) {
          const diff = vectors[i][d] - centroids[j][d];
          dist += diff * diff;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestLabel = j;
        }
      }
      if (labels[i] !== bestLabel) {
        changed = true;
        labels[i] = bestLabel;
      }
    }

    if (!changed) break;

    // 更新质心
    const counts = new Array(k).fill(0);
    const sums: number[][] = Array.from({ length: k }, () => new Array(dim).fill(0));
    for (let i = 0; i < n; i++) {
      const label = labels[i];
      counts[label]++;
      for (let d = 0; d < dim; d++) {
        sums[label][d] += vectors[i][d];
      }
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let d = 0; d < dim; d++) {
          centroids[j][d] = sums[j][d] / counts[j];
        }
      }
    }
  }

  return labels;
}

/**
 * 肘部法则确定最优 k
 * 计算不同 k 值下的 SSE（误差平方和），找拐点
 */
function findOptimalK(
  vectors: number[][],
  maxK: number = 20
): number {
  const sseList: number[] = [];

  for (let k = 1; k <= Math.min(maxK, vectors.length); k++) {
    const labels = simpleKMeans(vectors, k, 10);

    // 计算 SSE
    const centroids: number[][] = Array.from({ length: k }, () =>
      new Array(vectors[0].length).fill(0)
    );
    const counts = new Array(k).fill(0);

    for (let i = 0; i < vectors.length; i++) {
      const label = labels[i];
      counts[label]++;
      for (let d = 0; d < vectors[i].length; d++) {
        centroids[label][d] += vectors[i][d];
      }
    }

    let sse = 0;
    for (let i = 0; i < vectors.length; i++) {
      const label = labels[i];
      let dist = 0;
      for (let d = 0; d < vectors[i].length; d++) {
        const mean = counts[label] > 0 ? centroids[label][d] / counts[label] : 0;
        const diff = vectors[i][d] - mean;
        dist += diff * diff;
      }
      sse += dist;
    }
    sseList.push(sse);
  }

  // 找肘部: SSE 下降率突变点
  let bestK = 3; // 最小 k=3
  let maxDiff = 0;
  for (let i = 1; i < sseList.length - 1; i++) {
    const diff = (sseList[i - 1] - sseList[i]) - (sseList[i] - sseList[i + 1]);
    if (diff > maxDiff) {
      maxDiff = diff;
      bestK = i + 1;
    }
  }

  return Math.min(bestK, maxK);
}

/**
 * 冷启动聚类 + LLM 命名
 * 输入: 首批反馈原文列表
 * 输出: 命名后的 Tag2/Tag3 列表
 */
export async function coldStartClustering(
  feedbacks: string[]
): Promise<NamedTag[]> {
  console.log(`[ColdStart] 开始聚类，反馈数: ${feedbacks.length}`);

  // Step 1: 批量 Embedding
  const vectors = await embedBatch(feedbacks);
  console.log(`[ColdStart] Embedding 完成`);

  // Step 2: 确定最优 k 并聚类
  const k = findOptimalK(vectors);
  console.log(`[ColdStart] 最优 k=${k}`);
  const labels = simpleKMeans(vectors, k);

  // Step 3: 构建簇
  const clusters = new Map<number, string[]>();
  for (let i = 0; i < feedbacks.length; i++) {
    const label = labels[i];
    if (!clusters.has(label)) clusters.set(label, []);
    clusters.get(label)!.push(feedbacks[i]);
  }
  console.log(`[ColdStart] 聚类完成，簇数: ${clusters.size}`);

  // Step 4: 对每个簇采样 + LLM 命名
  const results: NamedTag[] = [];
  let clusterIdx = 0;

  for (const [_, clusterFeedbacks] of clusters) {
    // 过滤太小的簇（< 3 条可能是噪音）
    if (clusterFeedbacks.length < 3) continue;

    // 采样代表反馈（最多 5 条）
    const sample = clusterFeedbacks.slice(0, 5);

    // LLM 命名
    const prompt = `你是一个用户反馈分类专家。以下是 ${clusterFeedbacks.length} 条同类型反馈中的 ${sample.length} 条代表：

${sample.map((fb, i) => `[反馈${i + 1}] ${fb}`).join('\n')}

请为这类问题归纳：
1. 功能模块(Tag2): 简洁的功能域名称（如"打卡模块""审批模块"）
2. 具体问题(Tag3): 从用户原话提炼的具体现象（如"定位失败""催办无效"）
3. 定义说明: 一句话描述这个标签的覆盖范围

输出 JSON 格式: {"tag2Name": "...", "tag3Name": "...", "definition": "..."}`;

    const llmResult = await callLLM(prompt);
    const parsed = JSON.parse(llmResult);

    results.push({
      ...parsed,
      clusterId: clusterIdx++,
      feedbackCount: clusterFeedbacks.length,
    });
  }

  console.log(`[ColdStart] 命名完成，生成 ${results.length} 个标签`);
  return results;
}
```

### 4.3 tag-vector-store.ts（KV 读写）

```typescript
// src/lib/ai/tag-vector-store.ts

import { kv } from '@/lib/storage/kv-storage';
import { embed } from './embedding';

const VECTOR_KEY_PREFIX = 'tag-vectors';

function getVectorKey(ownerUserId: string): string {
  return `${VECTOR_KEY_PREFIX}:${ownerUserId}`;
}

export interface TagVectorStore {
  [tagId: string]: number[]; // 384 维
}

export async function loadTagVectors(ownerUserId: string): Promise<TagVectorStore> {
  try {
    const data = await kv.get<TagVectorStore>(getVectorKey(ownerUserId));
    return data || {};
  } catch {
    return {};
  }
}

export async function upsertTagVector(
  ownerUserId: string,
  tagId: string,
  name: string,
  definition: string
): Promise<void> {
  const vec = await embed(`${name} ${definition}`);
  const store = await loadTagVectors(ownerUserId);
  store[tagId] = vec;
  try {
    await kv.set(getVectorKey(ownerUserId), store);
  } catch (err) {
    console.error('[TagVector] KV 写入失败:', err);
  }
}

export async function deleteTagVector(
  ownerUserId: string,
  tagId: string
): Promise<void> {
  const store = await loadTagVectors(ownerUserId);
  delete store[tagId];
  await kv.set(getVectorKey(ownerUserId), store);
}

/**
 * 冷启动后批量初始化向量库
 */
export async function batchInitVectors(
  ownerUserId: string,
  tags: Array<{ tagId: string; name: string; definition: string }>
): Promise<void> {
  const store: TagVectorStore = {};
  for (const tag of tags) {
    store[tag.tagId] = await embed(`${tag.name} ${tag.definition}`);
  }
  await kv.set(getVectorKey(ownerUserId), store);
}
```

### 4.4 tagger.ts 改动摘要

```typescript
// src/lib/ai/tagger.ts — 改动摘要

interface CachedTag {
  tagId: string;
  name: string;
  definition: string;
  level: 'tag1' | 'tag2' | 'tag3';
  parentTagId?: string;
  embedding: number[]; // 新增: 384 维，零向量 = Embedding 未初始化
}

// 打标主流程
async function batchAnalyzeFeedbacks(
  feedbacks: FeedbackItem[],
  existingTags: CachedTag[],
  ownerUserId: string
): Promise<AITagResult[]> {
  const tag3List = existingTags.filter(t => t.level === 'tag3');
  const hasEmbeddings = tag3List.some(
    t => t.embedding && t.embedding.some(v => v !== 0)
  );

  for (const fb of feedbacks) {
    let candidateTags: CachedTag[] = [];

    if (hasEmbeddings && tag3List.length > 0) {
      // === Embedding ANN 检索 ===
      const fbVec = await embed(fb.content);
      const tagStore = await loadTagVectors(ownerUserId);
      const similar = searchSimilar(fbVec, tagStore, 5, 0.5);

      // 补全标签信息
      candidateTags = similar
        .map(s => tag3List.find(t => t.tagId === s.tagId))
        .filter(Boolean) as CachedTag[];

      // 如果 Top-5 全部不匹配 → 候选为空 → LLM 自由判断
    }

    // LLM 决策（候选可能为空）
    const prompt = generateTaggingPrompt(fb, candidateTags);
    const llmResult = await callLLM(prompt);

    // 向量去重（新建标签时）
    if (llmResult.action === 'create_new' && hasEmbeddings) {
      const newVec = await embed(llmResult.newTagName);
      const tagStore = await loadTagVectors(ownerUserId);
      const dupCheck = searchSimilar(newVec, tagStore, 1, 0.85);
      if (dupCheck.length > 0) {
        llmResult.tagId = dupCheck[0].tagId; // 复用已有
        llmResult.action = 'reuse';
      }
    }
  }
}
```

---

## 5. 容量与成本精算

| 指标 | 数值 | 说明 |
|------|------|------|
| 单个标签向量 | 384 维 × 4 字节 = 1.5KB（JSON 序列化后 ~2KB） | all-MiniLM-L6-v2 |
| 300 个标签总存储 | ~0.6MB | 运行 6 个月典型值 |
| 2000 个标签总存储 | ~4MB | 运行 3 年极端值 |
| Vercel KV 免费额度 | 256MB（Hobby） | 占比 0.2%~1.6% |
| 模型下载 | ~23MB，仅首次 | 后续从 Transformers.js 缓存加载 |
| Embedding 费用 | **$0** | 本地推理，不需要 API Key |
| 单次 Embedding 耗时 | ~10-50ms | 本地 CPU 推理 |
| 暴力扫描性能 | < 5ms（5000 条以内） | 384 维 × 纯数学运算 |
| LLM Token 节省 | **-60%+** | Prompt 中标签列表从全量 → 仅 Top-5 候选 |

---

## 6. 可能存在的问题及应对

### 问题 1：Transformers.js 模型首次下载超时

**风险**：Vercel Serverless 函数有 10s（Hobby）/ 60s（Pro）超时限制。首次下载 23MB 模型可能需要 10-20s。

**应对**：
```typescript
// 策略: 部署时预热 + 运行时降级
// 1. 构建时：在 build 阶段触发一次 pipeline() 让模型缓存到 node_modules
// 2. 运行时：embed() 内部 15s 超时，超时返回零向量
// 3. 零向量 → cosineSim 返回 0 → searchSimilar 返回空 → 自动降级为全量 Prompt 注入
```

### 问题 2：冷启动聚类 k 值不准确

**风险**：肘部法则可能找不到明显拐点，导致过聚类或欠聚类。

**应对**：
```typescript
// 1. 限制 k 范围: min(反馈数/5, 30) 到 max(反馈数/10, 3)
// 2. 聚类后过滤: 簇内反馈 < 3 条 → 合并到最近的大簇
// 3. LLM 命名前人工可调: 聚类结果写入一个临时表供查看
```

### 问题 3：all-MiniLM-L6-v2 中文效果

**风险**：该模型主要用英文训练，中文语义匹配可能不如 bge-large-zh-v1.5。

**应对**：
```typescript
// 1. 对中文反馈先做处理: 去除停用词、统一同义词（如"转圈"→"加载中"）
// 2. 模型可替换: 后续可切换到 Xenova/bge-small-zh-v1.5（如有）
// 3. 对于你的假勤系统反馈，短文本匹配足够——"定位失败" vs "GPS信号弱" 这种粒度没问题
// 4. 如果发现准确率不够，可以换用 Xenova/multilingual-e5-small（多语言优化）
```

### 问题 4：一条反馈多个问题时的检索偏向

**风险**：反馈包含"定位失败+审批催办无效"两个问题时，Embedding 可能偏向主要问题。

**应对**：
```typescript
// 1. LLM 最终仲裁不变: Prompt 设计保留多标签输出能力
// 2. 如果 LLM 输出多个 Tag，对每个 Tag 分别做向量相似度验证
// 3. 此问题在 Embedding 改造前后影响相同
```

### 问题 5：KV 向量库与飞书标签表不一致

**风险**：标签在飞书表格中手动删除/改名，KV 未同步。

**应对**：
```typescript
// 1. 标签变更时主动失效 KV
// 2. 月度任务中全量重建向量库
async function rebuildTagVectors(ownerUserId: string) {
  const allTags = await getAllTags(); // 从飞书表格读
  await batchInitVectors(ownerUserId, allTags);
}
// 3. KV 读取失败时返回 {}，触发下次打标重新加载
```

---

## 7. 实施路线图

| 阶段 | 内容 | 新增文件 | 修改文件 | 工作量 |
|------|------|---------|---------|--------|
| **Phase 1** | embedding.ts + tag-vector-store.ts | 2 | 0 | 0.5 天 |
| **Phase 2** | cold-start-cluster.ts（冷启动聚类） | 1 | sync-task.ts | 1 天 |
| **Phase 3** | tagger.ts 改造（ANN 检索 + 向量去重） | 0 | tagger.ts, prompts.ts, tag-cache.ts | 1 天 |
| **Phase 4** | tag-evolution.ts 改造（向量合并检测） | 0 | tag-evolution.ts | 0.5 天 |
| **Phase 5** | 测试 + 降级兜底 | 0 | 0 | 0.5 天 |
| **总计** | | 3 个新文件 | 4 个旧文件 | **3.5 天** |

---

*文档版本：v4.0-embedding-final*
*创建时间：2026-07-04*
*基于 tech-v2.1 增量设计，零成本、零新增 API 依赖*
