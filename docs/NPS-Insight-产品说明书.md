# NPS Insight 产品说明书

**版本**：v1.0  
**发布日期**：2026-07-01  
**产品负责人**：技术团队

---

## 1. 产品定位与目标

### 1.1 产品定位

NPS Insight 是一款面向 B2B SaaS 企业的 AI 驱动 NPS 反馈分析平台，深度集成飞书生态，实现用户反馈的自动收集、智能分类、深度分析和可视化呈现。

**核心定位**：
- **反馈自动化处理**：替代人工分类、统计工作，将周级处理周期缩短至小时级
- **大客户优先策略**：通过大租户加权算法，优先暴露核心客户痛点
- **闭环迭代机制**：标签自进化 + 公式权重反哺，持续优化分类精度

### 1.2 目标用户

| 用户群体 | 核心诉求 | 使用场景 |
|----------|---------|---------|
| 产品团队 | 快速定位高频问题、优先级排序 | 周报/月报分析、迭代规划 |
| 客服团队 | 识别批量投诉趋势、预警风险 | 大租户问题跟进、SLA 监控 |
| 数据分析团队 | 用户满意度趋势分析、NPS 评分归因 | 数据报表、可视化仪表盘 |
| 技术团队 | 排查技术异常、Bug 定位 | 需查日志反馈处理、根因分析 |

### 1.3 核心价值指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 自动化率 | ≥95% | AI 打标覆盖率，仅 <5% 需人工审核 |
| 处理周期 | ≤8h | 从反馈拉取到周报生成的总耗时（100条） |
| 大租户曝光率 | 100% | Top 问题中 100% 包含大租户占比数据 |
| 标签准确率 | ≥85% | 人工审核确认率（置信度 ≥0.8 的反馈） |

---

## 2. 核心功能模块

### 2.1 功能架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        NPS Insight                           │
├─────────────────────────────────────────────────────────────┤
│  [配置中心]  │  [数据拉取]  │  [AI打标]  │  [月度分析]       │
│  Tab1-3     │  API/Excel   │  三级标签  │  标签自进化       │
│             │              │  置信度    │  Top问题表        │
│             │              │  需查日志  │  公式权重反哺     │
├─────────────────────────────────────────────────────────────┤
│  [飞书多维表格]  │  [飞书群通知]  │  [飞书文档]           │
│  反馈表          │  周报卡片      │  月报会议文档         │
│  标签表          │  月报卡片      │                       │
│  租户表          │  Bot命令       │                       │
│  Top问题表       │               │                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 配置中心（3 Tabs）

**Tab 1：数据源配置**
- API 拉取配置：URL、API Key、时间范围规则
- Excel 上传：拖拽上传、格式校验、字段映射
- 优先级机制：Excel > API，避免数据冲突

**Tab 2：飞书集成**
- 飞书应用配置：App ID、App Secret、权限校验
- 多维表格配置：App Token、自动创建表格、字段初始化
- 通知群配置：Chat ID、通知渠道选择（群/私聊）
- OAuth 授权：用户身份获取，用于创建归档文件夹

**Tab 3：AI 与定时任务**
- AI 配置：模型选择、API Key、Base URL、连接测试
- 置信度阈值：默认 0.8，可调整（影响「待审核」判定）
- 定时任务：周打标（Cron 表达式）、月分析（Cron 表达式）
- 手动触发：「立即执行」按钮，绕过定时

### 2.3 AI 打标模块

**三级标签体系**：

| 层级 | 职责 | 决定因素 | 示例 |
|------|------|---------|------|
| **Tag3**（具体问题） | 现象级描述 | 从用户原话提炼，像 Bug 标题一样精确 | "打卡定位失败"、"提交后页面报错" |
| **Tag2**（功能模块） | 业务域归类 | Tag3 映射到功能模块，可多选 | "打卡异常与故障"、"休假流程故障修复" |
| **Tag1**（问题性质） | 处理路径 | 固定 7 类，决定后续处理链路 | "功能优化"、"疑似Bug"、"用户教育" |

**打标顺序**：Tag3 → Tag2 → Tag1（从具体到抽象）

