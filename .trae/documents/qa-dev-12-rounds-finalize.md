# 周打标 + 月分析全链路验收-修复 12 轮循环（Round 9-12 收尾计划）

## 摘要

本计划承接前序会话：**Round 1-8 已全部完成**（P0 问题 #1-#5、P1 问题 #6-#12 全部修复，AI 打标 E1-E5 验收通过，标签自进化 PRD-FLOW-014 验收通过）。**Round 9 进行中**（翻译/缓存机制 Grep 已确认实现，待出验收结论）。

本计划聚焦 **Round 9 收尾 + Round 10-12 最终验收**，以"实际触发任务 + 日志检查 + 代码审查 + PRD 对照"方式完成剩余 3.5 轮，输出最终验收报告。

**执行方式**：
- 实际触发任务：`nvm use 20 && pnpm tsx scripts/test-monthly-direct.ts` / `scripts/test-tagging.ts`
- 日志检查：检查脚本输出的步骤日志、权重输出、Top 问题数量等
- 代码审查：对需要 UI 确认的项（如飞书多维表格字段、Bot 卡片渲染），通过代码审查间接验证，并输出"需人工确认"清单
- PRD 对照：逐条核对 `docs/prd/04_核心流程`、`docs/prd/05_Bot通知`、`docs/prd/03_标签体系`、`docs/prd/07_标签自进化`

---

## 当前状态分析（Phase 1 探索结论）

### 已完成修复（Round 1-8，不再重复）

| 轮次 | 问题 | 文件 | 修复状态 |
|------|------|------|----------|
| R1 | #1 Top问题表未写入 | `monthly-task-runner.ts` | ✅ 调用 `generator.writeToTable(topIssues)` |
| R1 | #2 月报卡片缺Top问题 | `monthly-task-runner.ts` | ✅ 传 `cardTopIssues` 给 `createMonthlyReportCard` |
| R1 | #4 典型反馈为占位符 | `monthly-task-runner.ts` `generateMeetingDoc` | ✅ 从反馈表按 Tag2 筛选低分前3条 |
| R1 | #5 数据结构不匹配 | `top-issues.ts` `TopIssue` 接口 | ✅ 扩展 module/tag3/totalCount 等字段 |
| R1 | #15 人工字段被覆盖 | `top-issues.ts` `writeToTable` | ✅ 更新时只更新排名+统计字段 |
| R2 | #3 公式权重未反哺 | `monthly-task-runner.ts` 步骤2/3 | ✅ 公式同步前移 + `generator.setWeights(currentWeights)` |
| R4 | #6/#7 卡片标题硬编码"Feelgood" | `feishu/bot.ts` | ✅ 4处改用 `getSystemName()` |
| R4 | #8 周报卡片缺仪表盘按钮 | `feishu/bot.ts` `createWeeklyReportCard` | ✅ 新增 `dashboardUrl` 参数 |
| R5 | #10 V1 tag-evolution 残留 import | `monthly-task-runner.ts` L5 | ✅ 已删除 |
| R5 | #11 周报Top问题维度不一致 | `documents/weekly-generator.ts` | ✅ Tag1→Tag3+Tag2+ratio，与卡片一致 |
| R6 | #12 超时保护 | `api/cron/sync/sync-task.ts` | ✅ `generateWeeklyDoc` 120s、`sendNotification` 30s |
| R7 | E1-E5 AI打标质量 | `ai/prompts.ts` | ✅ 验收通过，Prompt 质量高无需修改 |
| R8 | 标签自进化规则 | `ai/tag-evolution-v2.ts` | ✅ PRD-FLOW-014 全部合规 |

### Round 9 待出验收结论

| 验收项 | 代码位置 | 实现状态 |
|--------|----------|----------|
| 翻译写入 TRANSLATED_CONTENT 字段 | `tagger.ts` L272 | ✅ `[FEEDBACK_FIELDS.TRANSLATED_CONTENT]: aiResult.translatedContent \|\| ''` |
| Prompt 指示翻译规则 | `prompts.ts` L73-74 | ✅ "若反馈原文不是中文，翻译为中文填入；若已是中文，保持为空字符串" |
| 标签缓存 5分钟 TTL | `tagger.ts` L43 | ✅ `const TAG_CACHE_TTL_MS = FIVE_MINUTES_MS;` |
| `getCachedTags()` 缓存读取 | `tagger.ts` L48-55 | ✅ 5分钟内读缓存，过期重新查询 |
| `invalidateTagCache()` 清缓存 | `tagger.ts` L61-63 | ✅ 标签创建后(L339)、进化后(tag-evolution-v2.ts L569)自动清缓存 |

