# 腾讯云开发部署 - 实施计划

## [ ] Task 1: 安装并配置 CloudBase CLI
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 安装 @cloudbase/cli 到项目开发依赖
  - 配置 CloudBase 环境 ID（hexiyuan-d0g6ll45k94275810）
  - 验证 CLI 登录状态
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `programmatic` TR-1.1: `npx tcb --version` 能输出版本号
  - `programmatic` TR-1.2: CLI 已登录腾讯云账号
- **Notes**: 环境 ID 从用户截图获取：hexiyuan-d0g6ll45k94275810

## [ ] Task 2: 适配 Next.js 配置以支持云函数部署
- **Priority**: high
- **Depends On**: [Task 1]
- **Description**: 
  - 创建 next.config.js，配置 output 为 standalone 或兼容云函数
  - 创建 scf_bootstrap 启动文件，监听 0.0.0.0:9000
  - 设置 scf_bootstrap 可执行权限
- **Acceptance Criteria Addressed**: [AC-1, AC-2]
- **Test Requirements**:
  - `programmatic` TR-2.1: `next build` 构建成功
  - `programmatic` TR-2.2: scf_bootstrap 文件存在且有可执行权限
  - `human-judgement` TR-2.3: next.config.js 配置合理，符合云函数部署要求
- **Notes**: 参考腾讯云官方 Next.js 部署文档

## [ ] Task 3: 配置云函数环境变量
- **Priority**: high
- **Depends On**: [Task 1]
- **Description**: 
  - 在腾讯云控制台配置云函数环境变量
  - 包括 Redis、飞书、AI 等必要配置
  - 验证环境变量可在云函数中读取
- **Acceptance Criteria Addressed**: [AC-7]
- **Test Requirements**:
  - `programmatic` TR-3.1: 云函数环境变量已配置
  - `programmatic` TR-3.2: API 能正确读取环境变量
- **Notes**: 从 .env.example 复制所有必需变量

## [ ] Task 4: 部署到腾讯云开发环境
- **Priority**: high
- **Depends On**: [Task 2, Task 3]
- **Description**: 
  - 使用 CloudBase CLI 部署云函数
  - 选择 Web Function 类型
  - 配置触发器（HTTP 访问）
  - 获取部署后的访问 URL
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `programmatic` TR-4.1: 部署命令执行成功
  - `programmatic` TR-4.2: 能获取到访问 URL
  - `programmatic` TR-4.3: 访问 URL 返回 200 状态码
- **Notes**: 部署前需先执行 next build

## [ ] Task 5: 验证页面功能
- **Priority**: high
- **Depends On**: [Task 4]
- **Description**: 
  - 验证首页正常访问
  - 验证配置中心页面正常
  - 验证日志查询页面正常
  - 验证页面无报错
- **Acceptance Criteria Addressed**: [AC-2, AC-3, AC-6]
- **Test Requirements**:
  - `programmatic` TR-5.1: / 返回 200 且包含页面内容
  - `programmatic` TR-5.2: /admin 返回 200 且配置中心正常
  - `programmatic` TR-5.3: /log-viewer 返回 200 且日志页面正常
  - `human-judgement` TR-5.4: 页面 UI 正常，无样式问题
- **Notes**: 使用 Playwright 或手动验证

## [ ] Task 6: 验证 API 和 Redis 连接
- **Priority**: high
- **Depends On**: [Task 4]
- **Description**: 
  - 验证 /api/config 可正常读写配置
  - 验证 Redis 连接正常
  - 验证配置持久化（保存后刷新仍存在）
  - 验证其他核心 API
- **Acceptance Criteria Addressed**: [AC-4, AC-5, AC-7]
- **Test Requirements**:
  - `programmatic` TR-6.1: GET /api/config 返回成功
  - `programmatic` TR-6.2: POST /api/config 保存成功
  - `programmatic` TR-6.3: 保存后再次读取，配置一致
  - `programmatic` TR-6.4: Redis 连接状态正常
- **Notes**: 需要先配置 Redis 环境变量

## [ ] Task 7: 测试国内访问速度
- **Priority**: medium
- **Depends On**: [Task 4]
- **Description**: 
  - 从国内网络访问部署后的应用
  - 对比 Vercel 部署的访问速度
  - 验证首屏加载时间
- **Acceptance Criteria Addressed**: [AC-8]
- **Test Requirements**:
  - `human-judgement` TR-7.1: 访问速度明显快于 Vercel
  - `human-judgement` TR-7.2: 页面交互流畅
- **Notes**: 主观评估，可使用浏览器开发者工具查看加载时间

## [ ] Task 8: 更新文档和配置
- **Priority**: medium
- **Depends On**: [Task 5, Task 6]
- **Description**: 
  - 更新 .env.example 添加腾讯云相关说明
  - 更新 package.json 添加部署脚本
  - 更新 .gitignore 排除云开发相关文件
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `human-judgement` TR-8.1: 部署脚本清晰可用
  - `human-judgement` TR-8.2: 文档说明完整
- **Notes**: 方便后续部署和维护
