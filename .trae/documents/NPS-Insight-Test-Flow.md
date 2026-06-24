# NPS Insight 完整测试流程文档

## 1. 测试流程概览

NPS Insight 的测试流程分为 **8 个核心阶段**，覆盖从配置到通知的完整链路：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NPS Insight 测试流程                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [阶段1] 环境准备 ──▶ [阶段2] 配置验证 ──▶ [阶段3] 数据导入              │
│         │                    │                    │                     │
│         ▼                    ▼                    ▼                     │
│  [阶段4] AI打标 ──▶ [阶段5] 分析报告 ──▶ [阶段6] 通知发送              │
│         │                    │                    │                     │
│         ▼                    ▼                    ▼                     │
│  [阶段7] Bot响应 ──▶ [阶段8] 回归测试                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 测试环境准备

### 2.1 环境要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 18.0 |
| pnpm | >= 8.0 |
| 飞书应用 | 已创建，具备多维表格读写权限 |
| 多维表格 | 已创建（反馈列表、标签体系、租户信息、周期分析） |
| LLM API | 可用的 AgnesAI 或 OpenAI 兼容 API |

### 2.2 环境变量配置

```bash
# 飞书配置
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# 多维表格配置
BITABLE_TOKEN=your_bitable_app_token
BITABLE_URL=https://www.feishu.cn/base/{app_token}
BITABLE_FEEDBACK_TABLE_ID=table_id
BITABLE_TAGS_TABLE_ID=table_id
BITABLE_TENANTS_TABLE_ID=table_id
BITABLE_ANALYSIS_TABLE_ID=table_id

# AI配置
AGNESAI_PROVIDER=agnesai
AGNESAI_API_KEY=your_api_key
AGNESAI_BASE_URL=https://api.agnesai.cn
AGNESAI_MODEL=agnes-2.0-flash

# 数据源配置
DATA_SOURCE_API_URL=https://api.feelgood.example.com/feedbacks
DATA_SOURCE_API_KEY=your_data_source_key
DATA_SOURCE_QUERY_PARAMS='{"start": "{{start_unix}}", "end": "{{end_unix}}"}'
DATA_SOURCE_TIME_RULE=lastWeek

# 通知配置
NOTIFICATION_CHAT_ID=your_chat_id
NOTIFICATION_ADMIN_USER_IDS=user_id1,user_id2

# 定时任务配置
CRON_SECRET=your_cron_secret
CRON_SYNC_SCHEDULE=0 9 * * 1
CRON_ANALYSIS_SCHEDULE=0 9 1 * *
CRON_DEV_MODE=true

# 日志平台配置
LOG_PLATFORM_URL_TEMPLATE=https://log.example.com/search?tenant={{tenantId}}

# 其他
BASE_URL=http://localhost:3000
VERCEL_URL=your_vercel_domain
```

---

## 3. 用户输入方式

### 3.1 输入方式总览

| 输入方式 | 位置 | 用途 | 输入格式 |
|----------|------|------|----------|
| 前端配置中心 | `/admin` | 配置飞书、AI、标签、任务 | 表单输入 |
| Excel导入 | `/admin` → 配置中心 | 批量导入反馈数据 | `.xlsx` 文件 |
| 外部数据源 | 定时任务 | 自动同步反馈数据 | API 返回 JSON |
| 飞书Bot命令 | 飞书群 | 手动触发任务、查询状态 | `/nps <command>` |
| Cron定时任务 | Vercel Cron | 自动执行同步和分析 | 定时触发 |
| API调用 | `/api/*` | 程序matic操作 | HTTP请求 |

### 3.2 详细输入说明

#### 3.2.1 前端配置中心输入

**Tab 1: 飞书与集成**
- App ID（文本输入）
- App Secret（密码输入，保存后显示"已配置"）
- 多维表格 URL 或 App Token（文本输入）
- 数据源 API URL（文本输入）
- 数据源 API Key（密码输入）

