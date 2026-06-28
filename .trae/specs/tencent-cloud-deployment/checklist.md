# 腾讯云开发部署 - 验证清单

## 部署前检查
- [ ] CloudBase CLI 已安装且版本正常
- [ ] 已登录腾讯云账号
- [ ] 环境 ID 配置正确（hexiyuan-d0g6ll45k94275810）
- [ ] next.config.js 已创建且配置正确
- [ ] scf_bootstrap 启动文件已创建且有可执行权限
- [ ] next build 构建成功
- [ ] 云函数环境变量已配置

## 部署验证
- [ ] 部署命令执行成功，无报错
- [ ] 能获取到云函数访问 URL
- [ ] 访问 URL 返回 200 状态码

## 页面功能验证
- [ ] 首页 / 正常加载，无报错
- [ ] 配置中心 /admin 正常展示
- [ ] 配置中心三个 Tab（数据源、标签、配置）可切换
- [ ] 日志查询页面 /log-viewer 正常展示
- [ ] 页面样式正常，无布局错乱
- [ ] 无控制台错误（Console 无红色报错）

## API 功能验证
- [ ] GET /api/config 返回成功
- [ ] POST /api/config 保存配置成功
- [ ] 保存后刷新页面，配置仍然存在（Redis 持久化）
- [ ] GET /api/feedback 返回正确格式
- [ ] GET /api/tags 返回正确格式
- [ ] GET /api/analysis 返回正确格式
- [ ] POST /api/cron/sync 可调用（带认证）
- [ ] POST /api/webhook/feishu 可调用（带认证）

## Redis 验证
- [ ] Redis 连接状态正常
- [ ] 配置数据可写入 Redis
- [ ] 配置数据可从 Redis 读取
- [ ] 配置持久化有效（重启云函数后数据不丢失）

## 环境变量验证
- [ ] KV_REST_API_URL 可读取
- [ ] KV_REST_API_TOKEN 可读取
- [ ] FEISHU_APP_ID 可读取
- [ ] FEISHU_APP_SECRET 可读取
- [ ] AI 相关配置可读取
- [ ] 其他必要环境变量可读取

## 性能验证
- [ ] 国内访问首屏加载时间 < 3 秒
- [ ] API 响应时间 < 1 秒（简单接口）
- [ ] 云函数冷启动可接受（< 5 秒）
- [ ] 页面交互流畅，无明显卡顿

## 安全验证
- [ ] 定时任务 API 有 CRON_SECRET 保护
- [ ] Webhook API 有签名验证
- [ ] 敏感信息未在前端暴露
- [ ] 环境变量中无硬编码密钥

## 文档与配置
- [ ] package.json 有部署脚本
- [ ] .env.example 有腾讯云部署说明
- [ ] .gitignore 已排除不必要的文件
- [ ] 部署步骤文档清晰
