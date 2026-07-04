<artifact_create filename="NPS-Evolution-Diagnostics-Implementation-Guide.md" mimeType="text/markdown" previewMode="auto" content="# NPS Insight — 标签自进化 & 诊断面板实施手册

**版本**：v1.0
**日期**：2026-07-04
**基于**：Embedding 增强设计 v5.0

---

## 1. 项目文件结构

```
src/
├── lib/
│   ├── ai/
│   │   ├── tag-evolution-v2.ts      # [新] 双向量协同自进化
│   │   ├── evolution-snapshot.ts    # [新] 进化快照与回滚
│   │   └── tag-vector-store.ts      # [改] 加反馈质心存储
│   ├── diagnostics/
│   │   ├── metrics-collector.ts     # [新] 诊断数据采集
│   │   └── tsne-cache.ts            # [新] t-SNE预计算与缓存
│   └── ...
├── app/
│   └── api/
│       ├── diagnostics/
│       │   └── route.ts             # [新] 诊断数据 API
│       └── evolution/
│           └── route.ts             # [新] 进化操作 API
└── components/
    └── admin/
        └── config-center/
            ├── DiagnosticsTab.tsx    # [新] 诊断面板
            ├── EvolutionTab.tsx      # [新] 进化管理面板
            └── ...
```

---

## 2. 自进化模块实施

### 2.1 综合相似度计算

```typescript
// src/lib/ai/tag-evolution-v2.ts

/**
 * 计算两个 Tag 的综合相似度
 * 加权公式: combinedSim = tagSim × 0.4 + feedbackSim × 0.6
 * 反馈向量权重更高，因为实际覆盖情况比定义更真实
 */
function combinedSimilarity(tagSim: number, feedbackSim: number): number {
  return tagSim * TAG_VEC_WEIGHT + feedbackSim * FEEDBACK_VEC_WEIGHT;
}

const TAG_VEC_WEIGHT = 0.4;
const FEEDBACK_VEC_WEIGHT = 0.6;
```

### 2.2 三态判定矩阵

```typescript
type TagPairClassification =
  | 'true_duplicate'
  | 'pseudo_similar'
  | 'hidden_duplicate'
  | 'distinct';

function classifyTagPair(
  tagSim: number,
  feedbackSim: number
): TagPairClassification {
  if (tagSim > 0.85 && feedbackSim > 0.75) return 'true_duplicate';
  if (tagSim > 0.85 && feedbackSim < 0.50) return 'pseudo_similar';
  if (tagSim < 0.65 && feedbackSim > 0.80) return 'hidden_duplicate';
  return 'distinct';
}
```

### 2.3 进化快照与回滚

```typescript
// src/lib/ai/evolution-snapshot.ts

interface EvolutionSnapshot {
  id: string;
  timestamp: string;
  action: 'merge' | 'split' | 'rename' | 'move';
  before: {
    tagIds: string[];
    feedbackMappings: Record<string, string[]>; // tagId → feedbackId[]
  };
  after: {
    tagIds: string[];
  };
  confidence: number;
  autoExecuted: boolean;
}

async function createSnapshot(
  ownerUserId: string,
  snapshot: Omit<EvolutionSnapshot, 'id' | 'timestamp'>
): Promise<string> {
  const id = `evo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullSnapshot: EvolutionSnapshot = {
    ...snapshot,
    id,
    timestamp: new Date().toISOString(),
  };
  await kv.set(`evolution-snapshot:${ownerUserId}:${id}`, fullSnapshot);
  // 保留最近 6 个月快照
  await kv.expire(`evolution-snapshot:${ownerUserId}:${id}`, 180 * 24 * 60 * 60);
  return id;
}

async function rollbackSnapshot(
  ownerUserId: string,
  snapshotId: string
): Promise<boolean> {
  const snapshot = await kv.get<EvolutionSnapshot>(
    `evolution-snapshot:${ownerUserId}:${snapshotId}`
  );
  if (!snapshot) throw new Error('快照不存在');

  // 恢复标签-反馈映射
  for (const [tagId, feedbackIds] of Object.entries(snapshot.before.feedbackMappings)) {
    // 更新飞书表格中对应反馈的 Tag 引用
    await restoreFeedbackTags(ownerUserId, tagId, feedbackIds);
  }

  // 恢复标签表
  await restoreTags(ownerUserId, snapshot.before.tagIds);
  return true;
}
```

### 2.4 分层阈值策略

```typescript
const EVOLUTION_THRESHOLDS = {
  merge: {
    crossTag2: 0.95,  // 跨 Tag2 的 Tag3 对 → 更保守
    sameTag2: 0.85,   // 同 Tag2 下的 Tag3 对
  },
  split: {
    minClusterSize: 5,
    minInterClusterDist: 0.35,
    maxClustersPerTag: 5,
  },
  drift: {
    suggestRename: 0.55,
    watch: 0.70,
    minAge: 30 * 24 * 60 * 60 * 1000,
    minUsage: 20,
  },
  hierarchy: {
    suggestMove: 0.40,
  },
};

