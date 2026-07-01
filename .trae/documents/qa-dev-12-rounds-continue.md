# 周打标 + 月分析全链路验收-修复 12 轮循环（续）

## 摘要

本计划承接上一会话：**Round 1 已完成**（修复 P0 问题 #1 Top问题表写入、#2 月报卡片传 topIssues、#4 典型反馈真实数据、#5 数据结构适配、#15 人工字段保护），测试通过率 100%。

本计划聚焦 **Round 2 ~ Round 12** 的执行，以"产品/测试验收 → 问题列表 → 研发修复 → 验证"循环模式推进，确保周打标、月分析全链路符合 `docs/prd/04_核心流程`、`docs/prd/05_Bot通知`、`docs/prd/03_标签体系`、`docs/prd/07_标签自进化` 的 PRD 要求。

**执行方式**：实际触发任务（`pnpm tsx scripts/test-monthly-direct.ts` / `scripts/test-tagging.ts`）+ 检查飞书多维表格数据 + 检查 Bot 卡片 + 检查文档内容 + 对照 PRD。

---

## 当前状态分析（Phase 1 探索结论）

### 已修复（Round 1，不再重复）
| 问题 | 文件 | 修复状态 |
|------|------|----------|
| #1 Top问题表未写入 | `src/lib/monthly-task-runner.ts` 步骤2 | ✅ 调用 `generator.writeToTable(topIssues)` |
| #2 月报卡片缺Top问题数据 | `src/lib/monthly-task-runner.ts` 步骤5 | ✅ 传 `cardTopIssues` 给 `createMonthlyReportCard` |
| #4 典型反馈为占位符 | `src/lib/monthly-task-runner.ts` `generateMeetingDoc` | ✅ 从反馈表按 Tag2 筛选低分前3条 |
| #5 数据结构不匹配 | `src/lib/analysis/top-issues.ts` `TopIssue` 接口 | ✅ 扩展 module/tag3/totalCount 等字段 |
| #15 人工字段被覆盖 | `src/lib/analysis/top-issues.ts` `writeToTable` | ✅ 更新时只更新排名+统计字段 |

### Round 2 起待修复问题清单（按优先级）

| # | 问题 | 文件/行号 | 修复轮次 |
|---|------|-----------|----------|
| 3 | 公式同步权重未反哺 | `src/lib/monthly-task-runner.ts` L310-338；`src/lib/analysis/top-issues.ts` L92-100 | Round 2 |
| 6 | 周报卡片标题硬编码"Feelgood" | `src/lib/feishu/bot.ts` L976, L1060 | Round 4 |
| 7 | 月报卡片标题硬编码"Feelgood" | `src/lib/feishu/bot.ts` L1103, L1223 | Round 4 |
| 8 | 周报卡片缺仪表盘按钮URL（验证） | `src/lib/feishu/bot.ts` createWeeklyReportCard | Round 4 |
| 9 | Top问题文档只展示20行 | `src/lib/monthly-task-runner.ts` `generateMeetingDoc` L120 | Round 5 |
| 10 | V1 tag-evolution 残留 import | `src/lib/monthly-task-runner.ts` L5 | Round 5 |
| 11 | 周报Top问题用Tag1，卡片用Tag3 | `src/lib/documents/weekly-generator.ts` L26 | Round 5 |
| 12 | sendNotification/generateWeeklyDoc 超时保护（验证） | `src/app/api/cron/sync/sync-task.ts` | Round 6 |
| — | AI打标质量/Prompt（E1-E6） | `src/lib/ai/prompts.ts` | Round 7 |
| — | 标签自进化效果（EVO规则） | `src/lib/ai/tag-evolution-v2.ts` | Round 8 |
| — | 翻译/缓存机制 | `src/lib/ai/*` | Round 9 |

---

## 详细实施计划（Round 2 - Round 12）

### Round 2：修复 P0 问题 #3（公式权重反哺）

