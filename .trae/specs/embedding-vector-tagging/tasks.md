# Tasks

## Phase 0: 风险验证（必须先通过）

- [ ] Task 0.1: 安装 `@xenova/transformers` 依赖并验证本地构建
  - [ ] 执行 `pnpm add @xenova/transformers`
  - [ ] 在 `next.config.mjs` 中添加 `transpilePackages` 和 webpack fallback 配置
  - [ ] 执行 `npm run build` 验证构建通过
  - [ ] 验证标准：构建无报错，wasm 文件正确打包

- [ ] Task 0.2: 验证 Vercel 函数超时配置
  - [ ] 在 `vercel.json` 中添加 `functions: { "src/app/api/cron/**": { maxDuration: 60 } }`
  - [ ] 验证标准：部署后 cron 接口超时上限为 60s

- [ ] Task 0.3: 用真实中文反馈验证 Embedding 效果
  - [ ] 编写临时脚本调用 `embed()` 测试 10 条真实中文反馈
  - [ ] 验证"定位失败"与"GPS信号弱"相似度 > 0.5
  - [ ] 验证"定位失败"与"审批催办无效"相似度 < 0.5
  - [ ] 验证标准：相似反馈可区分，不相似反馈不误匹配
  - [ ] **决策点**：如准确率不足，切换到 `Xenova/multilingual-e5-small` 重新验证

## Phase 1: Embedding 基础设施

- [ ] Task 1.1: 创建 `src/lib/ai/embedding.ts`
  - [ ] 实现 `getEmbedder()` 单例懒加载（含 15s 超时）
  - [ ] 实现 `embed(text)` 返回 384 维归一化向量
  - [ ] 实现 `embedBatch(texts)` 批量推理
  - [ ] 实现 `cosineSim(a, b)` 余弦相似度（复用 semantic-cache 已有实现）
  - [ ] 实现 `searchSimilar(queryVec, tagStore, k, minScore)` ANN 检索
  - [ ] 编写单元测试

- [ ] Task 1.2: 创建 `src/lib/ai/tag-vector-store.ts`
  - [ ] 实现 `loadTagVectors(ownerId)` 从 KV 读取向量库（含标签向量 + 反馈质心）
  - [ ] 实现 `upsertTagVector(ownerId, tagId, name, definition)` 写入单条
  - [ ] 实现 `deleteTagVector(ownerId, tagId)` 删除单条
  - [ ] 实现 `batchInitVectors(ownerId, tags)` 冷启动批量初始化
  - [ ] 实现 `updateFeedbackCentroid(ownerId, tagId, newFeedbackVec, count)` 增量更新质心
  - [ ] 编写单元测试

## Phase 2: 日常打标改造

- [ ] Task 2.1: 改造 `tagger.ts` 打标主流程
  - [ ] 在 `batchAnalyzeFeedbacks` 中：标签库非空时先用 `embed(反馈)` + `searchSimilar` 检索 Top-5 候选
  - [ ] 候选标签传入 Prompt 生成函数，替代全量标签注入
  - [ ] 标签库为空或 Embedding 不可用时，降级为全量注入（原有行为）
  - [ ] 编写集成测试

- [ ] Task 2.2: 修改 Prompt 模板
  - [ ] 修改 `src/lib/ai/templates/tagging/batch-tagging.hbs`
  - [ ] 新增「候选标签」区块（Top-5 + 相似度分数）
  - [ ] 保留「全量标签」区块作为兜底（当候选为空时注入全量）
  - [ ] 验证 Prompt 渲染正确

- [ ] Task 2.3: 实现向量去重 + 质心增量更新
  - [ ] 在 `completeTaggingProcess` 中新建标签前调用 `searchSimilar(newTagVec, store, 1, 0.85)` 检测重复
  - [ ] 检测到重复时复用已有标签
  - [ ] 新建标签后调用 `upsertTagVector` 写入向量
  - [ ] 打标完成后调用 `updateFeedbackCentroid` 增量更新反馈质心
  - [ ] 编写单元测试

## Phase 3: 冷启动聚类

- [ ] Task 3.1: 创建 `src/lib/ai/cold-start-cluster.ts`
  - [ ] 实现 `simpleKMeans(vectors, k, maxIterations)` K-Means 聚类
  - [ ] 实现 `findOptimalK(vectors, maxK)` 肘部法则
  - [ ] 实现 `coldStartClustering(feedbacks)` 主流程（embed → 聚类 → 采样 → LLM 命名）
  - [ ] 过滤簇内反馈 < 3 条的噪音簇
  - [ ] 编写单元测试