---

## 详细实施计划（Round 9 - Round 12）

### Round 9：翻译/缓存机制验收收尾

**执行**：基于 Phase 1 探索的代码审查结论，输出 Round 9 验收结论。

**验收结论**：
1. **翻译机制（PRD-FLOW-009）** ✅ 通过
   - LLM 在打标时一次性完成翻译（非独立翻译步骤），翻译结果写入 `TRANSLATED_CONTENT` 字段
   - 中文反馈翻译字段为空字符串，非中文反馈翻译为中文
   - 后续 AI 分析基于中文译文（Prompt 中 `translatedContent` 字段）
2. **缓存机制（PRD-TAGS-006）** ✅ 通过
   - 首次打标从飞书加载全量标签到内存
   - 5分钟内重复打标直接读缓存
   - 标签创建/合并/拆分后自动调用 `invalidateTagCache()` 失效缓存
   - 缓存失效后下次打标重新查询

**待实际触发验证项**（合并到 Round 10）：
- 翻译失败时是否回退原文（不阻断流程）— 需检查 `tagger.ts` 异常处理
- 实际外文反馈的翻译效果 — 需实际触发打标

**结论**：Round 9 验收通过，无需代码修改。

---

### Round 10：全量验收 Checklist A-E（35项）

**执行步骤**：
1. 代码静态检查：`nvm use 20 && node ./node_modules/typescript/bin/tsc --noEmit`
2. 触发月分析：`nvm use 20 && pnpm tsx scripts/test-monthly-direct.ts 2>&1`
3. 触发周打标：`nvm use 20 && pnpm tsx scripts/test-tagging.ts 2>&1`
4. 逐项核对 Checklist A-E（见下方）
5. 发现问题立即修复
6. 修复后重新触发验证

#### Checklist A：实际触发任务

| 项 | 检查内容 | 检查方法 | 预期 |
|----|----------|----------|------|
| A1 | 月分析5步全部成功 | 检查日志 `✅` 标记 | 进化→公式→Top→文档→通知 全部成功 |
| A2 | 周打标流程完成 | 检查日志 `[Cron] 同步任务完成` | 拉取→去重→打标→通知→周报 全部成功 |
| A3 | 月分析无报错 | 检查日志无 `[月度任务] xxx失败` | 无错误日志 |
| A4 | 周打标无报错 | 检查日志无 `[Cron] xxx失败` | 无错误日志 |

#### Checklist B：飞书多维表格数据（代码审查 + 日志）

| 项 | 检查内容 | 检查方法 | PRD | 状态预判 |
|----|----------|----------|------|----------|
| B1 | 反馈表 STATUS 更新为"已打标" | 代码审查 `tagger.ts` L273 | FLOW-011 | ✅ `[FEEDBACK_FIELDS.STATUS]: '已打标'` |
| B2 | Tag1/Tag2/Tag3 为 MultiSelect 数组格式 | 代码审查 `tagger.ts` L266-268 | TAGS-001 | ✅ `(aiResult.tag1 \|\| []).filter(t => t)` |
| B3 | 置信度字段有值（0-1） | 代码审查 `tagger.ts` L269 | FLOW-010 | ✅ `[FEEDBACK_FIELDS.CONFIDENCE]: aiResult.confidence` |
| B4 | 待审核字段正确标记（低置信度→"是"） | 代码审查 `tagger.ts` L271 + L453 | FLOW-010 | ✅ `reviewNeeded = confidence < confidenceThreshold` |
| B5 | 需查日志字段正确标记 | 代码审查 `tagger.ts` L270 | FLOW-010 | ✅ `aiResult.needLogCheck ? '是' : '否'` |
| B6 | 翻译后文本字段有值（外文反馈） | 代码审查 `tagger.ts` L272 | FLOW-009 | ✅ 已验收(R9) |
| B7 | Top问题表有数据 | 日志 `✅ Top问题表写入完成` | FLOW-015 | ✅ R1修复 |
| B8 | Top问题表人工字段未被覆盖 | 代码审查 `top-issues.ts` `writeToTable` | FLOW-015 | ✅ R1修复，只更新排名+统计 |
| B9 | Top问题数量 20-30 条 | 日志 `Top问题生成完成，共 N 个` | FLOW-015 | ⚠️ 需实际触发确认（可能<20） |
| B10 | 标签自进化执行 | 日志 `✅ 标签自进化完成` | EVO-001 | ✅ R8验收 |

#### Checklist C：Bot 消息卡片（代码审查）