**关键输出**：
- `confidence`：置信度（0-1），< 阈值标记「待审核」
- `needLogCheck`：需查日志（布尔），描述技术异常但无法判断原因时为 true
- `translatedContent`：翻译内容（非中文反馈自动翻译）

**批量处理机制**：
- 分批：50 条/批次（避免 LLM token 截断）
- 重试：失败后指数退避重试（1s → 2s → 4s，最多 2 次）
- 超时：120s/批次超时保护

### 2.4 月度分析模块

**标签自进化 V2**（AI 驱动）：
- **合并**：相似度 ≥0.85 的 Tag3 自动合并（如 "定位失败" + "定位加载超时" → "定位问题"）
- **拆分**：同一 Tag3 跨多个 Tag2 时拆分（如 "提交失败" 拆为 "打卡提交失败" + "休假提交失败"）
- **复核**：模糊项（相似度 0.7-0.85）进人工复核列表
- **执行顺序**：先 Tag3 后 Tag2，避免跨层级干扰

**Top 问题生成**：
- 加权排序公式：`综合评分 = count权重(50%) × 数量归一化 + largeTenant权重(30%) × 大租户占比 + quality权重(20%) × (10-平均NPS)/10`
- 取 Top 30 写入多维表格
- 支持用户在表格调整权重（公式权重反哺）

**公式权重反哺**：
- 用户在多维表格「综合评分」公式中调整权重比例
- 系统读取公式字段解析权重：`$column[fid]` → 字段ID 映射
- 下次月分析自动应用新权重

### 2.5 通知模块

**周报卡片**（PRD-BOT-001~005）：
- 基本信息：本周拉取数、待审核数、需查日志数
- Top 5 问题：按反馈数降序，含 Tag2/Tag3/次数/占比
- 评分分布：1 分 / 2-3 分 / 4-5 分 三档百分比
- 操作按钮：审核标签（打开表格筛选）、完整看板、查看日志平台
- 警告：待审核 >100 条时显示红色警告

**月报卡片**（PRD-BOT-006~009）：
- Top 问题概览：前 3-5 条，含大租户占比
- 标签自进化摘要：合并/拆分组数
- 操作按钮：Top 问题表、会议文档、可视化仪表盘

**Bot 命令**（PRD-BOT-011）：
- `/nps help`：帮助信息
- `/nps status`：配置状态
- `/nps tag`：手动触发周打标
- `/nps analyze`：手动触发月分析

---

## 3. 技术架构

### 3.1 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                         前端层                                │
│  Next.js 14 + TypeScript + Tailwind CSS                      │
│  ├── 首页（数据概览）                                         │
│  ├── 配置中心（3 Tabs）                                       │
│  └── API 路由（/api/config, /api/feedback, /api/cron）        │
└──────────────────────────────────────────────────────────────┘
                              ↓ HTTP
┌──────────────────────────────────────────────────────────────┐
│                         服务层                                │
│  ├── 数据源适配器（AdapterFactory）                          │
│  │   ├── API 拉取（FeelGood API）                            │
│  │   └── Excel 上传                                          │
│  ├── AI 打标服务（tagger.ts）                                │
│  │   ├── 单条打标                                            │
│  │   └── 批量打标（50条/批次）                                │
│  ├── 月分析服务（monthly-task-runner.ts）                    │
│  │   ├── 标签自进化（TagEvolution）                          │
│  │   ├── Top问题生成（TopIssuesGenerator）                   │
│  │   └── 公式同步（FormulaSync）                             │
│  ├── 通知服务（feishu-notification.ts）                      │
│  └── 文档服务（feishu-document.ts）                          │
└──────────────────────────────────────────────────────────────┘
                              ↓ SDK