- [ ] Task 3.2: 集成冷启动到 sync-task.ts
  - [ ] 在 `autoTagFeedbacks` 中判断 `existingTags.length === 0 && untaggedRecords.length >= 50`
  - [ ] 触发冷启动聚类流程，生成标签写入 Bitable + KV
  - [ ] 后续反馈走日常打标流程
  - [ ] 编写集成测试

## Phase 4: 双向量协同标签自进化

- [ ] Task 4.1: 创建 `src/lib/ai/tag-evolution-v2.ts`
  - [ ] 实现 `combinedSimilarity(tagSim, feedbackSim)` 综合相似度（0.4 + 0.6 加权）
  - [ ] 实现 `classifyTagPair(tagSim, feedbackSim)` 三态判定矩阵
  - [ ] 实现 `detectMerges(tagStore)` 合并检测（true_duplicate）
  - [ ] 实现 `detectSplits(tagStore, feedbackVecs)` 拆分检测（簇间距离 > 0.35）
  - [ ] 实现 `detectDrift(tagStore)` 漂移检测（质心与定义偏离）
  - [ ] 实现 `detectHierarchyIssues(tagStore)` 层级调整检测
  - [ ] 实现 `detectEvolution(ownerId)` 总入口，返回所有建议
  - [ ] 实现 `classifyEvolutionAction(confidence)` 分级（自动执行 / 建议 / 跳过）
  - [ ] 编写单元测试

- [ ] Task 4.2: 创建 `src/lib/ai/evolution-snapshot.ts`
  - [ ] 定义 EvolutionSnapshot 接口（id/timestamp/action/before/after/confidence/autoExecuted）
  - [ ] 实现 `createSnapshot(ownerId, snapshot)` 创建快照，存入 KV
  - [ ] 实现 `rollbackSnapshot(ownerId, snapshotId)` 回滚快照
  - [ ] 实现 `listSnapshots(ownerId, limit)` 列出历史快照
  - [ ] 快照保留 6 个月，自动过期
  - [ ] 编写单元测试

- [ ] Task 4.3: 集成进化到定时任务
  - [ ] 周任务 `sync-task.ts` 中打标完成后触发 `detectEvolution`
  - [ ] 月任务 `cron/monthly/route.ts` 中执行全量进化扫描 + 向量库重建
  - [ ] 自动执行置信度 > 0.95 的操作，其余生成建议
  - [ ] 操作前创建快照

## Phase 5: 诊断数据与 API

- [ ] Task 5.1: 创建 `src/lib/diagnostics/metrics-collector.ts`
  - [ ] 定义 EmbeddingDiagnostics 接口（7 项指标）
  - [ ] 实现 `collectDiagnostics(ownerId)` 采集诊断数据
  - [ ] 标签复用率计算（匹配次数 / 总尝试次数 + 趋势）
  - [ ] 重复拦截统计（总数 + 本月 + 示例）
  - [ ] Token 节省估算（改造前后平均 token 对比）
  - [ ] 向量覆盖率（已初始化 / 总数）
  - [ ] 内聚度评分（中位数 + 低内聚标签列表）
  - [ ] 散点图数据（标签 + 反馈的 2D 坐标）
  - [ ] 进化时间线
  - [ ] 编写单元测试

- [ ] Task 5.2: 创建 `src/lib/diagnostics/tsne-cache.ts`
  - [ ] 实现 t-SNE 降维（用 PCA 近似 + 简单力导向布局，避免重依赖）
  - [ ] 实现 `precomputeScatterData(ownerId)` 预计算散点数据
  - [ ] 实现缓存逻辑（KV 存储，覆盖写，仅保留最新一份）
  - [ ] 三级渲染策略判断（SVG / Canvas / Hexbin）
  - [ ] 编写单元测试

- [ ] Task 5.3: 创建诊断 API `src/app/api/diagnostics/route.ts`
  - [ ] GET /api/diagnostics 返回诊断数据
  - [ ] POST /api/diagnostics/refresh 强制刷新预计算数据
  - [ ] 错误处理 + 权限校验

- [ ] Task 5.4: 创建进化 API `src/app/api/evolution/route.ts`
  - [ ] POST action=detect 检测进化建议
  - [ ] POST action=execute 执行指定进化操作
  - [ ] POST action=rollback 回滚指定快照
  - [ ] GET 列出历史快照
  - [ ] 错误处理 + 权限校验

## Phase 6: 前端面板

- [ ] Task 6.1: 配置中心新增「诊断」Tab
  - [ ] 在 `src/constants/config-center.ts` 新增 diagnostics Tab
  - [ ] 在 `src/components/admin/ConfigCenter.tsx` 注册 Tab
  - [ ] 创建 `src/components/admin/config-center/DiagnosticsTab.tsx`

