/**
 * 验证首次用户默认配置写入逻辑（简化版）
 *
 * 检查项：
 * 1. Tag1 默认配置一致性（API vs 前端）
 * 2. Schedule 默认配置一致性
 * 3. LargeTenantLevels 默认值一致性
 * 4. ConfidenceThreshold 默认值一致性
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

console.log('\n' + '='.repeat(80));
log('cyan', '📋 首次用户默认配置验证报告');
console.log('='.repeat(80) + '\n');

let hasErrors = false;

// ============================================
// 1. 检查 API 端的 DEFAULT_TAG1
// ============================================
log('blue', '1️⃣  Tag1 默认配置验证');
console.log('-'.repeat(80));

const routePath = path.join(__dirname, '../src/app/api/config/route.ts');
const routeContent = fs.readFileSync(routePath, 'utf-8');

// 检查 Tag1 定义是否包含关键内容
const tag1Checks = [
  { name: '疑似Bug', expectedDef: '功能异常、报错、崩溃、无法使用' },
  { name: '功能优化', expectedDef: '功能改进建议、新功能诉求' },
  { name: '界面改进', expectedDef: 'UI 问题、交互体验优化' },
  { name: '性能提升', expectedDef: '加载慢、卡顿、响应延迟、耗电' },
  { name: '用户教育', expectedDef: '不知道如何使用、使用指引不清' },
  { name: '安全合规', expectedDef: '安全漏洞、隐私问题、合规要求' },
  { name: '无效反馈', expectedDef: 'SPAM、广告、乱码、无法理解的内容' },
];

tag1Checks.forEach(check => {
  if (routeContent.includes(`definition: '${check.expectedDef}'`)) {
    log('green', `   ✅ 标签 "${check.name}" 定义正确`);
  } else {
    log('red', `   ❌ 标签 "${check.name}" 定义不正确`);
    hasErrors = true;
  }
});

console.log('');

// ============================================
// 2. 检查 Schedule 默认配置
// ============================================
log('blue', '2️⃣  Schedule 默认配置验证');
console.log('-'.repeat(80));

// 检查周同步时间
if (routeContent.includes("'0 9 * * 1'")) {
  log('green', `   ✅ 周同步时间正确: 每周一 09:00`);
} else {
  log('red', `   ❌ 周同步时间不正确`);
  hasErrors = true;
}

// 检查月分析时间
if (routeContent.includes("'0 9 1 * *'")) {
  log('green', `   ✅ 月分析时间正确: 每月 1 日 09:00`);
} else {
  log('red', `   ❌ 月分析时间不正确`);
  hasErrors = true;
}

console.log('');

// ============================================
// 3. 检查 ConfidenceThreshold 默认值
// ============================================
log('blue', '3️⃣  ConfidenceThreshold 默认值验证');
console.log('-'.repeat(80));

if (routeContent.includes("'0.8'")) {
  log('green', `   ✅ ConfidenceThreshold 正确: 0.8`);
} else {
  log('red', `   ❌ ConfidenceThreshold 不正确`);
  hasErrors = true;
}

console.log('');

// ============================================
// 4. 检查 LargeTenantLevels 默认值
// ============================================
log('blue', '4️⃣  LargeTenantLevels 默认值验证');
console.log('-'.repeat(80));

if (routeContent.includes("'A4,A5,A6'")) {
  log('green', `   ✅ LargeTenantLevels 正确: ['A4', 'A5', 'A6']`);
} else {
  log('red', `   ❌ LargeTenantLevels 不正确`);
  hasErrors = true;
}

console.log('');

// ============================================
// 5. 检查前端常量的一致性
// ============================================
log('blue', '5️⃣  前端常量一致性验证');
console.log('-'.repeat(80));

const configCenterPath = path.join(__dirname, '../src/constants/config-center.ts');
const configCenterContent = fs.readFileSync(configCenterPath, 'utf-8');

// 检查前端 Tag1 定义
tag1Checks.forEach(check => {
  if (configCenterContent.includes(`definition: '${check.expectedDef}'`)) {
    log('green', `   ✅ 前端标签 "${check.name}" 定义正确`);
  } else {
    log('red', `   ❌ 前端标签 "${check.name}" 定义不正确`);
    hasErrors = true;
  }
});

// 检查前端 Schedule
if (configCenterContent.includes("syncCron: '0 9 * * 1'")) {
  log('green', `   ✅ 前端周同步时间正确`);
} else {
  log('red', `   ❌ 前端周同步时间不正确`);
  hasErrors = true;
}

if (configCenterContent.includes("analysisCron: '0 9 1 * *'")) {
  log('green', `   ✅ 前端月分析时间正确`);
} else {
  log('red', `   ❌ 前端月分析时间不正确`);
  hasErrors = true;
}

// 检查前端 ConfidenceThreshold
if (configCenterContent.includes("confidenceThreshold: 0.8")) {
  log('green', `   ✅ 前端 ConfidenceThreshold 正确`);
} else {
  log('red', `   ❌ 前端 ConfidenceThreshold 不正确`);
  hasErrors = true;
}

// 检查前端 LargeTenantLevels
if (configCenterContent.includes("largeTenantLevels: ['A4', 'A5', 'A6']")) {
  log('green', `   ✅ 前端 LargeTenantLevels 正确`);
} else {
  log('red', `   ❌ 前端 LargeTenantLevels 不正确`);
  hasErrors = true;
}

console.log('');

// ============================================
// 总结
// ============================================
console.log('='.repeat(80));
if (hasErrors) {
  log('red', '❌ 验证失败：发现配置不一致问题');
} else {
  log('green', '✅ 验证通过：所有默认配置一致');
}
console.log('='.repeat(80) + '\n');

process.exit(hasErrors ? 1 : 0);