┌──────────────────────────────────────────────────────────────┐
│                       集成层                                  │
│  ├── 飞书 SDK（@larksuiteoapi/node-sdk）                     │
│  │   ├── 多维表格 API（bitable）                             │
│  │   ├── 消息 API（im）                                      │
│  │   ├── 文档 API（docx）                                    │
│  │   └── 用户授权（OAuth）                                   │
│  ├── LLM SDK（OpenAI Chat Completions 兼容）                 │
│  │   ├── AgnesAI                                             │
│  │   ├── OpenAI                                              │
│  │   ├── 其他兼容模型                                        │
│  └──────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│                       存储层                                  │
│  ├── 飞书多维表格（主数据存储）                               │
│  │   ├── 反馈表（feedback）                                  │
│  │   ├── 标签表（tag1/tag2/tag3）                            │
│  │   ├── 租户表（tenants）                                   │
│  │   ├── Top问题表（top_issues）                             │
│  ├── KV 存储（配置存储）                                      │
│  │   ├── Vercel KV（生产）                                   │
│  │   ├── .env 文件（本地开发）                               │
│  └──────────────────────────────────────────────────────────┘
```

### 3.2 Adapter 模式（飞书剥离准备）

为未来迁移到其他平台（如钉钉、企业微信），所有飞书 API 调用通过 Adapter 接口封装：

| Adapter | 接口 | 当前实现 |
|---------|------|---------|
| `StorageAdapter` | 存储层 | `feishu-storage.ts`（多维表格） |
| `NotificationAdapter` | 通知层 | `feishu-notification.ts`（群消息卡片） |
| `DocumentAdapter` | 文档层 | `feishu-document.ts`（飞书 Docx） |
| `AdapterFactory` | 服务工厂 | 按配置创建不同实现 |

### 3.3 多 LLM Provider

支持多种 LLM，统一使用 OpenAI Chat Completions 格式：

```typescript
interface LLMConfig {
  provider: 'agnesai' | 'openai' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;  // 默认 4096
  temperature: number; // 默认 0.3
}
```

---

## 4. 系统需求与部署

### 4.1 运行环境

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥18.x | 服务端运行环境 |
| npm/pnpm | ≥8.x | 包管理器 |
| Vercel | Pro 账户 | 推荐：Cron 任务支持、KV 存储 |
| 或腾讯云 SCF | Nodejs18.15 运行时 | 替代方案：API 网关 + SCF HTTP 函数 |

### 4.2 外部依赖

| 服务 | 用途 | 配置项 |
|------|------|--------|
| 飞书开放平台 | 多维表格、消息、文档、用户授权 | `FEISHU_APP_ID`, `FEISHU_APP_SECRET` |
| LLM API | AI 打标、标签自进化 | `AI_API_KEY`, `AI_BASE_URL` |
| 反馈 API（可选） | 数据拉取 | `DATA_SOURCE_CONFIG` |
| 日志平台（可选） | 技术异常排查 | `LOG_PLATFORM_URL` |

### 4.3 部署方式

**方式 A：Vercel 部署（推荐）**

```bash
# 1. 推送代码到 GitHub
git push origin main

# 2. Vercel 导入项目，自动检测 Next.js
# 3. 配置环境变量（Settings → Environment Variables）
# 4. 部署成功后，配置 Vercel Cron：
#    - 周打标：每周一 09:00 → /api/cron/sync
#    - 月分析：每月 1 日 00:00 → /api/cron/monthly

# 5. 配置飞书应用事件订阅
#    URL: https://{your-domain}/api/webhook/feishu
```

**方式 B：腾讯云 SCF 部署**

```bash
# 1. 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 2. 登录授权
tcb login

# 3. 执行部署脚本
./scripts/prepare-deploy.sh && tcb fn deploy