**Tab 2: AI与标签**
- AI Provider（下拉选择：agnesai/custom）
- API Key（密码输入）
- Base URL（文本输入）
- Model（文本输入）
- Tag1 标签列表（可增删的表格）
- Tag2 初始化预设（文本输入）
- 置信度阈值（数字输入，0-1）
- 大租户等级（多选：A1-A6）

**Tab 3: 任务与运营**
- 周同步时间（时间选择器）
- 月分析时间（时间选择器）
- 日志平台 URL（文本输入）
- 通知群 ID（文本输入）
- 表格管理员（文本输入，飞书用户ID）

#### 3.2.2 Excel导入输入

**文件格式要求：**
- 必须为 `.xlsx` 格式
- 第一行为表头
- 必须包含的列：
  - `feedbackId`（反馈ID）
  - `content`（反馈内容）
  - `score`（NPS评分，1-5）
  - `createTime`（创建时间，ISO格式）
  - `module`（功能模块）
  - `source`（来源平台）
  - `tenantId`（租户ID）

**可选列：**
- `tenantName`（租户名称）
- `tenantScale`（租户规模）
- `userId`（用户ID）
- `userName`（用户名）

#### 3.2.3 外部数据源输入

**API响应格式：**
```json
{
  "data": [
    {
      "feedbackId": "FB001",
      "content": "打卡定位失败",
      "score": 2,
      "createTime": "2026-06-01T10:30:00Z",
      "module": "打卡小程序",
      "source": "iOS",
      "tenantId": "T001",
      "tenantName": "字节跳动",
      "tenantScale": "A5",
      "larkUserId": "u_12345"
    }
  ],
  "total": 100
}
```

#### 3.2.4 飞书Bot命令输入

| 命令 | 格式 | 功能 |
|------|------|------|
| `/nps help` | `/nps help` | 显示帮助卡片 |
| `/nps status` | `/nps status` | 显示系统状态 |
| `/nps tag` | `/nps tag` | 触发打标任务 |
| `/nps analyze` | `/nps analyze [周期]` | 触发月度分析 |
| `/nps report` | `/nps report` | 显示NPS概况 |
| `/nps feedback` | `/nps feedback [数量]` | 显示最新反馈 |
| `/nps config` | `/nps config` | 显示配置地址 |

#### 3.2.5 Cron定时任务触发

| 任务 | 触发方式 | 执行时间 |
|------|----------|----------|
| 周同步 | `GET/POST /api/cron/sync` | 每周一 09:00 |
| 月分析 | `POST /api/cron/monthly` | 每月1日 09:00 |

---

## 4. Mock数据规范

### 4.1 Mock反馈数据

**数据结构：**
```typescript
interface MockFeedback {
  feedbackId: string;      // 唯一ID，如 FB001
  content: string;         // 反馈内容
  score: number;           // 评分 1-5
  createTime: string;      // ISO时间格式
  module: string;          // 模块名称
  source: string;          // 来源平台
  tenantId: string;        // 租户ID
  tenantName: string;      // 租户名称
  tenantScale: string;     // 租户规模 A1-A6
  userId: string;          // 用户ID
}
```

**数据分布策略：**

| 模块 | 数量 | 占比 | TOP问题 |
|------|------|------|----------|
| 打卡小程序 | 80条 | 40% | 极速打卡定位失败、记录不准、提醒不及时 |
| 休假 | 33条 | 16.5% | 审批慢、流程繁琐 |
| 审批 | 27条 | 13.5% | 流程卡住、驳回理由不清 |
| 加班 | 20条 | 10% | 审批慢、时长计算错误 |
| 统计报表 | 13条 | 6.5% | 数据错误、导出失败 |
| 其他 | 27条 | 13.5% | 系统卡顿、崩溃 |

**评分分布：**

| 评分 | 占比 | 说明 |
|------|------|------|
| 1分 | 20% | 严重问题 |
| 2分 | 25% | 较严重问题 |
| 3分 | 25% | 一般问题 |
| 4分 | 15% | 轻微问题 |
| 5分 | 15% | 正面反馈 |

