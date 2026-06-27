# 用户身份授权与资源管理 - 规格文档

## Why
当前使用 `tenant_access_token`（应用身份）创建的云文件夹存在权限限制：
1. 无法通过 API 给其他用户授予管理员权限（授权接口返回 1063001 错误）
2. 资源归属不清晰，用户体验差
3. 违反"用户专属资源"的业务逻辑

改用 `user_access_token`（用户身份）可以：
- 创建的文件夹天然归属用户，用户拥有完整权限
- 可以直接给其他用户授权
- 符合多用户资源隔离的设计目标

## What Changes
- [ ] 实现飞书 OAuth 授权流程，获取 user_access_token
- [ ] 实现 access_token 自动刷新机制（refresh_token）
- [ ] 将 refresh_token 持久化存储
- [ ] 改用用户身份创建云文件夹和资源
- [ ] 改用用户身份创建多维表格
- [ ] 添加用户授权状态检测和引导 UI
- [ ] 用户长时间未登录的降级处理

## Impact
- **Affected specs**: cloud-folder-management（云文件夹管理）
- **Affected code**: 
  - `src/lib/feishu/drive-folder.ts` - 云文件夹服务
  - `src/lib/feishu/bitable-setup.ts` - 多维表格服务
  - `src/lib/init/user-resource-initializer.ts` - 初始化服务
  - `src/app/api/user-resource/route.ts` - 资源 API
  - `src/components/admin/config-center/` - 配置中心 UI

## ADDED Requirements

### Requirement: 用户 OAuth 授权流程
系统 SHALL 提供用户身份授权功能：
1. 检测用户是否已授权（是否存在有效的 refresh_token）
2. 如果未授权，显示授权引导 UI
3. 引导用户完成飞书 OAuth 授权
4. 获取 user_access_token 和 refresh_token
5. 将 refresh_token 持久化存储

#### Scenario: 用户首次授权
- **WHEN**: 用户访问配置中心，检测到未授权
- **THEN**: 显示授权引导卡片，提供"授权登录"按钮

#### Scenario: 用户完成授权
- **WHEN**: 用户点击授权按钮，完成飞书 OAuth 流程
- **THEN**: 系统获取 token 并存储，跳转到已授权状态

### Requirement: Token 自动刷新机制
系统 SHALL 自动管理 user_access_token 的生命周期：
1. 存储 refresh_token（持久化到数据库）
2. 在 access_token 过期前主动刷新
3. 刷新成功后更新本地存储的 token
4. 刷新失败后引导用户重新授权

#### Scenario: Token 即将过期
- **WHEN**: access_token 剩余有效期 < 10 分钟
- **THEN**: 使用 refresh_token 换取新的 access_token

#### Scenario: refresh_token 也过期
- **WHEN**: 刷新请求返回 refresh_token 无效错误
- **THEN**: 清除本地存储的 token，显示重新授权引导

### Requirement: 用户身份创建资源
使用 user_access_token 创建和管理云资源：
1. 创建云文件夹（使用用户身份）
2. 创建多维表格（使用用户身份）
3. 创建周报/月报（使用用户身份）
4. 所有资源归属当前用户

#### Scenario: 创建云文件夹
- **WHEN**: 初始化用户资源，需要创建根文件夹
- **THEN**: 使用用户身份调用飞书 API 创建文件夹

### Requirement: 授权状态展示
配置中心 SHALL 清晰展示用户授权状态：
1. 未授权：显示授权引导
2. 已授权：显示用户信息（如用户名）
3. 授权过期：显示重新授权引导

## MODIFIED Requirements

### Requirement: 用户资源初始化流程
修改现有初始化流程，使用用户身份替代应用身份：

**原流程（tenant_access_token）**:
1. 使用 tenant_access_token 创建文件夹
2. 使用 tenant_access_token 创建多维表格
3. 尝试授权用户（失败）

**新流程（user_access_token）**:
1. 检查/获取用户授权
2. 使用 user_access_token 创建文件夹（用户身份）
3. 使用 user_access_token 创建多维表格
4. 资源天然归属用户，无需额外授权

### Requirement: Token 存储
扩展 UserResource 类型，增加用户 token 相关字段：

```typescript
interface UserResource {
  // 现有字段
  rootFolderToken: string;
  reportFolderToken: string;
  monthFolderToken: string;
  bitableBaseToken: string;
  userOpenId?: string;
  
  // 新增字段
  userAccessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number; // access_token 过期时间戳
}
```

## REMOVED Requirements
- ~~使用 tenant_access_token 创建资源~~ → 改用 user_access_token
- ~~尝试调用授权接口给用户授权~~ → 用户身份创建的资源天然归属用户

## 技术细节

### OAuth 授权流程
1. **前端**：引导用户访问飞书授权 URL
2. **飞书**：用户授权后，跳转到回调 URL，带上 code
3. **后端**：用 code 换取 user_access_token + refresh_token
4. **存储**：将 refresh_token 持久化到 KV

### Token 刷新机制
- access_token 有效期：2 小时
- refresh_token 有效期：7-30 天
- 建议在 access_token 剩余 10 分钟时主动刷新
- 使用 refresh_token 换取新的 access_token

### API 调用方式
```typescript
// 获取用户 token
const userToken = await getUserAccessToken();
headers.Authorization = `Bearer ${userToken}`;

// 刷新 token
const newToken = await refreshUserToken(refreshToken);
await saveUserToken(newToken);
```

## 飞书权限要求
需要在飞书开放平台申请以下权限：
- `drive:folder:create` - 创建文件夹
- `drive:folder:read` - 读取文件夹
- `drive:file:create` - 创建文件
- `bitable:app:create` - 创建多维表格
- `authen:user_id:readonly` - 获取用户 ID

## Open Questions
- [x] 是否接受 OAuth 授权流程？（用户确认：可行）
- [ ] refresh_token 有效期具体是多少天？（需要飞书文档确认，默认按 7 天处理）
- [ ] 用户如何获取 user_name？（用于文件夹命名）
