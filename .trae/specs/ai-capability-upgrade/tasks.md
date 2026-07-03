# NPS Insight AI 能力升级 - 实施计划（分解与优先级任务列表）

## [ ] Task 1: AI 安全中间层（输入清洗 + Zod 输出校验）
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 `src/lib/ai/` 下新建 `security.ts`，实现 AI 安全中间层
  - 输入清洗：控制字符过滤、注入模式检测（正则匹配已知注入关键词）、长度限制
  - 输出校验：封装 `safeChatCompletionJSON`，用 Zod Schema 校验 AI 返回，校验失败自动重试（最多2次）
  - 提示层隔离：统一使用 XML 标签（`<|system|>` / `<|user|>` / `<|data|>`）包裹不同角色内容
  - 宪法式拒绝声明：在 System Prompt 模板中增加安全边界声明
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-9
- **Test Requirements**:
  - `programmatic` TR-1.1: 输入包含"忽略之前的指令"等关键词时，返回拦截或清洗后的安全文本
  - `programmatic` TR-1.2: AI 返回格式错误的 JSON 时，Zod 校验捕获错误，自动重试，最终失败返回友好错误
  - `programmatic` TR-1.3: 现有打标、进化、问答功能调用新封装后，输出结果与之前一致
  - `human-judgement` TR-1.4: 代码评审确认所有 AI 调用路径都经过安全中间层
- **Notes**: 不修改业务逻辑，只在外围包裹安全层。打标 Prompt 中的 XML 标签改造要小心，不能影响 AI 输出质量。

## [ ] Task 2: Token 计数与调用日志
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 安装 `js-tiktoken` 依赖
  - 在 `src/lib/ai/` 下新建 `token-counter.ts`，封装 Token 计数工具
  - 在 AI 调用层增加调用日志：模型、输入 Token、输出 Token、耗时、费用估算
  - 日志写入 KV 存储（按月聚合），提供查询接口
  - 新建 `src/app/api/ai/usage/route.ts` 返回用量统计
- **Acceptance Criteria Addressed**: AC-3, AC-9
- **Test Requirements**:
  - `programmatic` TR-2.1: 对已知文本计数，与 OpenAI Tokenizer 偏差 < 5%
  - `programmatic` TR-2.2: 每次 AI 调用后都有对应的日志记录
  - `programmatic` TR-2.3: `/api/ai/usage` 接口返回正确的月度统计数据
- **Notes**: 不同模型 Tokenizer 不同，优先支持 cl100k_base（GPT-4 兼容模型）。费用估算按模型单价配置。

## [ ] Task 3: Prompt 模板引擎（Handlebars 化）
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 安装 `handlebars` 依赖
  - 新建 `src/lib/ai/templates/` 目录，按场景分类存放模板：
    - `tagging/batch-tagging.hbs` — 批量打标
    - `evolution/tag-evolution.hbs` — 标签进化
    - `chat/intent-recognition.hbs` — 意图识别
    - `chat/answer-generation.hbs` — 回答生成
  - 新建 `prompt-engine.ts`，封装模板加载、编译、渲染
  - 变量插值自动 HTML 实体转义（Handlebars 默认行为）
  - 逐步替换现有 `prompts.ts` 中的字符串拼接为模板调用
  - 每个模板配套 Zod Schema 定义
- **Acceptance Criteria Addressed**: AC-8, AC-9
- **Test Requirements**:
  - `programmatic` TR-3.1: 模板渲染输出与原字符串拼接结果语义一致（打标准确率不下降）
  - `programmatic` TR-3.2: 用户输入包含 HTML/JS 特殊字符时，模板自动转义
  - `programmatic` TR-3.3: 新增一个模板场景不需要修改核心调用代码
  - `human-judgement` TR-3.4: 代码评审确认模板结构清晰，分类合理
- **Notes**: 迁移要渐进式，先迁移一个场景验证没问题再全量迁移。模板文件用 `.hbs` 后缀。

## [ ] Task 4: 模型路由（大小模型分流）
- **Priority**: medium
- **Depends On**: Task 2
- **Description**:
  - 定义任务类型枚举：`tagging` / `evolution` / `intent` / `answer` / `summary`
  - 新建 `src/lib/ai/model-router.ts`，根据任务类型选择模型
  - 配置中心增加"模型路由配置"区域，可配置各任务使用的模型
  - 轻量任务（intent、summary）默认用小模型，重量任务（tagging、evolution）用大模型
  - 路由配置从 KV 存储读取，支持热更新
- **Acceptance Criteria Addressed**: AC-4, AC-9
- **Test Requirements**:
  - `programmatic` TR-4.1: 意图识别请求实际调用的是配置的小模型
  - `programmatic` TR-4.2: 打标请求实际调用的是配置的大模型
  - `programmatic` TR-4.3: 修改配置后，下次调用使用新模型（无需重启）
- **Notes**: 需要先确认 AgnesAI 是否有小模型可用。如果没有，可以用 temperature 调低 + max_tokens 减少来模拟"轻量"。

## [ ] Task 5: LLM Provider 增加流式接口
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在 `LLMProvider` 接口中增加 `chatStream` 方法，返回 `ReadableStream`
  - 为 `OpenAIProvider` 实现流式调用（使用 SDK 的 stream: true）
  - 为 `AgnesAIProvider` 实现流式调用
  - 封装 SSE 格式解析工具
  - 增加 AbortSignal 支持，支持中途取消