| 项 | 检查内容 | 检查方法 | PRD | 状态预判 |
|----|----------|----------|------|----------|
| C1 | 周报卡片标题格式 | 代码审查 `bot.ts` `createWeeklyReportCard` | BOT-001 | ✅ R4修复 `${getSystemName()} 打标周报` |
| C2 | 周报卡片含拉取数/平均分/待审核数 | 代码审查 `bot.ts` | BOT-001 | ⚠️ 需审查代码确认 |
| C3 | 周报卡片 Top5 格式 `{Tag3} ({Tag2}) - {次数}次 ({占比}%)` | 代码审查 `bot.ts` | BOT-002 | ✅ R5修复 |
| C4 | 周报卡片评分分布 `1分占X% \| 2-3分占Y% \| 4-5分占Z%` | 代码审查 `bot.ts` | BOT-003 | ⚠️ 需审查代码确认 |
| C5 | 周报卡片按钮：审核标签/完整看板/查看日志 | 代码审查 `bot.ts` | BOT-004 | ⚠️ 需审查代码确认 |
| C6 | 周报卡片待审核>100 红色警告 | 代码审查 `bot.ts` | BOT-005 | ⚠️ 需审查代码确认 |
| C7 | 月报卡片标题格式 | 代码审查 `bot.ts` `createMonthlyReportCard` | BOT-006 | ✅ R4修复 `${getSystemName()} 月度分析` |
| C8 | 月报卡片 Top问题概览（前3-5条）含 Tag3/Tag2/次数/大租户占比 | 代码审查 `bot.ts` | BOT-007 | ✅ R1修复传 `cardTopIssues` |
| C9 | 月报卡片按钮：Top问题表/会议文档/仪表盘 | 代码审查 `bot.ts` | BOT-008 | ⚠️ 需审查代码确认 |
| C10 | 月报卡片标签自进化摘要 `合并X组，拆分Y组` | 代码审查 `bot.ts` | BOT-009 | ✅ 传 `mergeCount`/`splitCount` |

#### Checklist D：周报/月报文档内容（代码审查）

| 项 | 检查内容 | 检查方法 | PRD | 状态预判 |
|----|----------|----------|------|----------|
| D1 | 周报文档含周期/数据概览/Top问题 | 代码审查 `weekly-generator.ts` `generateWeeklyDocContent` | prd-v2 3.5 | ✅ R5修复 |
| D2 | 月报文档含周期概览 | 代码审查 `monthly-task-runner.ts` `generateMeetingDoc` | FLOW-016 | ✅ L54-57 |
| D3 | 月报文档含标签自进化完整记录 | 代码审查 `generateMeetingDoc` L60-111 | FLOW-016 | ✅ 合并/拆分详情+原因 |
| D4 | 月报文档含 Top问题详情（表格） | 代码审查 `generateMeetingDoc` L114-125 | FLOW-016 | ✅ Markdown表格 30行 |
| D5 | 月报文档含典型反馈原文 | 代码审查 `generateMeetingDoc` L128-171 | FLOW-016 | ✅ R1修复，从反馈表提取 |
| D6 | 月报文档含建议关注点 | 代码审查 `generateMeetingDoc` L174-192 | FLOW-016 | ✅ Top3+标签合并/新标签 |
| D7 | 月报文档表格正确渲染 | 需人工查看飞书文档 | — | ⚠️ 需人工确认 |

#### Checklist E：AI 打标质量（代码审查 + 日志）

| 项 | 检查内容 | 检查方法 | 状态预判 |
|----|----------|----------|----------|
| E1 | Tag1 从固定7类选择 | 代码审查 `prompts.ts` L54/L77 | ✅ R7验收 |
| E2 | Tag3 像 Bug 标题精确 | 代码审查 `prompts.ts` L37-43 | ✅ R7验收 |
| E3 | 打标顺序 Tag3→Tag2→Tag1 | 代码审查 `prompts.ts` 概念顺序 | ✅ R7验收 |
| E4 | 置信度<0.8 标记待审核 | 代码审查 `tagger.ts` L233/L453 | ✅ R7验收 |
| E5 | needLogCheck 三条件 | 代码审查 `prompts.ts` L56-64 | ✅ R7验收 |
| E6 | 标签同义重复需自进化合并 | 代码审查 `tag-evolution-v2.ts` | ✅ R8验收 |

**Round 10 修复策略**：
- 对 ⚠️ 标记的项进行深入代码审查，确认是否已实现
- 发现未实现的项立即修复
- B9（Top问题数量<20）如果实际触发后数量不足，检查 `top-issues.ts` 的生成逻辑是否有过滤条件过于严格