**示例数据：**
```json
{
  "feedbackId": "FB001",
  "content": "极速打卡定位一直转圈，等了很久提示失败，严重影响工作效率",
  "score": 1,
  "createTime": "2026-06-01T10:30:00Z",
  "module": "打卡小程序",
  "source": "iOS",
  "tenantId": "T001",
  "tenantName": "字节跳动",
  "tenantScale": "A5",
  "userId": "USER0001"
}
```

### 4.2 Mock租户数据

**数据结构：**
```typescript
interface MockTenant {
  tenantId: string;       // 租户ID
  tenantName: string;     // 租户名称
  scale: string;          // 规模 A1-A6
  contact: string;        // 联系人
  contactEmail: string;   // 联系邮箱
  industry: string;       // 行业
  address: string;        // 地址
}
```

**示例数据：**
```json
{
  "tenantId": "T001",
  "tenantName": "字节跳动",
  "scale": "A5",
  "contact": "张三",
  "contactEmail": "zhangsan@bytedance.com",
  "industry": "互联网",
  "address": "北京市海淀区"
}
```

### 4.3 Mock标签数据

**数据结构：**
```typescript
interface MockTag {
  tagId: string;    // 标签ID
  tag1: string;     // 一级标签（7个固定）
  tag2: string;     // 二级标签（功能模块）
  tag3: string;     // 三级标签（具体问题）
  usageCount: number; // 使用次数
}
```

**默认Tag1标签（7个）：**
| 标签名称 | 定义 |
|----------|------|
| 疑似Bug | 功能异常、报错、崩溃、无法使用 |
| 功能优化 | 功能改进建议、新功能诉求 |
| 界面改进 | UI问题、交互体验优化 |
| 性能提升 | 加载慢、卡顿、响应延迟、耗电 |
| 用户教育 | 不知道如何使用、使用指引不清 |
| 安全合规 | 安全漏洞、隐私问题、合规要求 |
| 无效反馈 | SPAM、广告、乱码、无法理解的内容 |

---

## 5. 完整测试流程详解

### 阶段1：环境准备

**步骤：**
1. 安装依赖：`pnpm install`
2. 配置环境变量：`.env` 文件
3. 启动开发服务器：`pnpm dev`

**预期输出：**
- 服务器启动成功，监听端口 3000
- 无编译错误
- 飞书客户端连接成功

**实际输出验证：**
```bash
# 验证服务器启动
curl http://localhost:3000/api/config

# 预期响应
{
  "success": true,
  "data": {
    "feishu": { "appId": "...", "appSecret": "__SET__" },
    "bitable": { "status": "linked" },
    ...
  }
}
```

---

### 阶段2：配置验证

**步骤：**
1. 访问配置中心：`http://localhost:3000/admin`
2. 验证配置回显（从环境变量读取）
3. 修改配置并保存
4. 验证配置持久化（重新加载页面）
5. 测试飞书连接
6. 测试AI连接
7. 测试数据源连接
8. 测试通知发送

**预期输出：**
- 配置中心正常加载
- 敏感字段显示"已配置"
- 非敏感字段显示实际值
- 保存后配置正确写入 `.env` 文件
- 测试连接按钮返回成功提示

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| 配置回显 | 访问 `/admin` | 显示环境变量中的配置值 |
| 敏感字段隐藏 | 查看 AppSecret/ApiKey | 显示"已配置"而非明文 |
| 保存配置 | 修改 Tag1 标签 | 配置写入 `.env`，页面回显更新 |
| 测试飞书连接 | 点击"测试飞书连接" | Toast提示"飞书应用连接正常" |
| 测试AI连接 | 点击"测试AI连接" | Toast提示"AI模型连接正常" |
| 测试通知 | 点击"测试发送通知" | 飞书群收到测试消息 |

---

### 阶段3：数据导入

**步骤：**
1. 使用脚本生成Mock数据：`pnpm tsx scripts/generate-mock-data.ts`
2. 通过Excel导入接口导入数据
3. 通过外部数据源同步数据
4. 通过Mock API获取数据