- **Acceptance Criteria Addressed**: AC-6 (基础能力), AC-9
- **Test Requirements**:
  - `programmatic` TR-5.1: `chatStream` 返回 ReadableStream，可逐块读取 Token
  - `programmatic` TR-5.2: 传入 AbortSignal 后，调用 abort() 能正确中断请求
  - `programmatic` TR-5.3: 流式输出内容与同步输出内容一致
- **Notes**: 这是流式体验的基础能力层。确保所有 Provider 都有一致的流式接口。

## [ ] Task 6: 语义缓存
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - 新建 `src/lib/ai/semantic-cache.ts`
  - 使用 Embedding API 对查询向量化，余弦相似度匹配
  - 内存缓存（Map 结构），带 TTL 过期机制
  - 提供 `get` / `set` / `invalidate` 接口
  - 在 ChatBot 的回答生成层接入缓存（问答类任务先查缓存）
  - 相似度阈值默认 0.95，可配置
- **Acceptance Criteria Addressed**: AC-5, AC-9
- **Test Requirements**:
  - `programmatic` TR-6.1: 语义相近的两个问题（如"NPS多少分"和"NPS得分是多少"）能命中缓存
  - `programmatic` TR-6.2: 缓存命中时响应时间 < 200ms，且不产生 API 调用
  - `programmatic` TR-6.3: 语义不同的问题不会误命中缓存
  - `programmatic` TR-6.4: TTL 过期后缓存自动失效
- **Notes**: Embedding 模型也要走模型路由，用便宜的小模型。缓存只对问答类任务生效，打标类任务不缓存。

## [ ] Task 7: 流式对话 API + 前端聊天页面
- **Priority**: high
- **Depends On**: Task 5, Task 1
- **Description**:
  - 新建 `src/app/api/chat/stream/route.ts`，SSE 流式返回 AI 回答
  - 新建 `src/app/chat/page.tsx`，聊天页面
  - 前端实现：消息列表、输入框、发送按钮、打字机效果
  - 使用 `fetch + ReadableStream` 消费 SSE 数据
  - 支持 AbortController 取消请求
  - 状态机管理：idle / streaming / reconnecting / error
  - 指数退避断线重连（1s → 2s → 4s → max 30s）
  - 输入框旁显示实时 Token 计数
- **Acceptance Criteria Addressed**: AC-6, AC-3 (展示), AC-9
- **Test Requirements**:
  - `programmatic` TR-7.1: `/api/chat/stream` 返回 SSE 格式数据流
  - `programmatic` TR-7.2: 前端页面能正常收发消息，打字机效果流畅
  - `programmatic` TR-7.3: 点击取消按钮后，请求被中断，不再产生新 Token
  - `human-judgement` TR-7.4: UI 交互流畅，状态切换清晰，视觉效果符合设计规范
- **Notes**: 聊天页面设计风格要与配置中心保持一致。Token 计数用 Task 2 的工具。

## [ ] Task 8: 打标进度流式展示
- **Priority**: low
- **Depends On**: Task 5
- **Description**:
  - 周打标任务增加进度事件回调
  - 新建 `src/app/api/tags/progress/route.ts`，SSE 推送打标进度
  - 配置中心"开始周打标"按钮点击后弹出进度面板
  - 进度信息：当前批次 / 总条数 / 已完成百分比 / 成功数 / 失败数
  - 完成后显示结果摘要，支持关闭面板
- **Acceptance Criteria Addressed**: AC-7, AC-9
- **Test Requirements**:
  - `programmatic` TR-8.1: 打标过程中 SSE 持续推送进度事件
  - `programmatic` TR-8.2: 前端进度条实时更新，百分比准确
  - `human-judgement` TR-8.3: 进度面板 UI 美观，信息清晰，不遮挡主要操作
- **Notes**: 这是锦上添花的功能，如果时间不够可以后放。月分析也可以类似实现进度展示。

## [ ] Task 9: 配置中心 AI 用量面板
- **Priority**: low
- **Depends On**: Task 2
- **Description**:
  - 配置中心增加"AI 用量统计"新 Tab
  - 展示：本月调用次数、本月 Token 消耗、本月费用估算
  - 展示调用趋势图（近 7 天/30 天）
  - 按任务类型分类统计（打标 / 进化 / 问答 / 其他）
  - 支持手动清除缓存、查看调用日志列表
- **Acceptance Criteria Addressed**: AC-3 (可视化)
- **Test Requirements**:
  - `programmatic` TR-9.1: 用量面板数据与后端日志一致
  - `programmatic` TR-9.2: 清除缓存按钮点击后缓存被清空
  - `human-judgement` TR-9.3: 图表清晰易读，配色与整体风格一致
- **Notes**: 图表可以用 Recharts（项目里已经有 Mermaid，可以看看有没有装 Recharts）。

## [ ] Task 10: 端到端测试与回归验证
- **Priority**: high
- **Depends On**: Task 1-9 (对应功能完成后)
- **Description**:
  - 编写安全测试用例：注入攻击测试、边界输入测试
  - 回归测试：周打标完整流程、月分析完整流程
  - 性能测试：流式输出首字节延迟、缓存命中率
  - 修复所有发现的问题
  - 输出升级总结报告
- **Acceptance Criteria Addressed**: AC-9 (核心)
- **Test Requirements**:
  - `programmatic` TR-10.1: 所有安全测试用例通过，注入攻击被拦截
  - `programmatic` TR-10.2: 周打标 + 月分析完整跑通，结果与升级前一致
  - `programmatic` TR-10.3: TypeScript 编译零错误，ESLint 零警告
  - `human-judgement` TR-10.4: 代码评审通过，架构清晰，符合项目规范
- **Notes**: 这是最后一道质量关，必须确保升级不破坏现有功能。