**验收发现**：当前月分析步骤顺序为 `标签自进化 → Top问题生成 → 公式同步 → 文档 → 通知`。`FormulaSync.getWeights()` 存在但 `TopIssuesGenerator` 构造时硬编码权重 `{count:0.5, largeTenant:0.3, quality:0.2}`，从未调用 `getWeights()`。用户在多维表格调整公式后，Top 问题排序仍用旧权重，违反 PRD-FLOW-015（按大租户反馈数降序，权重可配置）。

**研发修复**（文件 `src/lib/monthly-task-runner.ts`）：

1. **调整步骤顺序**：将"公式同步"从步骤3 移到 步骤2 之前（即标签自进化后、Top问题生成前），保证用户调整的权重能反哺到本次 Top 问题排序。

2. **注入权重到 TopIssuesGenerator**：在 `new TopIssuesGenerator(storage)` 后，调用 `formulaSync.getWeights()` 并 `generator.setWeights(weights)`。

**具体代码改动**：

```typescript
// 步骤1：标签自进化（保持不变）
// 步骤2（新）：公式同步 + 权重读取（原步骤3 前移）
console.log('[月度任务] 步骤2：公式同步 + 读取权重');
let currentWeights: SortWeights = { count: 0.5, largeTenant: 0.3, quality: 0.2 };
try {
  const formulaSync = new FormulaSync(storage);
  await formulaSync.sync();              // 先同步（用户公式 → 系统存储）
  currentWeights = await formulaSync.getWeights();  // 再读取最新权重
  result.formulaSync = true;
  console.log('✅ 公式同步完成，当前权重:', currentWeights);
} catch (formulaErr) {
  console.error('[月度任务] 公式同步失败:', formulaErr);
}

// 步骤3（新）：Top问题生成（注入权重）
console.log('[月度任务] 步骤3：Top问题生成（使用反哺权重）');
try {
  const generator = new TopIssuesGenerator(storage);
  generator.setWeights(currentWeights);   // 注入从 FormulaSync 读取的权重
  const topIssues = await generator.generate();
  result.topIssues = topIssues;
  await generator.writeToTable(topIssues);
} catch (topErr) { ... }

// 步骤4：生成会议文档（原步骤4）
// 步骤5：发送通知（原步骤5）
```

3. **import 调整**：在 `monthly-task-runner.ts` 顶部新增 `import { SortWeights } from '@/lib/analysis/top-issues';`（如未导入）。

**验证**：
- 运行 `pnpm tsx scripts/test-monthly-direct.ts`
- 检查日志出现 `当前权重:` 输出
- 在飞书 CONFIG 表手动修改 `TOP_ISSUE_WEIGHTS` 值，重新触发，确认 Top 问题排序随权重变化
- 确认 `result.formulaSync === true` 且 `result.topIssues.length > 0`

---

### Round 3：全量回归 + 验证前两轮修复

**验收重点**：回归测试 Round 1 + Round 2 修复点，确保无破坏。

**Checklist**：
1. 触发月分析，确认 5 步全部成功（进化/公式/Top/文档/通知）
2. 检查 Top 问题表有数据，人工字段（负责人/解决方案/迭代周期）未被覆盖
3. 检查月报卡片含 Top 5 问题（tag3/tag2/count/largeTenantRatio）
4. 检查会议文档"典型反馈"为真实反馈内容（非占位符）
5. 检查公式权重日志输出正确

**修复**：如发现回归问题立即修复；无问题则进入 Round 4。

---

### Round 4：修复 P1 合规问题 #6/#7/#8（卡片标题系统名化）

**验收发现**：`bot.ts` 4 处硬编码"Feelgood"（L976 周报卡片正文、L1060 周报卡片header、L1103 月报卡片正文、L1223 月报卡片header），违反 PRD-BOT-001/006 要求标题格式 `【{系统名} 打标周报】` / `【{系统名} 月度分析】`。系统名应从配置读取（`SYSTEM_NAME` 环境变量或 KV `system.name`），缺省回退 "NPS Insight"。

**研发修复**（文件 `src/lib/feishu/bot.ts`）：

1. **新增获取系统名函数**：
```typescript
function getSystemName(): string {
  // 优先环境变量，回退默认值
  return process.env.SYSTEM_NAME || 'NPS Insight';
}
```