- [ ] Task 6.2: 诊断面板 - 指标卡片
  - [ ] 标签复用率卡片（数值 + 趋势箭头 + 匹配次数）
  - [ ] 重复拦截卡片（总数 + 本月数）
  - [ ] Token 节省卡片（百分比 + 月省 tokens 数）
  - [ ] 向量覆盖率卡片（已初始化 / 总数 + 百分比）

- [ ] Task 6.3: 诊断面板 - 散点图
  - [ ] 标签向量空间散点图（按 Tag2 着色，按使用次数缩放）
  - [ ] 反馈聚类空间散点图（按 Tag3 着色，需审核的用特殊形状）
  - [ ] SVG 渲染（≤300 点）

- [ ] Task 6.4: 诊断面板 - 进化时间线 + 空状态
  - [ ] 进化操作时间线（日期 + 事件 + 描述）
  - [ ] 三种空状态（未启用 / 刚完成冷启动 / 暂无数据）
  - [ ] 空状态引导按钮

- [ ] Task 6.5: 配置中心新增「进化」Tab
  - [ ] 在 `src/constants/config-center.ts` 新增 evolution Tab
  - [ ] 在 `src/components/admin/ConfigCenter.tsx` 注册 Tab
  - [ ] 创建 `src/components/admin/config-center/EvolutionTab.tsx`

- [ ] Task 6.6: 进化面板 - 建议列表 + 操作
  - [ ] 按类型分组展示建议（合并 / 拆分 / 漂移 / 层级调整）
  - [ ] 每条建议显示置信度、涉及标签、原因说明
  - [ ] 「执行」按钮（确认弹窗 + 加载状态）
  - [ ] 「忽略」按钮
  - [ ] 历史快照列表 + 回滚按钮

## Phase 7: 测试与验收

- [ ] Task 7.1: 端到端测试
  - [ ] 用 Mock 数据跑完整冷启动流程（200 条反馈 → 聚类 → 标签生成 → 打标）
  - [ ] 验证日常打标 Top-K 候选注入正确
  - [ ] 验证降级路径（Embedding 不可用时回到原有行为）
  - [ ] 验证向量去重生效
  - [ ] 验证进化检测 + 执行 + 回滚完整链路
  - [ ] 验证诊断数据采集完整

- [ ] Task 7.2: 性能验证
  - [ ] 验证暴力扫描 5000 标签 < 10ms
  - [ ] 验证单次 embed 耗时 < 100ms（模型加载后）
  - [ ] 验证 Prompt token 节省 > 50%
  - [ ] 验证进化检测 1000 标签 < 30s

- [ ] Task 7.3: 集成回归测试
  - [ ] 现有 89 个单元测试全部通过
  - [ ] TypeScript 编译通过（`npx tsc --noEmit`）
  - [ ] 生产构建通过（`npm run build`）
  - [ ] 现有用户画像系统不受影响
  - [ ] 现有工具调用打标引擎不受影响

---

# Task Dependencies

- Task 0.1 → Task 0.2 → Task 0.3（Phase 0 串行，必须先全部通过）
- Task 0.3 通过后 → Task 1.1 → Task 1.2（Phase 1 串行）
- Task 1.2 完成 → Task 2.1, Task 2.2, Task 2.3（Phase 2 可部分并行）
- Task 2.3 完成 → Task 3.1 → Task 3.2（Phase 3 串行）
- Task 3.2 完成 → Task 4.1, Task 4.2（Phase 4 可并行）
- Task 4.1, Task 4.2 完成 → Task 4.3（Phase 4 收尾）
- Task 4.3 完成 → Task 5.1, Task 5.2（Phase 5 可并行）
- Task 5.1, Task 5.2 完成 → Task 5.3, Task 5.4（Phase 5 API 可并行）
- Task 5.3, Task 5.4 完成 → Task 6.1, Task 6.5（Phase 6 Tab 注册可并行）
- Task 6.1 完成 → Task 6.2, Task 6.3, Task 6.4（诊断面板子模块可并行）
- Task 6.5 完成 → Task 6.6（进化面板）
- Task 6.4, Task 6.6 完成 → Task 7.1 → Task 7.2 → Task 7.3（Phase 7 串行）

**关键决策点**：Task 0.3 如验证不通过，需切换模型重新验证，或暂停 Embedding 改造。
**关键里程碑**：Phase 3 完成 = 核心打标改造完成；Phase 4 完成 = 自进化系统完成；Phase 6 完成 = 全部功能上线。
