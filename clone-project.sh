#!/bin/bash

# NPS Insight 项目克隆脚本
# 使用方法：在本地终端执行此脚本

set -e

PROJECT_DIR="/Users/xigua/ai Projects/nps-insight"

echo "=========================================="
echo "  NPS Insight 项目克隆脚本"
echo "=========================================="

# 创建项目目录
echo ""
echo "[1/4] 创建项目目录..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"
echo "✓ 目录已创建: $PROJECT_DIR"

# 创建目录结构
echo ""
echo "[2/4] 创建目录结构..."
mkdir -p src/app/\(admin\)
mkdir -p src/app/api/analysis
mkdir -p src/app/api/config
mkdir -p src/app/api/cron/sync
mkdir -p src/app/api/feedback
mkdir -p src/app/api/setup
mkdir -p src/app/api/tags
mkdir -p src/app/api/webhook/feishu
mkdir -p src/components/admin
mkdir -p src/lib/ai
mkdir -p src/lib/config
mkdir -p src/lib/feishu
mkdir -p src/lib/types
echo "✓ 目录结构已创建"

# 初始化git（可选）
echo ""
echo "[3/4] 是否初始化Git仓库? (y/n)"
read -r init_git
if [ "$init_git" = "y" ]; then
    git init
    echo "# 项目依赖" > .gitignore
    echo "node_modules" >> .gitignore
    echo ".env.local" >> .gitignore
    echo ".next" >> .gitignore
    echo "*.zip" >> .gitignore
    echo "✓ Git已初始化"
fi

# 创建配置文件
echo ""
echo "[4/4] 创建配置文件..."

# package.json
cat > package.json << 'EOF'
{
  "name": "nps-insight",
  "version": "1.0.0",
  "description": "AI驱动的NPS用户反馈分析平台",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@larksuiteoapi/node-sdk": "^1.0.0",
    "openai": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
EOF

# .env.local.example
cat > .env.local.example << 'EOF'
# 飞书应用配置
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# AgnesAI配置（免费LLM）
AGNESAI_API_KEY=ak-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AGNESAI_BASE_URL=https://api-hub.agnes-ai.com/v1
AGNESAI_MODEL=agnes-2.0-flash

# 多维表格Token（首次启动自动生成）
BITABLE_TOKEN=

# 定时任务密钥
CRON_SECRET=your-random-secret-key
EOF

# 创建 .env.local（空配置）
cp .env.local.example .env.local

# next.config.js
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
EOF

# tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

# tailwind.config.ts
cat > tailwind.config.ts << 'EOF'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config
EOF

# postcss.config.js
cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# vercel.json
cat > vercel.json << 'EOF'
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 9 * * 1"
    }
  ]
}
EOF

# globals.css
cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
EOF

echo "✓ 配置文件已创建"

# 提示用户
echo ""
echo "=========================================="
echo "  项目结构已创建!"
echo "=========================================="
echo ""
echo "下一步操作："
echo "1. cd $PROJECT_DIR"
echo "2. npm install"
echo "3. 编辑 .env.local 填入配置"
echo "4. npm run dev"
echo ""
echo "注意：请手动创建以下文件的内容："
echo "  - src/lib/ai/index.ts (AgnesAI客户端)"
echo "  - src/lib/ai/tagger.ts (AI打标)"
echo "  - src/lib/ai/prompts.ts (Prompt模板)"
echo "  - src/lib/feishu/client.ts (飞书SDK)"
echo "  - src/lib/feishu/bitable.ts (多维表格)"
echo "  - src/lib/feishu/bot.ts (Bot消息)"
echo "  - src/lib/feishu/setup.ts (自动建表)"
echo "  - src/lib/feishu/constants.ts (常量)"
echo "  - src/lib/types/index.ts (类型定义)"
echo "  - src/lib/config/index.ts (配置管理)"
echo "  - src/app/api/.../route.ts (API路由)"
echo "  - src/app/page.tsx (首页)"
echo "  - src/app/(admin)/page.tsx (配置页)"
echo "  - src/components/admin/... (组件)"
echo ""
echo "你可以让AI助手帮你创建这些文件内容"
echo "=========================================="