**预期输出：**
- Mock数据生成成功（200条）
- Excel导入成功，返回统计信息
- 外部数据源同步成功
- 反馈数据正确写入多维表格

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| Excel导入成功 | 上传正确格式的Excel | 返回 `{ success: true, total: N, written: N, skipped: 0 }` |
| Excel导入失败 | 上传错误格式的Excel | 返回明确错误信息 |
| Mock数据生成 | 运行 `generate-mock-data.ts` | 生成 `mock-feedbacks-200.json` |
| Mock API | 访问 `/api/mock/feedbacks` | 返回50条模拟反馈 |
| 数据写入验证 | 查询多维表格 | 反馈列表新增记录 |

---

### 阶段4：AI打标

**步骤：**
1. 确保有未打标的反馈数据
2. 触发打标任务：`POST /api/cron/sync`
3. 验证AI分析结果
4. 验证标签写入

**预期输出：**
- AI成功分析所有未打标反馈
- 标签正确写入多维表格
- 新标签自动添加到标签体系
- 置信度、审核标记等字段正确设置

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| 打标任务触发 | `POST /api/cron/sync` | 返回同步成功 |
| AI分析 | 反馈内容"打卡定位失败" | Tag1=性能提升, Tag2=定位功能, Tag3=定位失败 |
| 标签创建 | 新的三级标签 | 自动添加到标签体系表 |
| 置信度设置 | AI返回置信度0.95 | 写入置信度字段 |
| 审核标记 | 低置信度反馈 | `reviewNeeded=true` |

---

### 阶段5：分析报告

**步骤：**
1. 确保有已打标的反馈数据
2. 触发月度分析：`POST /api/cron/monthly`
3. 验证标签自进化
4. 验证Top问题分析
5. 验证公式同步
6. 验证会议文档生成

**预期输出：**
- 标签自进化完成
- Top问题分析生成
- 分析报告写入周期分析表
- 会议文档生成并分享

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| 月度分析触发 | `POST /api/cron/monthly` | 返回分析成功 |
| 标签自进化 | 相似标签合并 | 标签体系更新 |
| Top问题分析 | 统计Tag3频次 | 生成Top 5问题列表 |
| NPS计算 | 反馈评分数据 | 正确计算NPS分数 |
| 分析报告 | 查询周期分析表 | 包含完整分析数据 |

---

### 阶段6：通知发送

**步骤：**
1. 配置通知群ID
2. 触发周同步任务
3. 验证周报通知
4. 触发月分析任务
5. 验证月报通知

**预期输出：**
- 周报通知发送到飞书群
- 周报包含本周反馈总数、平均分、Top问题、多维表格链接、日志平台链接、待审核按钮
- 月报通知发送到飞书群
- 月报包含本月反馈总数、NPS分数、Top问题分析、标签自进化结果、会议文档链接

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| 周报通知 | 周同步任务完成 | 飞书群收到周报卡片 |
| 周报内容 | 本周50条反馈 | 显示总数、平均分、Top问题 |
| 周报按钮 | 点击"日志平台" | 跳转到日志平台链接 |
| 周报按钮 | 点击"待审核" | 跳转到待审核列表 |
| 月报通知 | 月分析任务完成 | 飞书群收到月报卡片 |
| 月报内容 | 本月200条反馈 | 显示NPS、标签自进化结果 |

---

### 阶段7：Bot响应

**步骤：**
1. 在飞书群@NPS Insight Bot
2. 发送 `/nps help`
3. 发送 `/nps status`
4. 发送 `/nps tag`
5. 发送 `/nps analyze`
6. 发送自然语言问题

**预期输出：**
- `/nps help` 返回帮助卡片
- `/nps status` 返回系统状态
- `/nps tag` 触发打标任务并返回提示
- `/nps analyze` 触发分析任务并返回提示
- @Bot + 自然语言问题 返回相关答案

**测试用例：**

