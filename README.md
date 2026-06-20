# NPS Insight

基于飞书生态的 AI 驱动 NPS 反馈分析工具。自动收集用户反馈、智能分类打标、生成分析报告，帮助产品团队快速洞察用户需求。

## 内容

### 主项目

- **chatBot/** - NPS Insight 主项目代码（Next.js + TypeScript）
  - `src/app/` - 页面和 API 路由
  - `src/lib/ai/` - AI 打标和对话逻辑
  - `src/lib/feishu/` - 飞书 SDK 封装（多维表格、Bot 消息）
  - `src/lib/llm/` - LLM 提供商（AgnesAI、OpenAI、Claude）
  - `src/components/admin/` - 管理后台组件

### 文档

- **README.md** - 项目主文档，包含功能特性、技术栈、快速开始指南
- **DEPLOY.md** - 部署指南
- **NPS-Insight-PRD.md** - 产品需求文档
- **NPS-Insight-Tech-v2.md** - 技术方案文档
- **NPS-Insight-TestCases.md** - 测试用例
- **NPS-Insight-使用手册.md** - 用户使用手册
- **NPS_Insight_技术方案.md** - 技术方案说明

### 脚本

- **clone-project.sh** - 项目初始化脚本，快速创建目录结构和配置文件
- **test-*.py / test-*.sh** - 测试脚本，涵盖 AI 打标、飞书 Bot 消息、批量打标等功能
- **write-bitable.py** - 将 Mock 数据写入飞书多维表格
