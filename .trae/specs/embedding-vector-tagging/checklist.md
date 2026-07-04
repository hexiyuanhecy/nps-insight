# Checklist

## Phase 0: 风险验证

- [ ] `@xenova/transformers` 已安装到 package.json
- [ ] `next.config.mjs` 已添加 `transpilePackages: ['@xenova/transformers']`
- [ ] `npm run build` 构建通过，无 webpack 报错
- [ ] `vercel.json` 已配置 `functions.maxDuration: 60` 给 cron 路由
- [ ] 用 10 条真实中文反馈验证 Embedding 效果
- [ ] "定位失败"与"GPS信号弱"余弦相似度 > 0.5
- [ ] "定位失败"与"审批催办无效"余弦相似度 < 0.5
- [ ] Task 0.3 决策点已确认（继续用 MiniLM 或切换 multilingual-e5-small）

## Phase 1: Embedding 基础设施

- [ ] `src/lib/ai/embedding.ts` 已创建
- [ ] `getEmbedder()` 单例懒加载实现正确（含 15s 超时）
- [ ] `embed()` 模型加载失败时返回零向量，不抛异常
- [ ] `embedBatch()` 逐条处理避免内存溢出
- [ ] `cosineSim()` 零向量输入返回 0
- [ ] `searchSimilar()` 正确过滤 minScore 以下的结果
- [ ] 单元测试覆盖所有函数
- [ ] `src/lib/ai/tag-vector-store.ts` 已创建
- [ ] `loadTagVectors()` KV 读取失败时返回空对象
- [ ] `upsertTagVector()` 正确合并到已有向量库
- [ ] `batchInitVectors()` 冷启动批量写入正确
- [ ] `updateFeedbackCentroid()` 增量更新质心公式正确
- [ ] 单元测试覆盖 KV 读写

## Phase 2: 日常打标改造

- [ ] `tagger.ts` 中 `batchAnalyzeFeedbacks` 已接入 ANN 检索
- [ ] 标签库非空时先 embed 反馈 → searchSimilar → Top-5 候选
- [ ] 候选标签传入 Prompt 生成函数
- [ ] 标签库为空时降级为全量注入（原有行为）
- [ ] Embedding 不可用时降级为全量注入（原有行为）
- [ ] Prompt 模板已新增「候选标签」区块
- [ ] 候选为空时保留「全量标签」区块兜底
- [ ] `completeTaggingProcess` 新建标签前已做向量去重
- [ ] 去重阈值 0.85 生效
- [ ] 新建标签后向量已写入 KV
- [ ] 打标完成后反馈质心已增量更新
- [ ] 集成测试通过

## Phase 3: 冷启动聚类

- [ ] `src/lib/ai/cold-start-cluster.ts` 已创建
- [ ] `simpleKMeans()` 实现正确（含 maxIterations 收敛）
- [ ] `findOptimalK()` 肘部法则实现正确
- [ ] `coldStartClustering()` 主流程完整（embed → 聚类 → 采样 → LLM 命名）
- [ ] 簇内反馈 < 3 条的噪音簇已过滤
- [ ] LLM 命名 Prompt 正确输出 tag2Name/tag3Name/definition
- [ ] `sync-task.ts` 中冷启动判断条件正确（标签库空 && 反馈数 ≥ 50）
- [ ] 冷启动后标签已写入 Bitable + KV 向量库
- [ ] 冷启动后后续反馈走日常打标流程
- [ ] 单元测试和集成测试通过

## Phase 4: 双向量协同标签自进化

- [ ] `src/lib/ai/tag-evolution-v2.ts` 已创建
- [ ] `combinedSimilarity()` 加权公式正确（tagSim×0.4 + feedbackSim×0.6）
- [ ] `classifyTagPair()` 三态判定矩阵正确（true_duplicate / pseudo_similar / hidden_duplicate / distinct）
- [ ] `detectMerges()` 合并检测正确（true_duplicate 触发）
- [ ] `detectSplits()` 拆分检测正确（簇间距离 > 0.35，每簇 ≥ 5 条，最多 5 簇）
- [ ] `detectDrift()` 漂移检测正确（存在>30天 且 使用>20次 且 相似度<0.55）
- [ ] `detectHierarchyIssues()` 层级调整检测正确（与非父级 Tag2 相似度 > 0.40）
- [ ] `classifyEvolutionAction()` 分级正确（>0.95 自动执行 / >0.70 建议 / 其余跳过）
- [ ] 分层阈值策略正确（同 Tag2 下合并 0.85 / 跨 Tag2 合并 0.95）
- [ ] `src/lib/ai/evolution-snapshot.ts` 已创建
- [ ] EvolutionSnapshot 接口字段完整（id/timestamp/action/before/after/confidence/autoExecuted）
- [ ] `createSnapshot()` 正确存入 KV，设置 6 个月过期
- [ ] `rollbackSnapshot()` 正确恢复标签和反馈映射
- [ ] `listSnapshots()` 正确列出历史快照
- [ ] 周任务打标完成后触发进化检测
- [ ] 月任务执行全量进化扫描 + 向量库重建
- [ ] 自动执行置信度 > 0.95 的操作
- [ ] 所有进化操作前创建快照
- [ ] 单元测试覆盖所有函数

