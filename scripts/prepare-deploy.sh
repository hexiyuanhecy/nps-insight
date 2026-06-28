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

echo "=== 复制静态资源 ==="
mkdir -p "$DEPLOY_DIR/.next/static"
cp -r "$PROJECT_DIR/.next/static/." "$DEPLOY_DIR/.next/static/"

echo "=== 复制 public 目录 ==="
if [ -d "$PROJECT_DIR/public" ]; then
  cp -r "$PROJECT_DIR/public" "$DEPLOY_DIR/"
fi

echo "=== 复制启动脚本 ==="
cp "$PROJECT_DIR/scf_bootstrap" "$DEPLOY_DIR/scf_bootstrap"
chmod 755 "$DEPLOY_DIR/scf_bootstrap"

echo "=== 复制配置文件 ==="
if [ -f "$PROJECT_DIR/next.config.js" ]; then
  cp "$PROJECT_DIR/next.config.js" "$DEPLOY_DIR/"
fi

echo "=== 安装生产依赖（解决 standalone 模式依赖缺失问题） ==="
cd "$DEPLOY_DIR"
# 移除 standalone 模式的 node_modules（不完整）
rm -rf node_modules
# 使用 npm 安装完整的生产依赖
npm install --production --no-package-lock --no-optional
# 清理不需要的文件以减小体积
find node_modules -name "*.md" -delete 2>/dev/null || true
find node_modules -name "*.ts" -delete 2>/dev/null || true
find node_modules -name "*.map" -delete 2>/dev/null || true
find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
find node_modules -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true

echo ""
echo "=== 部署准备完成 ==="
echo "部署目录: $DEPLOY_DIR"
echo ""
echo "目录大小:"
du -sh "$DEPLOY_DIR"
echo ""
echo "文件列表:"
ls -la "$DEPLOY_DIR"