// 进化操作分级
enum EvolutionAction {
  AUTO_EXECUTE = 'auto',
  SUGGEST = 'suggest',
  SKIP = 'skip',
}

function classifyEvolutionAction(confidence: number): EvolutionAction {
  if (confidence > 0.95) return EvolutionAction.AUTO_EXECUTE;
  if (confidence > 0.70) return EvolutionAction.SUGGEST;
  return EvolutionAction.SKIP;
}
```

---

## 3. 诊断面板实施

### 3.1 数据采集器

```typescript
// src/lib/diagnostics/metrics-collector.ts

export interface EmbeddingDiagnostics {
  tagReuseRate: {
    current: number;
    totalMatches: number;
    totalAttempts: number;
    trend: 'up' | 'down' | 'stable';
  };
  dedupBlocked: {
    total: number;
    thisMonth: number;
    examples: Array<{
      rejectedName: string;
      matchedExisting: string;
      similarity: number;
    }>;
  };
  tokenSavings: {
    beforeAvg: number;
    afterAvg: number;
    savedPercent: number;
    monthTokensSaved: number;
  };
  vectorCoverage: {
    initialized: number;
    total: number;
    percent: number;
  };
  cohesionScore: {
    median: number;
    lowCohesionTags: string[];
  };
  scatterData: {
    tags: Array<{ tagId: string; name: string; tag2Name: string; x: number; y: number; usageCount: number }>;
    feedbacks: Array<{ feedbackId: string; content: string; tag3Name: string; confidence: number; reviewNeeded: boolean; x: number; y: number }>;
  };
  evolutionTimeline: Array<{
    date: string;
    event: string;
    description: string;
  }>;
}

export async function collectDiagnostics(
  ownerUserId: string
): Promise<EmbeddingDiagnostics> {
  const tagStore = await loadTagVectors(ownerUserId);
  const allTags = await getAllTags();

  // 向量覆盖率
  const vectorCoverage = {
    initialized: Object.keys(tagStore).length,
    total: allTags.length,
    percent: allTags.length > 0
      ? Object.keys(tagStore).length / allTags.length
      : 0,
  };

  // 从 KV 读取预计算数据
  const cached = await kv.get(`diagnostics:${ownerUserId}`);

  return {
    tagReuseRate: cached?.tagReuseRate || { current: 0, totalMatches: 0, totalAttempts: 0, trend: 'stable' },
    dedupBlocked: cached?.dedupBlocked || { total: 0, thisMonth: 0, examples: [] },
    tokenSavings: cached?.tokenSavings || { beforeAvg: 0, afterAvg: 0, savedPercent: 0, monthTokensSaved: 0 },
    vectorCoverage,
    cohesionScore: cached?.cohesionScore || { median: 0, lowCohesionTags: [] },
    scatterData: cached?.scatterData || { tags: [], feedbacks: [] },
    evolutionTimeline: cached?.evolutionTimeline || [],
  };
}
```

### 3.2 诊断 API

```typescript
// src/app/api/diagnostics/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { collectDiagnostics } from '@/lib/diagnostics/metrics-collector';

