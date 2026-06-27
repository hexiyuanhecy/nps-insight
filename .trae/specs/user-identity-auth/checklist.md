# 用户身份授权与资源管理 - 验证清单

## Phase 1: Token 管理基础设施

### Task 1.1: 飞书用户身份授权服务
- [ ] `src/lib/feishu/user-auth.ts` 文件已创建
- [ ] `getAuthorizationUrl()` 函数正确生成授权 URL
- [ ] `exchangeCodeForToken()` 函数能正确换取 token
- [ ] `refreshAccessToken()` 函数能正确刷新 token
- [ ] Token 响应包含 `access_token`, `refresh_token`, `expires_in`

### Task 1.2: Token 存储适配器
- [ ] `UserResource` 类型已扩展 token 相关字段
- [ ] `getUserAccessToken()` 方法实现 access_token 获取
- [ ] `saveUserToken()` 方法实现 token 持久化
- [ ] `refreshTokenIfNeeded()` 方法实现自动刷新逻辑

## Phase 2: 资源创建改用用户身份

### Task 2.1: 云文件夹服务
- [ ] `createFolder()` 支持传入 userAccessToken 参数
- [ ] 默认使用用户身份 token
- [ ] 测试：用用户身份创建文件夹成功

### Task 2.2: 多维表格服务
- [ ] `createBitableApp()` 支持传入 userAccessToken 参数
- [ ] `createNPSInsightBitable()` 支持传入 folderToken 和 userAccessToken
- [ ] 测试：用用户身份创建多维表格成功

### Task 2.3: 文档服务
- [ ] `FeishuDocumentAdapter.create()` 支持传入 userAccessToken
- [ ] 周报生成使用用户身份
- [ ] 月报生成使用用户身份

## Phase 3: 用户授权 UI

### Task 3.1: 授权状态检测 API
- [ ] GET `/api/user-auth/status` 返回授权状态
- [ ] 返回字段包含: `isAuthorized`, `hasValidToken`, `userInfo`
- [ ] 错误处理正确

### Task 3.2: 授权引导 UI
- [ ] 配置中心显示授权状态卡片
- [ ] 未授权时显示授权按钮
- [ ] 已授权时显示用户信息
- [ ] 点击授权按钮跳转到飞书授权页面

## Phase 4: 初始化流程改造

### Task 4.1: 用户资源初始化服务
- [ ] `ensureInitialized()` 检查用户授权状态
- [ ] 未授权时返回授权引导提示
- [ ] 使用用户身份执行所有创建操作
- [ ] 初始化完成后保存所有 token

### Task 4.2: 资源 API 路由
- [ ] GET `/api/user-resource` 返回授权状态
- [ ] POST `/api/user-resource` 处理授权回调
- [ ] 错误处理和日志记录完整

## Phase 5: 测试验证

### Task 5.1: OAuth 授权流程测试
- [ ] 能生成正确的飞书授权 URL
- [ ] 能用 code 换取 token
- [ ] 能用 refresh_token 刷新 token
- [ ] Token 存储和读取正确

### Task 5.2: 用户资源初始化测试
- [ ] 用用户身份创建根文件夹成功
- [ ] 用用户身份创建子文件夹成功
- [ ] 用用户身份创建多维表格成功
- [ ] 所有 token 正确保存

### Task 5.3: 端到端验证
- [ ] 完整流程：授权 → 初始化 → 资源创建
- [ ] 所有资源链接正确可访问
- [ ] 重复执行不会重复创建（幂等性）
- [ ] 错误场景处理正确

## 验收标准

### 核心功能
- [ ] 用户可以通过 OAuth 授权登录
- [ ] 授权后创建的文件夹属于用户，用户有完整权限
- [ ] 授权后创建的多维表格属于用户
- [ ] access_token 过期后能自动刷新
- [ ] refresh_token 过期后能引导重新授权

### UI/UX
- [ ] 配置中心清晰展示授权状态
- [ ] 未授权用户看到授权引导
- [ ] 已授权用户看到用户信息
- [ ] 授权按钮可正常点击跳转

### 资源验证
- [ ] 根文件夹链接可正常打开
- [ ] 多维表格链接可正常打开
- [ ] 周报归档文件夹链接可正常打开
- [ ] 月报汇总文件夹链接可正常打开
- [ ] 用户可以正常管理这些资源