**关键代码审查对象**（Round 10 需深入检查）：
1. `src/lib/feishu/bot.ts` `createWeeklyReportCard` — C2/C4/C5/C6
2. `src/lib/feishu/bot.ts` `createMonthlyReportCard` — C9
3. `src/lib/analysis/top-issues.ts` `generate()` — B9（Top问题数量）

---

### Round 11：边界 Case 测试

**测试场景**（全部非破坏性，不修改/删除真实数据）：

#### Case 1：空数据场景
**方法**：代码审查 + 条件分支检查
- 检查 `monthly-task-runner.ts` 当 `topIssues` 为空数组时的处理
- 检查 `weekly-generator.ts` 当 `weekFeedbacks.length === 0` 时的处理
- 检查 `top-issues.ts` 当无反馈数据时的处理
- 预期：不报错，生成空报表，通知仍发送

#### Case 2：超大数据场景（500+ 条）
**方法**：代码审查批处理逻辑
- 检查 `sync-task.ts` `autoTagFeedbacks` 的 `batchSize` 分批处理（L354）
- 检查 `tagger.ts` `batchAnalyzeFeedbacks` 的批处理
- 检查 `top-issues.ts` 是否有分页查询
- 预期：批处理正常，无内存溢出，无超时

#### Case 3：Token 过期场景
**方法**：代码审查自动刷新机制
- 检查 `monthly-task-runner.ts` L244-279 的 token 刷新逻辑
- 检查 `weekly-generator.ts` L109-150 的 token 刷新逻辑
- 检查 `user-resource-store.getValidAccessToken()` 实现
- 预期：token 过期时自动刷新，刷新失败回退到应用身份

#### Case 4：字段缺失场景
**方法**：代码审查防御性处理
- 检查 `tagger.ts` 中 `record.fields[FEEDBACK_FIELDS.CONTENT]` 的空值处理（L363 `String(... \|\| '')`）
- 检查 `top-issues.ts` 中字段读取的防御
- 检查 `bot.ts` 卡片渲染的空值处理
- 预期：字段缺失时有默认值，不报错

#### Case 5：Bot 命令测试
**方法**：代码审查 Bot 命令处理
- 检查 `src/app/api/webhook/feishu/route.ts` 的命令解析
- 检查 `/nps help`、`/nps status`、`/nps tag` 的处理逻辑
- 预期：命令正确解析并响应
- ⚠️ 实际触发需在飞书群 @机器人，标注为"需人工确认"

**Round 11 修复策略**：
- 暴露的崩溃性问题（空数据报错等）立即修复
- 健壮性问题（错误提示不友好）记录到问题列表
- Bot 命令问题优先修复

---

### Round 12：最终验收 + 验收报告

**执行步骤**：

#### 步骤1：10轮月分析测试
```bash
nvm use 20 && pnpm tsx scripts/test-monthly-direct.ts 10 2>&1
```
**预期**：通过率 100%，每轮 5 步全部成功（进化→公式→Top→文档→通知）

#### 步骤2：周打标测试
```bash
nvm use 20 && pnpm tsx scripts/test-tagging.ts 2>&1
```
**预期**：打标流程正常完成，无报错

#### 步骤3：全量 Checklist A-E 复检
- 逐项确认 Round 10 的检查结果
- 确认 Round 11 的边界 case 修复有效
- 确认无回归问题

#### 步骤4：代码静态检查
```bash
nvm use 20 && node ./node_modules/typescript/bin/tsc --noEmit
```
**预期**：零类型错误

#### 步骤5：输出验收报告
报告内容：
1. **12 项 P0/P1 问题修复状态**（#1-#15）
2. **Checklist A-E 通过情况**（35项）
3. **10轮月分析测试结果**（通过率、平均耗时）
4. **边界 case 测试结果**（5个场景）
5. **遗留问题与建议**

**验收通过标准**：
- ✅ P0 问题（#1-#5）全部修复
- ✅ P1 问题（#6-#12）全部修复
- ✅ Checklist A-E 所有检查项通过（或标注"需人工确认"）
- ✅ 月分析 10 轮测试通过率 100%
- ✅ 周打标流程正常完成
- ✅ 无回归问题
- ✅ TypeScript 编译零错误

---

## 关键文件清单（Round 10-12 可能修改）