| 测试点 | 输入 | 预期结果 |
|--------|------|----------|
| 帮助命令 | `/nps help` | 返回包含所有命令的卡片 |
| 状态命令 | `/nps status` | 返回总反馈数、已打标数、待审核数、平均分 |
| 打标命令 | `/nps tag` | 返回"打标任务已触发" |
| 分析命令 | `/nps analyze` | 返回"月度分析任务已触发" |
| 自然语言 | "@Bot 本周有多少条反馈？" | 返回本周反馈统计 |
| 未知命令 | `/nps xxx` | 返回"未知命令，请使用 /nps help" |

---

### 阶段8：回归测试

**步骤：**
1. 运行 API 测试脚本：`pnpm tsx scripts/test-apis.ts`
2. 运行完整流程测试：`pnpm tsx scripts/test-full-flow.ts`
3. 验证所有 API 端点正常
4. 验证完整流程无报错

**预期输出：**
- 所有 API 测试通过
- 完整流程测试完成
- 无错误信息

**测试脚本输出格式：**

```bash
# API测试输出示例
========================================
NPS Insight API测试
========================================

【1】测试飞书连接...
✓ 飞书连接成功

【2】测试反馈API (/api/feedback)...
✓ 反馈API成功: 50条反馈

...

========================================
API测试结果汇总
========================================

| API | 状态 | 消息 |
|-----|------|------|
| 飞书连接 | ✓ PASS | 连接成功 |
| 反馈API | ✓ PASS | 获取50条反馈 |

通过: 9/9
失败: 0/9
```

---

## 6. 预期输出与实际输出对照表

### 6.1 API响应格式

| API | 方法 | 预期成功响应 | 预期失败响应 |
|-----|------|--------------|--------------|
| `/api/config` | GET | `{ success: true, data: {...} }` | `{ success: false, error: 'xxx' }` |
| `/api/config` | POST | `{ success: true, message: '配置已保存' }` | `{ success: false, error: 'xxx' }` |
| `/api/feedback` | GET | `{ success: true, data: [...] }` | `{ success: false, error: 'xxx' }` |
| `/api/tags` | GET | `{ success: true, data: [...] }` | `{ success: false, error: 'xxx' }` |
| `/api/tenants` | GET | `{ success: true, data: [...] }` | `{ success: false, error: 'xxx' }` |
| `/api/analysis` | GET | `{ success: true, data: {...} }` | `{ success: false, error: 'xxx' }` |
| `/api/notify` | POST | `{ success: true, message: '发送成功' }` | `{ success: false, error: 'xxx' }` |
| `/api/cron/sync` | POST | `{ success: true, data: {...} }` | `{ success: false, error: 'xxx' }` |
| `/api/cron/monthly` | POST | `{ success: true, data: {...} }` | `{ success: false, error: 'xxx' }` |
| `/api/webhook/feishu` | POST | `{ code: 0, msg: 'success' }` | `{ code: 0, msg: 'success' }`（始终返回成功） |

### 6.2 飞书Bot消息格式

**帮助卡片：**
- 标题：NPS Insight 命令帮助
- 内容：列出所有可用命令及说明

**状态消息：**
```
📊 NPS Insight 状态

总反馈数: 500
已打标: 480
待审核: 20
需查日志: 5
平均分: 3.5

配置管理: xxx/admin
```

**周报卡片：**
- 标题：本周NPS分析报告
- 内容：
  - 本周反馈总数
  - 平均分
  - Top 5问题（表格）
  - 评分分布（条形图）
- 按钮：日志平台、待审核

**月报卡片：**
- 标题：本月NPS分析报告
- 内容：
  - 本月反馈总数
  - NPS分数
  - Top问题分析
  - 标签自进化结果
- 按钮：会议文档、多维表格

---

## 7. 测试工具与脚本

### 7.1 测试脚本列表

