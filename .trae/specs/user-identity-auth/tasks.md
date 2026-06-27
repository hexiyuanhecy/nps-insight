# 用户身份授权与资源管理 - 任务列表

## 概述
将云资源创建从 `tenant_access_token` 改为 `user_access_token`，实现用户身份授权和 token 自动刷新机制。

## 任务列表

### Phase 1: Token 管理基础设施

- [ ] Task 1.1: 创建飞书用户身份授权服务
  - 实现 OAuth 授权 URL 生成
  - 实现 code 换取 token
  - 实现 token 刷新逻辑
  - 依赖: 无

- [ ] Task 1.2: 创建 Token 存储适配器
  - 扩展 UserResource 类型，增加 token 相关字段
  - 实现 token 的获取/保存/删除方法
  - 支持 access_token 自动刷新
  - 依赖: Task 1.1

### Phase 2: 资源创建改用用户身份

- [ ] Task 2.1: 修改云文件夹服务支持用户身份
  - `createFolder` 方法增加 userAccessToken 参数
  - 默认使用用户身份 token
  - 保留 tenant_access_token 作为备用
  - 依赖: Task 1.1

- [ ] Task 2.2: 修改多维表格服务支持用户身份
  - `createBitableApp` 方法增加 userAccessToken 参数
  - `createNPSInsightBitable` 方法增加 userAccessToken 参数
  - 依赖: Task 1.1

- [ ] Task 2.3: 修改文档服务支持用户身份
  - `FeishuDocumentAdapter.create` 增加 userAccessToken 参数
  - 周报/月报生成使用用户身份
  - 依赖: Task 1.1

### Phase 3: 用户授权 UI

- [ ] Task 3.1: 添加用户授权状态检测 API
  - GET 接口返回用户授权状态
  - 判断 access_token 是否有效
  - 判断 refresh_token 是否存在
  - 依赖: Task 1.2

- [ ] Task 3.2: 配置中心添加授权引导 UI
  - 在用户云资源管理区域上方添加授权状态卡片
  - 未授权时显示授权按钮
  - 已授权时显示用户信息
  - 依赖: Task 3.1

### Phase 4: 初始化流程改造

- [ ] Task 4.1: 修改用户资源初始化服务
  - 检查用户授权状态
  - 如果未授权，引导授权流程
  - 使用用户身份执行初始化
  - 依赖: Task 2.1, Task 2.2, Task 3.1

- [ ] Task 4.2: 修改资源 API 路由
  - GET 接口返回授权状态和用户信息
  - POST 接口增加授权处理逻辑
  - 依赖: Task 4.1

### Phase 5: 测试验证

- [ ] Task 5.1: 本地测试 OAuth 授权流程
  - 测试授权 URL 生成
  - 测试 code 换取 token
  - 测试 token 刷新

- [ ] Task 5.2: 测试用户资源初始化
  - 使用用户身份创建文件夹
  - 使用用户身份创建多维表格
  - 验证资源归属

- [ ] Task 5.3: 端到端验证
  - 完整流程测试
  - 列出所有创建的资源链接

## 任务依赖图

```
Phase 1 (Token 管理)
  Task 1.1 ─┬─→ Task 1.2
            │
            ├──→ Phase 2 (资源创建)
            │   Task 2.1 ─┐
            │   Task 2.2 ─┼─→ Task 2.3
            │
            └──→ Phase 3 (UI)
                Task 3.1 ─→ Task 3.2
                            │
                            └──→ Phase 4 (初始化改造)
                                Task 4.1 ─→ Task 4.2
                                            │
                                            └──→ Phase 5 (测试验证)
                                                Task 5.1 ─→ Task 5.2 ─→ Task 5.3
```

## 技术要点

### OAuth 授权 URL
```
https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=xxx&redirect_uri=xxx&state=xxx
```

### Token 刷新 API
```
POST https://open.feishu.cn/open-apis/authen/v1/refresh_access_token
Body: { "grant_type": "refresh_token", "refresh_token": "xxx" }
```

### Token 自动刷新策略
- 在 access_token 剩余有效期 < 10 分钟时触发刷新
- 刷新成功后更新本地存储
- 刷新失败后清除 token，引导重新授权
