#!/bin/bash
# 腾讯云开发部署准备脚本
# 将构建产物整理到 deploy/ 目录，用于部署到云函数

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$PROJECT_DIR/deploy"

echo "=== 清理旧的部署目录 ==="
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

echo "=== 复制 standalone 构建产物 ==="
cp -r "$PROJECT_DIR/.next/standalone/." "$DEPLOY_DIR/"

echo "=== 移除敏感文件 ==="
rm -f "$DEPLOY_DIR/.env"
rm -f "$DEPLOY_DIR/.env.local"
rm -f "$DEPLOY_DIR/.env.production"

echo "=== 精简 package.json，只保留服务端必需依赖 ==="
cd "$DEPLOY_DIR"
node -e "
const pkg = require('./package.json');
// 只保留服务端运行时必需的依赖
pkg.dependencies = {
  'next': pkg.dependencies['next'],
  'react': pkg.dependencies['react'],
  'react-dom': pkg.dependencies['react-dom'],
  '@larksuiteoapi/node-sdk': pkg.dependencies['@larksuiteoapi/node-sdk'],
  'openai': pkg.dependencies['openai'],
  '@upstash/redis': pkg.dependencies['@upstash/redis'],
  'mysql2': pkg.dependencies['mysql2'],
  'pg': pkg.dependencies['pg'],
  'date-fns': pkg.dependencies['date-fns'],
  'xlsx': pkg.dependencies['xlsx'],
};
delete pkg.devDependencies;
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
"

echo "=== 安装服务端依赖 ==="
npm install --production --no-package-lock --no-optional

echo "=== 进一步精简 node_modules ==="
# 删除不需要的文件
find node_modules -name "*.md" -delete 2>/dev/null || true
find node_modules -name "*.map" -delete 2>/dev/null || true
find node_modules -name "LICENSE*" -delete 2>/dev/null || true
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name ".github" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "docs" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "example" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "examples" -type d -exec rm -rf {} + 2>/dev/null || true
# 删除 next 中不需要的客户端部分
rm -rf node_modules/next/dist/client 2>/dev/null || true
rm -rf node_modules/next/dist/build 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/@ampproject 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/browserslist 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/terser 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/webpack 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/react-dom-experimental 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/react-experimental 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/react-server-dom-webpack-experimental 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/react-server-dom-turbopack-experimental 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/react-server-dom-turbopack 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/babel-packages 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/babel 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/@babel 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/postcss-preset-env 2>/dev/null || true
rm -rf node_modules/next/dist/compiled/crypto-browserify 2>/dev/null || true
rm -rf node_modules/next/dist/esm 2>/dev/null || true
# 删除 date-fns 中不需要的 locale（只保留 en-US 或 zh-CN）
rm -rf node_modules/date-fns/locale 2>/dev/null || true
# 删除 caniuse-lite（Next.js 服务端可能不需要）
rm -rf node_modules/caniuse-lite 2>/dev/null || true
# 删除 @types（生产环境不需要）
rm -rf node_modules/@types 2>/dev/null || true

echo "=== 复制静态资源 ==="
mkdir -p "$DEPLOY_DIR/.next/static"
cp -r "$PROJECT_DIR/.next/static/." "$DEPLOY_DIR/.next/static/"

echo "=== 复制 public 目录 ==="
if [ -d "$PROJECT_DIR/public" ]; then
  cp -r "$PROJECT_DIR/public" "$DEPLOY_DIR/"
fi

echo "=== 复制启动脚本 ==="
cp "$PROJECT_DIR/scf_bootstrap" "$DEPLOY_DIR/scf_bootstrap" 2>/dev/null || true
chmod 755 "$DEPLOY_DIR/scf_bootstrap" 2>/dev/null || true
cp "$PROJECT_DIR/scf-handler.js" "$DEPLOY_DIR/scf-handler.js"

echo "=== 复制配置文件 ==="
if [ -f "$PROJECT_DIR/next.config.js" ]; then
  cp "$PROJECT_DIR/next.config.js" "$DEPLOY_DIR/"
fi

echo ""
echo "=== 部署准备完成 ==="
echo "部署目录: $DEPLOY_DIR"
echo ""
echo "目录大小:"
du -sh "$DEPLOY_DIR"
echo ""
echo "node_modules 大小:"
du -sh "$DEPLOY_DIR/node_modules" 2>/dev/null || echo "无node_modules"
echo ""
echo "文件列表:"
ls -la "$DEPLOY_DIR"