| 脚本 | 路径 | 用途 |
|------|------|------|
| 完整流程测试 | `scripts/test-full-flow.ts` | 测试从数据导入到通知的完整流程 |
| API测试 | `scripts/test-apis.ts` | 测试所有API端点 |
| Mock数据生成 | `scripts/generate-mock-data.ts` | 生成200条模拟反馈数据 |
| 配置回显验证 | `scripts/verify-config-echo.ts` | 验证配置回显功能 |
| 配置保存验证 | `scripts/verify-config-save-v2.ts` | 验证配置保存功能 |
| Excel导入验证 | `scripts/verify-excel-import.ts` | 验证Excel导入流程 |
| 默认配置验证 | `scripts/verify-default-config-v2.ts` | 验证首次用户默认配置 |
| 通知验证 | `scripts/verify-notification.ts` | 验证通知发送功能 |
| Bot响应验证 | `scripts/verify-bot-response.ts` | 验证Bot命令响应 |
| 标签测试 | `scripts/test-tagging.ts` | 测试AI打标功能 |
| 分析测试 | `scripts/test-analysis.ts` | 测试分析报告生成 |

### 7.2 运行方式

```bash
# 启动开发服务器
pnpm dev

# 运行完整流程测试
pnpm tsx scripts/test-full-flow.ts

# 运行API测试
pnpm tsx scripts/test-apis.ts

# 生成Mock数据
pnpm tsx scripts/generate-mock-data.ts

# 触发周同步
curl -X POST http://localhost:3000/api/cron/sync \
  -H "Authorization: Bearer your_cron_secret"

# 触发月分析
curl -X POST http://localhost:3000/api/cron/monthly \
  -H "Authorization: Bearer your_cron_secret"
```

---

## 8. 测试检查清单

### 8.1 配置中心测试检查

- [ ] 配置回显从环境变量正确读取
- [ ] 敏感字段（AppSecret、ApiKey）显示为"已配置"
- [ ] 非敏感字段显示实际值
- [ ] 配置保存正确写入 `.env` 文件
- [ ] 飞书连接测试成功
- [ ] AI连接测试成功
- [ ] 数据源连接测试成功
- [ ] 通知发送测试成功

### 8.2 数据导入测试检查

- [ ] Excel导入API正确解析数据
- [ ] 数据正确写入多维表格
- [ ] 返回导入统计（total、written、skipped）
- [ ] 错误格式Excel返回明确错误信息
- [ ] Mock API返回模拟数据
- [ ] 外部数据源同步成功

### 8.3 AI打标测试检查

- [ ] AI成功分析未打标反馈
- [ ] Tag1/Tag2/Tag3正确写入
- [ ] 置信度字段正确设置
- [ ] 新标签自动添加到标签体系
- [ ] 低置信度反馈标记为待审核

### 8.4 分析报告测试检查

- [ ] 标签自进化完成
- [ ] Top问题分析生成
- [ ] NPS分数计算正确
- [ ] 分析报告写入周期分析表
- [ ] 会议文档生成成功

### 8.5 通知发送测试检查

- [ ] 周报通知包含本周反馈总数
- [ ] 周报通知包含平均分
- [ ] 周报通知包含Top问题列表
- [ ] 周报通知包含日志平台按钮
- [ ] 周报通知包含待审核按钮
- [ ] 月报通知包含NPS分数
- [ ] 月报通知包含标签自进化结果
- [ ] 月报通知包含会议文档链接

### 8.6 Bot响应测试检查

- [ ] `/nps help` 返回帮助卡片
- [ ] `/nps status` 返回系统状态
- [ ] `/nps tag` 触发打标任务
- [ ] `/nps analyze` 触发月度分析
- [ ] `@Bot` 自然语言问答正常
- [ ] 未知命令返回错误提示

---

## 9. 常见问题与排查

### 9.1 配置相关

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| 配置保存后不生效 | 检查 `.env` 文件是否更新 | 确认配置写入成功，重启服务器 |
| 敏感字段显示明文 | 检查 API 返回是否过滤 | 确保返回 `__SET__` 而非实际值 |
| 测试连接失败 | 检查网络和凭证 | 确认 AppId/AppSecret 正确 |

### 9.2 数据导入相关

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| Excel导入失败 | 检查文件格式和列名 | 确保包含必需列，格式正确 |
| 数据重复导入 | 检查去重逻辑 | 确保 feedbackId 唯一 |
| 外部数据源同步失败 | 检查 API 地址和密钥 | 确认数据源配置正确 |