2. **替换 4 处硬编码**：
- L976: `**📊 【Feelgood 打标周报】` → `**📊 【${getSystemName()} 打标周报】`
- L1060: `📊 【Feelgood 打标周报】` → `📊 【${getSystemName()} 打标周报】`
- L1103: `**📈 【Feelgood月度分析】` → `**📈 【${getSystemName()} 月度分析】`
- L1223: `📈 【Feelgood月度分析】` → `📈 【${getSystemName()} 月度分析】`

3. **问题 #8 验证**：检查 `createWeeklyReportCard` 是否接收并使用 `dashboardUrl`（PRD-BOT-004 "完整看板"按钮）。若未接收，新增参数并渲染按钮。

**验证**：
- 设置 `SYSTEM_NAME=测试系统` 环境变量
- 触发周打标和月分析
- 检查飞书群收到的卡片标题为 `【测试系统 打标周报】` / `【测试系统 月度分析】`
- 检查周报卡片含"完整看板"按钮且链接正确

---

### Round 5：修复 P1 问题 #9/#10/#11

**问题 #9：Top问题文档只展示20行**
- 文件：`src/lib/monthly-task-runner.ts` `generateMeetingDoc`
- 现状：已改为 `Math.min(30, topIssues.length)`（Round 1 修复时附带）
- 本轮验证确认文档表格显示 20-30 行，符合 PRD-FLOW-015

**问题 #10：清理 V1 tag-evolution 残留**
- 文件：`src/lib/monthly-task-runner.ts` L5
- 现状：`import { TagEvolution, EvolutionReport } from '@/lib/ai/tag-evolution';` 但代码中使用 V2（`runTagEvolutionV2`）
- 修复：删除 L5 该 import；用 Grep 确认 `TagEvolution`/`EvolutionReport` 在本文件无其他引用后删除

**问题 #11：周报Top问题维度一致性**
- 文件：`src/lib/documents/weekly-generator.ts` L26
- 现状：`topIssues: { tag1: string; count: number }[]`（用 Tag1）
- PRD-BOT-002 要求周报卡片 Top 5 格式 `{Tag3名称} ({Tag2名称}) - {次数}次 ({占比}%)`（用 Tag3+Tag2）
- 修复：
  1. 修改 `topIssues` 类型为 `{ tag3: string; tag2: string; count: number; ratio?: number }[]`
  2. 在 `generateWeeklyReport` 中按 Tag3 聚合统计（而非 Tag1）
  3. 计算占比 `ratio = count / totalFeedbacks * 100`
  4. 返回给卡片渲染时使用 Tag3+Tag2 格式

**验证**：
- 触发周打标，检查周报卡片 Top 5 格式为 `1. {Tag3} ({Tag2}) - {次数}次 ({占比}%)`
- 检查月报文档 Top 问题表格 20-30 行
- 运行 `pnpm tsc --noEmit` 确认无类型错误

---

### Round 6：修复 P1 问题 #12（超时保护）+ 全量回归

**问题 #12：超时保护验证**
- 文件：`src/app/api/cron/sync/sync-task.ts`
- 现状：已有 `withTimeout` 函数（L40）和 KV 读取超时（L57-63）
- 验收：检查 `sendNotification` 和 `generateWeeklyDoc` 调用是否被 `withTimeout` 包裹
- 修复：若未包裹，添加 `await withTimeout(sendNotification(...), '通知发送', 30000)` 和 `await withTimeout(generateWeeklyDoc(...), '文档生成', 120000)`

**全量回归 Checklist**（同 Round 3）+ 额外：
- 模拟通知发送慢/失败场景，确认有超时报错而非挂起
- 模拟文档生成慢场景，确认超时保护生效

---

### Round 7：AI 打标质量 + Prompt 优化