# 4. 配置 API 网关触发器（HTTP 触发）
# 5. 配置定时触发器（Cron 表达式）
```

### 4.4 端口配置

- **固定端口**：3002（开发环境）
- 如端口占用，执行 `kill -9 $(lsof -t -i:3002)` 后重启

---

## 5. 数据安全与权限设计

### 5.1 数据安全措施

| 安全项 | 控制措施 |
|--------|---------|
| 密钥存储 | 敏感字段（App Secret、API Key）显示为密文 `__SET__`，有编辑按钮 |
| 配置保存 | 敏感字段保存后不调用 `loadConfig()`，避免输入被替换为密文 |
| 环境隔离 | 开发/生产环境分离，禁止在生产环境直接修改代码 |
| Token 管理 | 用户 Token 自动刷新（7-30 天有效），过期后回退应用身份 |

### 5.2 权限设计

**飞书应用权限**：

| 权限 | 用途 | 授权范围 |
|------|------|---------|
| `bitable:read` | 读取多维表格 | 应用身份 |
| `bitable:write` | 写入多维表格 | 应用身份 |
| `im:message` | 发送群消息 | 应用身份 |
| `im:message:receive_as_bot` | 接收群消息（Bot 命令） | 应用身份 |
| `docx:document` | 创建/编辑飞书文档 | **用户身份**（需 OAuth） |
| `drive:drive` | 创建云空间文件夹 | **用户身份**（需 OAuth） |

**多维表格权限**：

- 应用需添加为多维表格协作者，权限级别：`full_access`
- 用户通过 OAuth 授权后，文档归属用户（非应用）

### 5.3 用户身份获取

**飞书 Webview 环境**：
- 自动检测 `window.lark?.oauth` JSAPI
- 使用 `lark.oauth.getAuthCode()` 静默授权
- 失败后自动回退 OAuth Redirect 流程

**外部浏览器**：
- OAuth 授权流程：`/api/user-resource/auth` → 回调 → 存储 Token

---

## 6. 扩展性与定制化

### 6.1 多数据源扩展

通过 Adapter 模式支持新数据源：

```typescript
// 新增数据源示例（如钉钉表格）
class DingTalkStorageAdapter implements StorageAdapter {
  async createRecord(table: string, data: any): Promise<string> { ... }
  async listRecords(table: string, filter?: any): Promise<any[]> { ... }
  // ...
}

// 在 AdapterFactory 注册
AdapterFactory.registerStorage('dingtalk', () => new DingTalkStorageAdapter());
```

### 6.2 LLM Provider 扩展

新增 LLM Provider 只需实现统一接口：

```typescript
interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResult>;
  setConfig(config: LLMConfig): void;
}

// 新增示例（如 Claude）
class ClaudeProvider implements LLMProvider {
  async chat(params) { ... }
}
```

### 6.3 标签定制化

- **Tag1 增删改**：管理员在配置中心直接操作，实时生效
- **Tag2/Tag3 自进化**：AI 自动优化，人工复核干预
- **置信度阈值调整**：Tab 3 配置，影响「待审核」判定

### 6.4 权重公式定制化

用户可在多维表格「综合评分」公式字段直接调整权重：

```
// 原公式（默认）
{totalCount} * 0.5 + {largeTenantRatio} * 0.3 + {(10 - avgScore)} * 0.2

// 用户调整为（如更关注大租户）
{totalCount} * 0.3 + {largeTenantRatio} * 0.5 + {(10 - avgScore)} * 0.2
```

系统通过 `FormulaSync.getWeights()` 自动读取新权重，下次月分析应用。

---

## 7. API 接口说明（简要）

### 7.1 核心接口

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/config` | GET/POST | 获取/保存配置 |
| `/api/feedback` | GET | 查询反馈数据 |
| `/api/cron/sync` | GET/POST | 周打标任务（Vercel Cron 或手动） |
| `/api/cron/monthly` | GET/POST | 月分析任务 |
| `/api/webhook/feishu` | POST | 飞书事件回调（Bot 命令） |
| `/api/user-resource/auth` | GET | OAuth 授权入口 |
| `/api/user-resource/auth/callback` | GET | OAuth 回调 |

### 7.2 接口鉴权

- **Cron 接口**：`Authorization: Bearer {CRON_SECRET}`
- **配置接口**：飞书用户身份自动获取（Webview 环境）
- **Webhook 接口**：飞书签名校验

---

## 8. 版本规划

### 8.1 当前版本（v1.0）

**已交付功能**：
- ✅ 配置中心 3 Tabs
- ✅ AI 打标（单条 + 批量）
- ✅ 周报卡片 + 月报卡片
- ✅ Bot 命令（/nps help/status/tag/analyze）
- ✅ 月度分析（标签自进化、Top问题表、会议文档）
- ✅ 公式权重反哺
- ✅ Excel 上传 + API 拉取
- ✅ 飞书 Webview 静默授权 + OAuth 回退