### 9.3 AI打标相关

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| AI分析失败 | 检查 LLM API 配置 | 确认 API Key 和 Base URL 正确 |
| 标签写入失败 | 检查多维表格权限 | 确认应用有写入权限 |
| 置信度异常 | 检查 Prompt 模板 | 优化 AI 分析 Prompt |

### 9.4 通知相关

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| 通知发送失败 | 检查群ID和网络 | 确认 NOTIFICATION_CHAT_ID 正确 |
| 卡片按钮不工作 | 检查 URL 配置 | 确认日志平台和多维表格链接正确 |
| 通知延迟 | 检查网络和API限流 | 考虑分批发送或增加重试 |

### 9.5 Bot相关

| 问题 | 排查方法 | 解决方案 |
|------|----------|----------|
| Bot无响应 | 检查Webhook配置 | 确认飞书事件推送配置正确 |
| 命令解析失败 | 检查消息格式 | 确认消息文本格式正确 |
| 自然语言问答失败 | 检查问答引擎 | 确认问答服务正常 |

---

## 10. 测试环境清理

### 10.1 清理步骤

1. 删除测试数据：
   ```bash
   pnpm tsx scripts/reset-all-tables.ts
   ```

2. 清空 `.env` 文件中的测试配置（保留模板）

3. 停止开发服务器

### 10.2 清理注意事项

- 生产环境数据不可随意清理
- 清理前务必确认数据已备份
- 清理操作需谨慎，避免影响线上服务

---

## 附录：多维表格字段定义

### 反馈列表字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| feedbackId | 文本 | 是 | 反馈唯一ID |
| content | 文本 | 是 | 反馈内容 |
| npsScore | 数字 | 是 | NPS评分（1-5） |
| createTime | 日期时间 | 是 | 创建时间 |
| module | 文本 | 否 | 功能模块 |
| source | 文本 | 否 | 来源平台 |
| tenantId | 文本 | 是 | 租户ID |
| tenantName | 文本 | 否 | 租户名称 |
| tenantScale | 文本 | 否 | 租户规模 |
| userId | 文本 | 否 | 用户ID |
| userName | 文本 | 否 | 用户名 |
| status | 文本 | 是 | 状态（未打标/已打标） |
| tag1 | 文本 | 否 | 一级标签 |
| tag2 | 文本 | 否 | 二级标签 |
| tag3 | 文本 | 否 | 三级标签 |
| confidence | 数字 | 否 | AI置信度（0-1） |
| reviewNeeded | 复选框 | 否 | 是否需要审核 |
| needLogCheck | 复选框 | 否 | 是否需要查日志 |
| summary | 文本 | 否 | 摘要 |
| suggestions | 文本 | 否 | 建议 |

### 标签体系字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tagId | 文本 | 是 | 标签唯一ID |
| tag1 | 文本 | 是 | 一级标签 |
| tag2 | 文本 | 是 | 二级标签 |
| tag3 | 文本 | 是 | 三级标签 |
| usageCount | 数字 | 是 | 使用次数 |

### 租户信息字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tenantId | 文本 | 是 | 租户唯一ID |
| tenantName | 文本 | 是 | 租户名称 |
| scale | 文本 | 否 | 租户规模（A1-A6） |
| contact | 文本 | 否 | 联系人 |
| contactEmail | 文本 | 否 | 联系邮箱 |
| industry | 文本 | 否 | 行业 |
| address | 文本 | 否 | 地址 |

### 周期分析字段

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| periodId | 文本 | 是 | 周期唯一ID |
| periodName | 文本 | 是 | 周期名称（如"2026年第24周"） |
| startDate | 日期时间 | 是 | 开始日期 |
| endDate | 日期时间 | 是 | 结束日期 |
| totalFeedbacks | 数字 | 是 | 总反馈数 |
| avgScore | 数字 | 否 | 平均分 |
| npsScore | 数字 | 否 | NPS分数 |
| topIssues | 文本 | 否 | Top问题（JSON格式） |

---

*文档版本：v1.0*  
*更新日期：2026-06-24*  
*适用项目：NPS Insight*