**验收重点**（对照 PRD-FLOW-010、PRD-TAGS）：
- E1: Tag1 是否从固定 7 类选择（功能/Bug/性能/体验/数据/安全/其他）
- E2: Tag3 是否像 Bug 标题精确（非"卡顿"泛化，而是"打卡定位失败"）
- E3: 打标顺序 Tag3→Tag2→Tag1（检查 `src/lib/ai/prompts.ts`）
- E4: 置信度<0.8 标记"待审核"
- E5: needLogCheck 三条件（描述卡顿/白屏/崩溃 + 无法从文字判断原因 + 技术现象）

**修复**（文件 `src/lib/ai/prompts.ts`）：
1. 检查 Prompt 是否明确 Tag1 固定 7 类枚举
2. 检查 Prompt 是否要求 Tag3 精确到具体问题（给出示例）
3. 检查 needLogCheck 三条件是否在 Prompt 中明确并列
4. 检查置信度阈值是否硬编码（应从配置读取）

**验证**：
- 抽查 10 条反馈，对照打标结果人工评估准确率
- 检查低置信度反馈是否标记"待审核"
- 检查卡顿类反馈是否标记"需查日志"

---

### Round 8：标签自进化效果 + 优化

**验收重点**（对照 PRD-FLOW-014、PRD-EVO-001~004）：
- 标签自进化先于 Top 问题执行（Round 2 已调整顺序，本轮验证）
- 同层级语义相同标签合并，保留高频名称
- Tag2 下 Tag3 超 10 个且能分类的自动拆分
- 合并后更新历史反馈引用
- 冷门标签保留

**修复**（文件 `src/lib/ai/tag-evolution-v2.ts`）：
1. 检查合并阈值（语义相似度阈值，建议 0.85）
2. 检查拆分阈值（Tag3 数量 > 10）
3. 检查合并后是否调用 `storage.updateRecord` 更新历史反馈的 Tag3 引用
4. 检查人工复核项是否写入 `manualReviewItems`

**验证**：
- 在 Tag3 表手动添加两个同义标签（如"打卡定位失败"+"定位异常"）
- 触发月分析，确认合并执行且保留高频名
- 确认历史反馈的 Tag3 字段已更新为保留标签

---

### Round 9：翻译/缓存机制

**验收重点**（对照 PRD-FLOW-009、PRD-TAGS-006）：
- 非中文反馈自动翻译为中文，记录在"翻译后文本"字段
- 后续 AI 分析基于中文内容
- 标签缓存 5 分钟机制（PRD-TAGS-006）

**修复**：
1. 检查 `src/lib/ai/` 翻译逻辑是否调用语言检测 + 翻译
2. 检查标签缓存 TTL 是否为 5 分钟
3. 检查翻译失败时是否回退原文（不阻断流程）

**验证**：
- 在反馈表添加一条英文反馈
- 触发周打标，确认"翻译后文本"字段有中文译文
- 确认 AI 打标基于译文进行

---

### Round 10：全量验收所有 Checklist 项

**执行**：按 `qa-dev-12-rounds-plan.md` 的 Checklist A-E 全量检查（35 项）：
- A. 实际触发任务（月分析 + 周打标）
- B. 检查飞书多维表格数据（B1-B10）
- C. 检查 Bot 消息卡片（C1-C10）
- D. 检查周报/月报文档内容（D1-D7）
- E. 检查 AI 打标质量（E1-E6）

**修复**：发现的任何遗漏问题立即修复。

---

### Round 11：边界 Case 测试

**测试场景**：
1. 空数据：清空反馈表后触发月分析，确认无报错且生成空报表
2. 超大数据：导入 500+ 条反馈，确认批处理正常（batchSize=500）
3. Token 过期：模拟 user_access_token 过期，确认自动刷新机制生效
4. 多维表格字段缺失：删除某个字段后触发，确认有友好报错
5. Bot 命令：在飞书群 @机器人 测试 `/nps help`、`/nps status`、`/nps tag`

**修复**：边界 case 暴露的问题。

---

### Round 12：最终验收

