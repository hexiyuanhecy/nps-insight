# 飞书免登录授权修复 - 任务列表

## 概述
按照飞书官方免登授权最佳实践重构授权流程：飞书内直接跳转授权页面实现免登，浏览器内点击授权新窗口打开。

## 任务列表

### [x] Task 0: 修复授权 URL 域名
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 将授权 URL 域名从 `open.feishu.cn` 改为 `accounts.feishu.cn`
  - 确保授权 URL 格式符合飞书 OAuth 规范
  - 保持参数不变：client_id、response_type=code、redirect_uri、scope、state
- **Acceptance Criteria Addressed**: AC-1, AC-3, AC-4, AC-7
- **Test Requirements**:
  - `programmatic` TR-0.1: 生成的授权 URL 使用 `accounts.feishu.cn` 域名
  - `programmatic` TR-0.2: 生成的授权 URL 包含 `client_id` 参数
  - `programmatic` TR-0.3: 生成的授权 URL 包含 `response_type=code`
- **Notes**: 官方文档推荐使用 accounts.feishu.cn 作为授权页面域名

### [x] Task 1: 重构 useFeishuAuth Hook - 简化授权流程
- **Priority**: high
- **Depends On**: Task 0
- **Description**:
  - 保留 User-Agent 环境检测（飞书/浏览器）
  - **飞书环境**：未授权时自动跳转授权页面（window.location.href）
  - **浏览器环境**：点击按钮后新窗口打开授权页面（window.open）
  - 保留 JSAPI 相关代码作为可选降级方案
  - 增加授权中状态展示
  - 简化整体逻辑，降低复杂度
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-1.1: Hook 能通过 User-Agent 正确检测飞书环境
  - `programmatic` TR-1.2: 飞书环境自动跳转授权页面
  - `programmatic` TR-1.3: 浏览器环境不自动跳转
  - `human-judgement` TR-1.4: 授权状态变化有清晰的控制台日志
- **Notes**: 核心重构任务，采用官方推荐的免登方案

### [x] Task 2: FeishuTab 适配新的授权逻辑
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - FeishuTab 使用新的 useFeishuAuth Hook
  - 确保授权状态展示正确
  - 保留用户资源管理、多维表格配置等其他功能
  - 授权中状态显示"正在授权..."提示
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-6, AC-7
- **Test Requirements**:
  - `human-judgement` TR-2.1: 飞书环境自动跳转授权页面
  - `human-judgement` TR-2.2: 浏览器环境点击授权按钮打开新窗口
  - `human-judgement` TR-2.3: 授权成功后正确展示用户信息
  - `human-judgement` TR-2.4: 授权失败显示错误提示和重试按钮
- **Notes**: 确保 UI 行为符合预期

### [x] Task 3: 错误处理优化
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 优化 URL 中 auth_error 参数的解析和展示
  - 授权失败时显示友好的错误提示
  - 提供重试按钮
- **Acceptance Criteria Addressed**: AC-7, AC-8
- **Test Requirements**:
  - `human-judgement` TR-3.1: URL 中的错误参数能正确解析并提示
  - `human-judgement` TR-3.2: 用户可以点击重试按钮重新授权
  - `human-judgement` TR-3.3: 退出授权后可以重新授权
- **Notes**: 提升用户体验

### [ ] Task 4: TypeScript 编译检查 + ESLint 检查
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - 运行 `pnpm tsc --noEmit` 确保无类型错误
  - 运行 `pnpm lint` 确保无代码规范错误
- **Acceptance Criteria Addressed**: AC-1 ~ AC-8
- **Test Requirements**:
  - `programmatic` TR-4.1: TypeScript 编译零错误
  - `programmatic` TR-4.2: ESLint 检查零错误
- **Notes**: 代码质量保证

### [ ] Task 5: 浏览器内测试授权流程（3 遍）
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - 在外部浏览器中打开配置中心页面
  - 验证不会自动触发授权
  - 验证点击授权按钮打开新窗口
  - 验证授权成功后的状态展示
  - 验证退出授权后重新授权
  - 重复测试 3 遍，确保稳定性
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-7, AC-8
- **Test Requirements**:
  - `human-judgement` TR-5.1: 第 1 遍测试全部通过
  - `human-judgement` TR-5.2: 第 2 遍测试全部通过
  - `human-judgement` TR-5.3: 第 3 遍测试全部通过
- **Notes**: 在普通浏览器环境下测试

### [ ] Task 6: 飞书内测试授权流程（3 遍）
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - 在飞书客户端内打开配置中心页面
  - 验证自动免登是否正常工作（页面加载后自动跳转授权）
  - 验证授权成功后的状态展示
  - 验证退出授权后重新授权
  - 验证不跳转到外部浏览器
  - 重复测试 3 遍，确保稳定性
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-6, AC-7, AC-8
- **Test Requirements**:
  - `human-judgement` TR-6.1: 第 1 遍测试全部通过
  - `human-judgement` TR-6.2: 第 2 遍测试全部通过
  - `human-judgement` TR-6.3: 第 3 遍测试全部通过
- **Notes**: 需要在飞书客户端内实际操作测试

## 任务依赖图

```
Task 0 (授权 URL 域名修复)
  └──→ Task 1 (useFeishuAuth 重构)
        ├──→ Task 2 (FeishuTab 适配)
        ├──→ Task 3 (错误处理优化)
        │
        └──→ Task 4 (编译 + lint 检查)
              ├──→ Task 5 (浏览器内测试 3 遍)
              └──→ Task 6 (飞书内测试 3 遍)
```

## 技术要点

### 环境检测策略
- 优先使用 User-Agent 检测：检查是否包含 `Lark` 或 `Feishu`
- 不依赖 JSAPI 注入时机，检测更可靠
- 检测逻辑简单高效

### 飞书免登流程
1. 检测到飞书环境且未授权
2. 显示"正在授权..."状态
3. 使用 `window.location.href` 跳转到授权页面
4. 飞书客户端自动免登（用户无感知）
5. 回调到应用页面，完成授权

### 浏览器授权流程
1. 检测到浏览器环境且未授权
2. 显示"未授权"状态和授权按钮
3. 用户点击按钮后，`window.open` 新窗口打开授权页面
4. 用户手动授权
5. 回调到应用页面，完成授权