export async function GET(request: NextRequest) {
  const ownerUserId = request.headers.get('x-user-id');
  if (!ownerUserId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const diagnostics = await collectDiagnostics(ownerUserId);
  return NextResponse.json(diagnostics);
}
```

### 3.3 前端诊断面板

```typescript
// src/components/admin/config-center/DiagnosticsTab.tsx

'use client';

import { useState, useEffect } from 'react';
import { MetricsCard } from './ui/metrics-card';
import { ScatterChart } from './ui/scatter-chart';
import { EvolutionTimeline } from './ui/evolution-timeline';

export function DiagnosticsTab() {
  const [data, setData] = useState<EmbeddingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/diagnostics')
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DiagnosticsSkeleton />;
  if (!data) return <EmptyState reason="no_data" />;

  return (
    <div className="diagnostics-tab">
      {/* 指标卡片 */}
      <div className="metrics-grid">
        <MetricsCard
          title="标签复用率"
          value={`${(data.tagReuseRate.current * 100).toFixed(1)}%`}
          subtitle={`${data.tagReuseRate.totalMatches} 次命中`}
          trend={data.tagReuseRate.trend}
        />
        <MetricsCard
          title="重复拦截"
          value={`${data.dedupBlocked.total} 次`}
          subtitle={`本月 ${data.dedupBlocked.thisMonth} 次`}
        />
        <MetricsCard
          title="Token 节省"
          value={`-${data.tokenSavings.savedPercent}%`}
          subtitle={`月省 ${data.tokenSavings.monthTokensSaved.toLocaleString()} tokens`}
        />
        <MetricsCard
          title="向量覆盖率"
          value={`${(data.vectorCoverage.percent * 100).toFixed(1)}%`}
          subtitle={`${data.vectorCoverage.initialized}/${data.vectorCoverage.total}`}
        />
      </div>

      {/* 散点图 */}
      <div className="charts-grid">
        <ScatterChart
          title="标签向量空间"
          data={data.scatterData.tags}
          colorKey="tag2Name"
          sizeKey="usageCount"
        />
        <ScatterChart
          title="反馈聚类空间"
          data={data.scatterData.feedbacks}
          colorKey="tag3Name"
          shapeKey="reviewNeeded"
        />
      </div>

      {/* 进化时间线 */}
      <EvolutionTimeline events={data.evolutionTimeline} />
    </div>
  );
}
```

### 3.4 渲染策略

```typescript
// 三级渲染策略
const RENDER_STRATEGY = {
  scatter_svg: { maxPoints: 300, renderer: 'svg' },
  scatter_canvas: { maxPoints: 1000, renderer: 'canvas' },
  hexbin: { renderer: 'canvas', hexSize: 20 },
};

function selectRenderStrategy(pointCount: number) {
  if (pointCount <= 300) return RENDER_STRATEGY.scatter_svg;
  if (pointCount <= 1000) return RENDER_STRATEGY.scatter_canvas;
  return RENDER_STRATEGY.hexbin;
}
```

---

## 4. 进化操作 API

### 4.1 手动触发进化

```typescript
// src/app/api/evolution/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const ownerUserId = request.headers.get('x-user-id');
  if (!ownerUserId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  if (action === 'detect') {
    const results = await detectEvolution(ownerUserId);
    return NextResponse.json(results);
  }

  if (action === 'execute') {
    const { type, ...params } = body;
    const snapshot = await executeEvolution(ownerUserId, type, params);
    return NextResponse.json(snapshot);
  }

  if (action === 'rollback') {
    const { snapshotId } = body;
    const result = await rollbackSnapshot(ownerUserId, snapshotId);
    return NextResponse.json({ success: result });
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 });
}
```

---

## 5. 数据保留与清理

### 5.1 保留策略

```typescript
const RETENTION_POLICY = {
  tsneCache: '仅保留最新一份（覆盖写）',
  evolutionSnapshots: '保留最近 6 个月，每月一份',
  dailyMetrics: '保留最近 30 天，每天一份',
};

// 自动清理
async function cleanupDiagnosticsData(ownerUserId: string) {
  const keys = await kv.scan(`diagnostics:${ownerUserId}:*`);
  const now = Date.now();

  for (const key of keys) {
    const data = await kv.get<{ timestamp: number }>(key);
    if (!data) continue;

    if (key.includes(':daily:') && now - data.timestamp > 30 * 24 * 60 * 60 * 1000) {
      await kv.del(key);
    }
    if (key.includes(':snapshot:') && now - data.timestamp > 180 * 24 * 60 * 60 * 1000) {
      await kv.del(key);
    }
  }
}
```

---

## 6. 空状态引导

```typescript
function EmptyState({ reason }: {
  reason: 'no_embeddings' | 'cold_start_just_done' | 'no_data'
}) {
  const messages = {
    no_embeddings: {
      title: '尚未启用 Embedding 打标',
      description: '请先在「AI与标签」中完成首次打标，系统将自动初始化向量库',
      action: '前往打标',
    },
    cold_start_just_done: {
      title: '向量库已初始化，诊断数据收集中',
      description: '完成至少一周的打标后，这里将展示关键指标',
      action: '查看标签列表',
    },
    no_data: {
      title: '暂无诊断数据',
      description: '请等待下一次周度打标任务完成后查看',
      action: '手动触发打标',
    },
  };

  const msg = messages[reason];
  return (
    <div className="empty-state">
      <div className="empty-state-icon">📊</div>
      <h3>{msg.title}</h3>
      <p>{msg.description}</p>
      <button className="btn-primary" onClick={() => handleAction(msg.action)}>
        {msg.action}
      </button>
    </div>
  );
}
```

---

## 7. 实施路线图

| 阶段 | 内容 | 工作量 |
|------|------|--------|
| Phase 4a | 反馈向量质心存储 + 增量更新 | 0.5 天 |
| Phase 4b | 双向量协同合并/拆分/漂移检测 | 2 天 |
| Phase 4c | 进化快照 + 回滚机制 | 0.5 天 |
| Phase 5a | 诊断 API + 数据采集器 | 1 天 |
| Phase 5b | 前端诊断面板 | 1.5 天 |
| Phase 5c | t-SNE 预计算 + KV 缓存 | 0.5 天 |
| **总计** | | **6 天** |

---

*文档版本：v1.0*
*创建时间：2026-07-04*
