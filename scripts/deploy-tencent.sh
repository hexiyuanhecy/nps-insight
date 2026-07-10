#!/bin/bash
###############################################################################
# 腾讯云开发（CloudBase）一键部署脚本
#
# 功能：
# 1. 构建 Next.js standalone 产物
# 2. 准备云函数部署包（包含 scf_bootstrap、scf-handler.js、依赖）
# 3. 通过 CloudBase CLI 部署到腾讯云开发环境
# 4. 配置定时触发器（周同步 + 月分析）
#
# 使用：
#   ./scripts/deploy-tencent.sh                    # 部署默认环境
#   ./scripts/deploy-tencent.sh --env <env-id>     # 部署指定环境
#   ./scripts/deploy-tencent.sh --skip-build       # 跳过构建
#   ./scripts/deploy-tencent.sh --triggers-only    # 仅配置触发器
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_ENV_ID="hexiyuan-d0g6ll45k94275810"
FUNCTION_NAME="nps-insight-function"
RUNTIME="Nodejs18"
MEM_SIZE=512
TIMEOUT=120

# 解析参数
SKIP_BUILD=false
TRIGGERS_ONLY=false
ENV_ID="$DEFAULT_ENV_ID"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV_ID="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --triggers-only)
      TRIGGERS_ONLY=true
      shift
      ;;
    -h|--help)
      echo "用法: $0 [--env <env-id>] [--skip-build] [--triggers-only]"
      exit 0
      ;;
    *)
      echo -e "${RED}未知参数: $1${NC}"
      exit 1
      ;;
  esac
done

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$PROJECT_DIR/deploy"

echo "============================================"
echo -e "${GREEN}🚀 NPS Insight 腾讯云部署${NC}"
echo "============================================"
echo "项目目录: $PROJECT_DIR"
echo "环境ID:   $ENV_ID"
echo "函数名:   $FUNCTION_NAME"
echo "============================================"

# 检查环境
if ! command -v tcb &> /dev/null && ! command -v cloudbase &> /dev/null; then
  echo -e "${YELLOW}⚠️  CloudBase CLI 未安装，正在安装...${NC}"
  npm install -g @cloudbase/cli
fi

TCB_CMD=$(command -v tcb || command -v cloudbase)
echo -e "${GREEN}✅ CloudBase CLI: $TCB_CMD${NC}"

# 检查登录状态
echo -e "${YELLOW}📋 检查登录状态...${NC}"
if ! $TCB_CMD login --check 2>/dev/null; then
  echo -e "${YELLOW}⚠️  未登录，请先执行: $TCB_CMD login${NC}"
  exit 1
fi

# 切换环境
echo -e "${YELLOW}📋 切换到环境 $ENV_ID...${NC}"
$TCB_CMD env switch "$ENV_ID" || true

# 构建步骤
if [ "$TRIGGERS_ONLY" = false ]; then
  if [ "$SKIP_BUILD" = false ]; then
    echo -e "${YELLOW}🔨 步骤 1/4: 构建 Next.js 应用...${NC}"
    cd "$PROJECT_DIR"
    pnpm install --frozen-lockfile
    pnpm build
    echo -e "${GREEN}✅ 构建完成${NC}"
  fi

  echo -e "${YELLOW}📦 步骤 2/4: 准备云函数部署包...${NC}"
  cd "$PROJECT_DIR"
  bash scripts/prepare-deploy.sh
  echo -e "${GREEN}✅ 部署包已准备: $DEPLOY_DIR${NC}"

  echo -e "${YELLOW}🚀 步骤 3/4: 部署云函数到腾讯云...${NC}"

  # 使用 cloudbase functions:deploy 命令部署
  # 注意：腾讯云开发支持通过 fnf.json 描述函数配置
  cat > "$DEPLOY_DIR/fnf.json" <<EOF
{
  "Name": "$FUNCTION_NAME",
  "Runtime": "$RUNTIME",
  "MemorySize": $MEM_SIZE,
  "Timeout": $TIMEOUT,
  "Handler": "scf-handler.main_handler",
  "Environment": {
    "Variables": {}
  },
  "InstallDependency": false,
  "PublicAccess": true
}
EOF

  # 通过 tcb cli 部署
  $TCB_CMD fn deploy "$FUNCTION_NAME" -e "$ENV_ID" "$DEPLOY_DIR" || {
    echo -e "${YELLOW}⚠️  tcb fn deploy 失败，尝试 cloudbase fn deploy...${NC}"
    $TCB_CMD functions:deploy "$FUNCTION_NAME" -e "$ENV_ID" "$DEPLOY_DIR"
  }
  echo -e "${GREEN}✅ 云函数部署完成${NC}"
fi

# 配置触发器
echo -e "${YELLOW}⏰ 步骤 4/4: 配置定时触发器...${NC}"

# 周同步触发器：每周一 09:00（北京时间）
echo -e "${YELLOW}  - 创建周同步触发器（每周一 09:00）${NC}"
$TCB_CMD fn trigger create "$FUNCTION_NAME" -e "$ENV_ID" \
  --triggerName "weekly-sync-trigger" \
  --type "timer" \
  --cron "0 0 9 ? * MON" \
  --argument '{"task":"weekly-sync"}' \
  --enable 2>/dev/null || echo "  触发器已存在，跳过"

# 月分析触发器：每月 1 日 00:00（北京时间）
echo -e "${YELLOW}  - 创建月分析触发器（每月1日 00:00）${NC}"
$TCB_CMD fn trigger create "$FUNCTION_NAME" -e "$ENV_ID" \
  --triggerName "monthly-analysis-trigger" \
  --type "timer" \
  --cron "0 0 0 1 * ?" \
  --argument '{"task":"monthly-analysis"}' \
  --enable 2>/dev/null || echo "  触发器已存在，跳过"

echo -e "${GREEN}✅ 触发器配置完成${NC}"

# 获取访问URL
echo "============================================"
echo -e "${GREEN}🎉 部署完成！${NC}"
echo "============================================"
echo "访问地址: https://$ENV_ID.service.tcloudbase.com/$FUNCTION_NAME"
echo "（如已配置自定义域名，请使用自己的域名）"
echo ""
echo "测试命令："
echo "  curl https://$ENV_ID.service.tcloudbase.com/$FUNCTION_NAME/api/config"
echo ""
echo "查看日志："
echo "  $TCB_CMD fn log "$FUNCTION_NAME" -e "$ENV_ID""

exit 0