| 文件 | 涉及轮次 | 可能修改内容 |
|------|----------|----------|
| `src/lib/feishu/bot.ts` | R10 | 补充 C2/C4/C5/C6 缺失的卡片元素（如评分分布、按钮、警告） |
| `src/lib/analysis/top-issues.ts` | R10 | 调整 B9 Top问题数量过滤逻辑（如数量<20时放宽条件） |
| `src/lib/monthly-task-runner.ts` | R11 | 空数据防御处理 |
| `src/lib/documents/weekly-generator.ts` | R11 | 空数据防御处理 |
| `src/app/api/webhook/feishu/route.ts` | R11 | Bot 命令处理（如未实现） |

## 参考文件（只读）

| 文件 | 用途 |
|------|------|
| `docs/prd/04_核心流程_PRD_BASELINE.md` | FLOW-001~017 验收标准 |
| `docs/prd/05_Bot通知_PRD_BASELINE.md` | BOT-001~011 卡片格式标准 |
| `docs/prd/03_标签体系_PRD_BASELINE.md` | TAGS-001~006 标签规范 |
| `docs/prd/07_标签自进化_PRD_BASELINE.md` | EVO-001~006 自进化规则 |
| `.trae/documents/qa-dev-12-rounds-plan.md` | 原始 12 轮计划（问题清单+Checklist） |
| `.trae/documents/qa-dev-12-rounds-continue.md` | Round 2-12 续计划 |
| `scripts/test-monthly-direct.ts` | 月分析测试入口 |
| `scripts/test-tagging.ts` | 周打标测试入口 |
| `src/lib/ai/prompts.ts` | AI Prompt 模板 |
| `src/lib/ai/tagger.ts` | AI 打标引擎 |
| `src/lib/ai/tag-evolution-v2.ts` | 标签自进化 V2 |
| `src/lib/monthly-task-runner.ts` | 月度任务编排 |
| `src/lib/feishu/bot.ts` | Bot 卡片生成 |
| `src/lib/documents/weekly-generator.ts` | 周报文档生成 |
| `src/lib/analysis/top-issues.ts` | Top问题生成 |
| `src/lib/analysis/formula-sync.ts` | 公式同步 |

---

## 假设与决策

1. **环境可用性假设**：假设飞书配置（FEISHU_APP_ID/APP_SECRET/BITABLE_TOKEN 等）可用，能实际触发任务。如不可用，回退到纯代码审查模式，Checklist 项标注"代码审查通过，需人工触发确认"。
2. **非破坏性测试原则**：边界 case 测试不删除/修改真实飞书数据。空数据场景通过代码审查验证，超大数据通过 mock 模式（`CRON_DEV_MODE=true`）验证。
3. **范围聚焦**：聚焦周打标+月分析核心流程（FLOW-006~017、BOT-001~011、TAGS-001~006、EVO-001~004）。数据源流程（FLOW-001~005 Excel/API）作为可选项，如 Round 10-12 有余力再覆盖。
4. **pnpm/node 环境**：使用 `nvm use 20` 加载 node 环境，用 `pnpm tsx` 执行 TS 脚本，用 `node ./node_modules/typescript/bin/tsc --noEmit` 做类型检查（绕过 pnpm PATH 问题）。
5. **UI 确认项处理**：作为 AI 无法直接查看飞书 UI，对需要 UI 确认的项（如 B9 实际数据、C1 卡片渲染、D7 表格渲染），通过代码审查+日志输出间接验证，并输出"需人工确认"清单供用户核对。
6. **每轮验收-开发一体**：用户明确"一轮包括了验收和开发"，每轮内完成验收发现问题→修复→验证修复。
7. **不破坏现有功能**：每轮修复后必须运行 `tsc --noEmit` 确认无类型错误，并实际触发任务验证无回归。
8. **Round 9 直接通过**：基于代码审查，翻译/缓存机制均已正确实现，无需修改代码，直接出验收结论进入 Round 10。

## 验证步骤（每轮通用）

1. **代码静态检查**：`nvm use 20 && node ./node_modules/typescript/bin/tsc --noEmit`
2. **实际触发任务**：
   - 月分析：`nvm use 20 && pnpm tsx scripts/test-monthly-direct.ts`
   - 周打标：`nvm use 20 && pnpm tsx scripts/test-tagging.ts`
3. **日志检查**：检查脚本输出的步骤日志、✅/❌ 标记、权重输出、Top问题数量
4. **代码审查**：对需要 UI 确认的项，审查相关代码确认实现
5. **对照 PRD**：逐条核对 BOT-xxx / FLOW-xxx / TAGS-xxx / EVO-xxx 验收标准
6. **输出变更摘要**：每轮结束记录"改了什么/为什么改/影响范围"
7. **更新本计划文件**：每轮完成后更新状态（pending→in_progress→completed）