## Phase 5: 诊断数据与 API

- [ ] `src/lib/diagnostics/metrics-collector.ts` 已创建
- [ ] EmbeddingDiagnostics 接口 7 项指标完整
- [ ] 标签复用率计算正确（匹配次数 / 总尝试次数 + 趋势）
- [ ] 重复拦截统计正确（总数 + 本月 + 示例）
- [ ] Token 节省估算正确（改造前后平均 token 对比）
- [ ] 向量覆盖率计算正确（已初始化 / 总数）
- [ ] 内聚度评分计算正确（中位数 + 低内聚标签列表）
- [ ] 散点图数据结构正确（标签 + 反馈的 2D 坐标）
- [ ] 进化时间线数据结构正确
- [ ] `src/lib/diagnostics/tsne-cache.ts` 已创建
- [ ] t-SNE / PCA 降维实现正确（用轻量近似方案）
- [ ] `precomputeScatterData()` 预计算散点数据正确
- [ ] 缓存逻辑正确（KV 存储，覆盖写，仅保留最新一份）
- [ ] 三级渲染策略判断正确（SVG ≤ 300 / Canvas ≤ 1000 / Hexbin > 1000）
- [ ] `src/app/api/diagnostics/route.ts` 已创建
- [ ] GET /api/diagnostics 返回完整诊断数据
- [ ] POST /api/diagnostics/refresh 强制刷新预计算数据
- [ ] 错误处理 + 权限校验正确
- [ ] `src/app/api/evolution/route.ts` 已创建
- [ ] POST action=detect 检测进化建议返回正确
- [ ] POST action=execute 执行指定进化操作返回正确
- [ ] POST action=rollback 回滚指定快照返回正确
- [ ] GET 列出历史快照返回正确
- [ ] 错误处理 + 权限校验正确
- [ ] 单元测试覆盖所有函数

## Phase 6: 前端面板

- [ ] 配置中心 Tab 类型已扩展（diagnostics + evolution）
- [ ] `src/constants/config-center.ts` 新增 diagnostics Tab
- [ ] `src/constants/config-center.ts` 新增 evolution Tab
- [ ] `src/components/admin/ConfigCenter.tsx` 已注册诊断 Tab
- [ ] `src/components/admin/ConfigCenter.tsx` 已注册进化 Tab
- [ ] DiagnosticsTab.tsx 已创建
- [ ] 标签复用率指标卡片正确（数值 + 趋势箭头 + 匹配次数）
- [ ] 重复拦截指标卡片正确（总数 + 本月数）
- [ ] Token 节省指标卡片正确（百分比 + 月省 tokens 数）
- [ ] 向量覆盖率指标卡片正确（已初始化 / 总数 + 百分比）
- [ ] 标签向量空间散点图正确（按 Tag2 着色，按使用次数缩放）
- [ ] 反馈聚类空间散点图正确（按 Tag3 着色，需审核的用特殊形状）
- [ ] SVG 渲染正确（≤300 点）
- [ ] 进化操作时间线正确（日期 + 事件 + 描述）
- [ ] 三种空状态正确（未启用 / 刚完成冷启动 / 暂无数据）
- [ ] 空状态引导按钮正确
- [ ] EvolutionTab.tsx 已创建
- [ ] 进化建议按类型分组展示（合并 / 拆分 / 漂移 / 层级调整）
- [ ] 每条建议显示置信度、涉及标签、原因说明
- [ ] 「执行」按钮正确（确认弹窗 + 加载状态）
- [ ] 「忽略」按钮正确
- [ ] 历史快照列表 + 回滚按钮正确

## Phase 7: 测试与验收

- [ ] Mock 数据冷启动端到端测试通过（200 条 → 聚类 → 标签 → 打标）
- [ ] 日常打标 Top-K 候选注入正确
- [ ] 降级路径验证通过（Embedding 不可用时回到原有行为）
- [ ] 向量去重验证通过
- [ ] 进化检测 + 执行 + 回滚完整链路验证通过
- [ ] 诊断数据采集完整验证通过
- [ ] 暴力扫描 5000 标签 < 10ms
- [ ] 单次 embed 耗时 < 100ms（模型加载后）
- [ ] Prompt token 节省 > 50%
- [ ] 进化检测 1000 标签 < 30s
- [ ] 现有单元测试全部通过
- [ ] TypeScript 编译通过（`npx tsc --noEmit`）
- [ ] 生产构建通过（`npm run build`）

## 向后兼容性验证

- [ ] 未配置 Embedding 时，打标流程与改造前完全一致
- [ ] Embedding 模型加载失败时，打标流程与改造前完全一致
- [ ] KV 中无向量数据时，降级为全量标签注入
- [ ] 现有用户画像系统不受影响
- [ ] 现有工具调用打标引擎不受影响
- [ ] 飞书 Bitable 表结构未改动
- [ ] 进化操作可回滚，不丢失数据