**执行**：
1. 运行 `pnpm tsx scripts/test-monthly-direct.ts 10`（10 轮月分析），确认通过率 100%
2. 运行 `pnpm tsx scripts/test-tagging.ts`，确认周打标正常
3. 全量 Checklist A-E 复检
4. 确认无回归问题
5. 输出最终验收报告：12 项 P0/P1 问题修复状态 + Checklist 通过情况

**验收通过标准**：
- P0 问题（#1-#5）全部修复 ✅
- P1 问题（#6-#12）全部修复
- Checklist A-E 所有检查项通过
- 月分析 10 轮测试通过率 100%
- 周打标流程正常完成
- 无回归问题

---

## 关键文件清单（修改对象）

| 文件 | 涉及轮次 | 修改内容 |
|------|----------|----------|
| `src/lib/monthly-task-runner.ts` | R2,R5 | 调整步骤顺序注入权重；删除V1残留import |
| `src/lib/feishu/bot.ts` | R4 | 4处"Feelgood"→`getSystemName()`；周报卡片补仪表盘按钮 |
| `src/lib/documents/weekly-generator.ts` | R5 | Top问题维度 Tag1→Tag3+Tag2 |
| `src/app/api/cron/sync/sync-task.ts` | R6 | 补 sendNotification/generateWeeklyDoc 超时保护 |
| `src/lib/ai/prompts.ts` | R7 | 优化 Tag1枚举/Tag3精确度/needLogCheck三条件 |
| `src/lib/ai/tag-evolution-v2.ts` | R8 | 优化合并/拆分阈值 + 历史引用更新 |

## 参考文件（只读）

| 文件 | 用途 |
|------|------|
| `docs/prd/04_核心流程_PRD_BASELINE.md` | FLOW-001~017 验收标准 |
| `docs/prd/05_Bot通知_PRD_BASELINE.md` | BOT-001~011 卡片格式标准 |
| `docs/prd/03_标签体系_PRD_BASELINE.md` | TAGS 标签规范 |
| `docs/prd/07_标签自进化_PRD_BASELINE.md` | EVO 自进化规则 |
| `.trae/documents/qa-dev-12-rounds-plan.md` | 原始 12 轮计划（问题清单+Checklist） |
| `scripts/test-monthly-direct.ts` | 月分析测试入口 |
| `scripts/test-tagging.ts` | 周打标测试入口 |

---

## 假设与决策

1. **Round 1 修复已生效**：基于上一会话总结，不再重复修复 #1/#2/#4/#5/#15，Round 2 起直接处理 #3。
2. **步骤顺序调整决策**：将公式同步前移到 Top 问题生成之前（而非 Top 问题生成后再同步一次），因为公式同步的目的是把用户调整的权重反哺给本次排序，必须在排序前读取。
3. **系统名来源**：优先 `process.env.SYSTEM_NAME`，回退默认值 "NPS Insight"（不读 KV，避免每次渲染卡片都查 KV 增加延迟）。如需多用户系统名，后续迭代再扩展。
4. **不破坏现有功能**：每轮修复后必须运行 `pnpm tsc --noEmit` 确认无类型错误，并实际触发任务验证。
5. **每轮验收-开发一体**：用户明确"一轮包括了验收和开发"，每轮内完成验收发现问题→修复→验证修复。
6. **权重注入点**：`TopIssuesGenerator.setWeights()` 已存在（L105），只需在 `generate()` 调用前调用即可，无需改 `top-issues.ts` 内部逻辑。

## 验证步骤（每轮通用）

1. **代码静态检查**：`pnpm tsc --noEmit && pnpm lint`
2. **实际触发任务**：
   - 月分析：`pnpm tsx scripts/test-monthly-direct.ts`
   - 周打标：`pnpm tsx scripts/test-tagging.ts`
3. **检查飞书多维表格**：反馈表/Top问题表/标签表数据正确性
4. **检查 Bot 卡片**：飞书群收到的卡片标题/内容/按钮
5. **检查文档内容**：打开生成的飞书文档，确认表格/典型反馈/关注点
6. **对照 PRD**：逐条核对 BOT-xxx / FLOW-xxx 验收标准
7. **输出变更摘要**：每轮结束记录"改了什么/为什么改/影响范围"
