# NPS Insight 项目进度记录

## 2026-06-23 任务分析

### 分析方法
1. 读取 `projectsFiles/prd-code-diff-analysis.md`（PRD v2 vs 代码差异分析，含 T-01 至 T-13 任务清单）
2. 读取 git log 最近 15 条提交记录
3. 逐任务核对代码实际状态

---

## 已完成任务（对照差异分析文档逐一验证）

| 任务 | 描述 | 状态 | 依据 |
|------|------|------|------|
| T-02 | 公式字段配置 | 已实现 | commit 6e0c83a, bitable-setup.ts `addTagTableFormulas()` |
| T-03 | 标签关联字段 | 已实现 | commit a6bc018, Tag2/Tag3 表 type:16 关联字段 |
| T-04 | 租户信息查询 | 已实现 | commit 07e3eec, `enrichTenantInfo()` 调用租户接口 |
| T-07 | 语言翻译 | 已实现 | commit e7cbd12, tagger.ts `translatedContent` |
| T-08 | 周报文档生成 | 已实现 | commit 07230fa, sync/route.ts 调用 weekly doc API |
| T-10 | 月报 Top 问题摘要 | 已实现 | commit ffaca06, `createMonthlyReportCard` 列出前 5 条 |
| T-11 | Bot 命令处理 | 已实现 | commit de8cec2, webhook 处理 /nps status + /nps tag |

---

## 剩余未完成任务

| 任务 | 优先级 | 描述 | 当前状态 |
|------|--------|------|----------|
| T-01 | P3 | 统一字段命名 (content->反馈原文, source->反馈平台) | 代码仍用 `反馈内容`/`来源`，零处改名 |
| T-05 | P2 | Top 问题表改为关联引用 | `所属模块`/`具体问题` 仍为 Text 类型，非关联引用 |
| T-06 | P3 | 标签名称同步 | tag-evolution 仅做字符串匹配合并/拆分，无名称变更同步 |
| T-09 | P1 | Excel 上传 UI | 后端 `/api/config/import-excel` 已存在，但 IntegrationTab 无上传区域 |
| T-12 | P3 | 飞书原生仪表盘 | bitable-setup 未创建仪表盘/图表 |

---

## 本次执行结果

**实现 T-09: Excel 上传 UI**

### 改动文件
1. `src/apis/config-api.ts` — 新增 `uploadExcel(file)` 函数
2. `src/components/admin/config-center/use-config-actions.ts` — 新增 `importExcel` action
3. `src/components/admin/config-center/IntegrationTab.tsx` — 新增 Excel 批量导入区块

### 浏览器验证
通过 Playwright 截图验证 admin 页面：
- Excel 批量导入区块正常渲染
- 文件上传区域（虚线边框 + 图标）可见
- 列名说明提示框可见
- 无控制台错误

### 提交
- commit: `feat: 实现 Excel 批量导入 UI（T-09）`
- 已推送到 main