### 8.2 未来版本规划

| 版本 | 功能 | 优先级 |
|------|------|--------|
| v1.1 | 可视化仪表盘（NPS 趋势图、评分分布柱状图） | P0 |
| v1.2 | 多用户支持（企业级，每个用户独立配置） | P1 |
| v1.3 | 钉钉/企业微信 Adapter（平台迁移） | P1 |
| v1.4 | 反馈原文情感分析（负面程度分级） | P2 |
| v1.5 | AI 自动回复建议（客服场景） | P2 |

---

## 9. 技术支持与维护

### 9.1 监控指标

| 指标 | 监控方式 | 告警阈值 |
|------|---------|---------|
| 周打标成功率 | Vercel/SCF 日志 | 失败率 >5% |
| AI 打标耗时 | 系统日志 | 平均 >120s/批次 |
| Token 刷新失败 | 错误日志 | 连续失败 3 次 |
| 定时任务触发 | Cron 执行记录 | 漏触发 >1 次/周 |

### 9.2 日志位置

- **Vercel**：Deployments → Function Logs
- **腾讯云 SCF**：云函数 → 日志查询
- **本地开发**：终端输出 + `.trae/logs/`

### 9.3 故障排查流程

```
1. 检查配置完整性（/api/config 返回 200）
2. 检查飞书应用权限（测试连接按钮）
3. 检查多维表格协作者权限（飞书表格设置）
4. 检查 AI API 可用性（测试 AI 连接按钮）
5. 检查定时任务部署状态（Vercel Cron / SCF 触发器）
6. 查看服务日志定位具体错误
```

---

## 10. 附录

### 10.1 多维表格字段定义

**反馈表（feedback）**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| feedback_id | 文本 | 反馈唯一ID |
| tenant_id | 文本 | 租户ID |
| tenant_name | 文本 | 租户名称 |
| tenant_scale | 单选 | A1-A6（员工数分级） |
| user_id | 文本 | 用户ID |
| user_name | 文本 | 用户名称 |
| score | 数字 | NPS 评分（1-5） |
| content | 多行文本 | 反馈原文 |
| translated_content | 多行文本 | 翻译内容（非中文） |
| source | 单选 | 来源（小程序/H5/API） |
| create_time | 日期 | 创建时间 |
| tag1 | 多选 | 问题性质（固定7类） |
| tag2 | 多选 | 功能模块（半动态） |
| tag3 | 多选 | 具体问题（最活跃） |
| confidence | 数字 | 置信度（0-1） |
| need_log_check | 复选框 | 需查日志 |
| review_needed | 复选框 | 待审核 |
| remark | 多行文本 | 备注（人工填写） |

**Top问题表（top_issues）**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| tag2 | 单选 | 功能模块 |
| tag3 | 单选 | 具体问题 |
| total_count | 数字 | 总反馈数 |
| large_tenant_count | 数字 | 大租户反馈数 |
| a4_count | 数字 | A4 租户数 |
| a5_count | 数字 | A5 租户数 |
| a6_count | 数字 | A6 租户数 |
| large_tenant_ratio | 公式 | 大租户占比 |
| avg_score | 公式 | 平均评分 |
| score | 公式 | 综合评分（可调整权重） |
| owner | 文本 | 负责人（人工） |
| solution | 多行文本 | 解决方案（人工） |
| status | 单选 | 状态（人工） |

### 10.2 Cron 表达式说明

| 任务 | Cron | 说明 |
|------|------|------|
| 周打标 | `0 9 * * 1` | 每周一 09:00（北京时间） |
| 月分析 | `0 0 1 * *` | 每月 1 日 00:00（北京时间） |

> **注意**：Vercel Cron 使用 UTC 时间，需转换：北京时间 = UTC + 8

### 10.3 联系方式

- **技术支持**：tech@example.com
- **功能建议**：飞书群 @NPS Insight 机器人
- **文档更新**：docs@example.com

---

**产品说明书结束**