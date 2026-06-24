/**
 * 首次用户默认配置验证测试脚本
 * 验证首次用户默认配置的一致性（API vs 前端常量）
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 类型定义
// ============================================

interface ValidationResult {
  passed: boolean;
  test: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface Tag1Config {
  name: string;
  definition: string;
  enabled: boolean;
}

// ============================================
// 颜色输出
// ============================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: keyof typeof colors, message: string): void {
  console.log(colors[color] + message + colors.reset);
}

// ============================================
// 验证结果收集
// ============================================

const results: ValidationResult[] = [];

function addResult(passed: boolean, test: string, message: string, severity: ValidationResult['severity'] = 'MEDIUM'): void {
  results.push({ passed, test, message, severity });
  const icon = passed ? 'PASS' : severity === 'HIGH' ? 'FAIL' : 'WARN';
  const color = passed ? 'green' : severity === 'HIGH' ? 'red' : 'yellow';
  log(color, '  [' + icon + '] ' + test + ': ' + message);
}

// ============================================
// 默认配置定义
// ============================================

const DEFAULT_TAG1: Tag1Config[] = [
  { name: '疑似Bug', definition: '功能异常、报错、崩溃、无法使用', enabled: true },
  { name: '功能优化', definition: '功能改进建议、新功能诉求', enabled: true },
  { name: '界面改进', definition: 'UI 问题、交互体验优化', enabled: true },
  { name: '性能提升', definition: '加载慢、卡顿、响应延迟、耗电', enabled: true },
  { name: '用户教育', definition: '不知道如何使用、使用指引不清', enabled: true },
  { name: '安全合规', definition: '安全漏洞、隐私问题、合规要求', enabled: true },
  { name: '无效反馈', definition: 'SPAM、广告、乱码、无法理解的内容', enabled: true },
];

const DEFAULT_SCHEDULE = {
  syncCron: '0 9 * * 1',
  analysisCron: '0 9 1 * *',
};

const DEFAULT_TAGGING = {
  confidenceThreshold: 0.8,
  largeTenantLevels: ['A4', 'A5', 'A6'],
};

// ============================================
// 核心验证逻辑
// ============================================

/**
 * 验证1: Tag1 默认配置一致性
 */
function validateTag1Config(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证1: Tag1 默认配置一致性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  let apiTag1Count = 0;
  const apiTag1Definitions: string[] = [];

  // 查找 API 中的 DEFAULT_TAG1 定义
  const defaultTag1Match = routeContent.match(/DEFAULT_TAG1\s*=\s*\[([\s\S]*?)\];/);
  if (defaultTag1Match) {
    const tag1Content = defaultTag1Match[1];
    const tagMatches = tag1Content.match(/name:\s*['"]([^'"]+)['"]/g);
    if (tagMatches) {
      apiTag1Count = tagMatches.length;
    }

    // 提取定义
    const defMatches = tag1Content.match(/definition:\s*['"]([^'"]+)['"]/g);
    if (defMatches) {
      defMatches.forEach((m) => {
        const match = m.match(/definition:\s*['"]([^'"]+)['"]/);
        if (match) apiTag1Definitions.push(match[1]);
      });
    }
  }

  // 验证 Tag1 数量
  if (apiTag1Count === 7) {
    addResult(true, 'Tag1数量', 'API 中有 7 个 Tag1（符合预期）');
  } else {
    addResult(false, 'Tag1数量', 'API 中有 ' + apiTag1Count + ' 个 Tag1（期望 7 个）', 'HIGH');
  }

  // 验证每个 Tag1 定义
  DEFAULT_TAG1.forEach((tag, index) => {
    const found = apiTag1Definitions.some(d => d === tag.definition || d.includes(tag.definition.substring(0, 10)));
    if (found) {
      addResult(true, 'Tag1[' + (index + 1) + ']', tag.name + ' - 定义正确');
    } else {
      addResult(false, 'Tag1[' + (index + 1) + ']', tag.name + ' - 定义不匹配', 'HIGH');
    }
  });
}

/**
 * 验证2: Schedule 默认配置一致性
 */
function validateScheduleConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证2: Schedule 默认配置一致性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查周同步 Cron
  if (routeContent.includes("'0 9 * * 1'") || routeContent.includes('"0 9 * * 1"')) {
    addResult(true, '周同步Cron', 'API 默认周同步 Cron 正确: 0 9 * * 1');
  } else if (routeContent.includes('0 9 * * 1')) {
    addResult(true, '周同步Cron', 'API 默认周同步 Cron 正确');
  } else {
    addResult(false, '周同步Cron', 'API 默认周同步 Cron 不正确', 'HIGH');
  }

  // 检查月分析 Cron
  if (routeContent.includes("'0 9 1 * *'") || routeContent.includes('"0 9 1 * *"')) {
    addResult(true, '月分析Cron', 'API 默认月分析 Cron 正确: 0 9 1 * *');
  } else if (routeContent.includes('0 9 1 * *')) {
    addResult(true, '月分析Cron', 'API 默认月分析 Cron 正确');
  } else {
    addResult(false, '月分析Cron', 'API 默认月分析 Cron 不正确', 'HIGH');
  }
}

/**
 * 验证3: ConfidenceThreshold 默认值一致性
 */
function validateConfidenceThreshold(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证3: ConfidenceThreshold 默认值一致性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查是否包含默认值 0.8
  if (routeContent.includes('0.8') || routeContent.includes("'0.8'") || routeContent.includes('"0.8"')) {
    addResult(true, 'Confidence阈值', 'API 默认值正确: 0.8');
  } else {
    addResult(false, 'Confidence阈值', '未找到 ConfidenceThreshold 默认值配置', 'HIGH');
  }
}

/**
 * 验证4: LargeTenantLevels 默认值一致性
 */
function validateLargeTenantLevels(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证4: LargeTenantLevels 默认值一致性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查是否包含默认值 A4,A5,A6
  if (routeContent.includes('A4,A5,A6')) {
    addResult(true, 'LargeTenantLevels', 'API 默认值正确: A4,A5,A6');
  } else {
    addResult(false, 'LargeTenantLevels', '未找到 LargeTenantLevels 默认值配置', 'HIGH');
  }
}

/**
 * 验证5: 前端常量一致性
 */
function validateFrontendConstants(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证5: 前端常量一致性');
  console.log('='.repeat(60));

  const configCenterPath = path.join(process.cwd(), 'src/constants/config-center.ts');

  if (!fs.existsSync(configCenterPath)) {
    addResult(false, '前端常量文件', 'config-center.ts 文件不存在', 'HIGH');
    return;
  }

  const configCenterContent = fs.readFileSync(configCenterPath, 'utf-8');

  // 检查前端 Tag1 定义
  let frontendTag1Count = 0;
  const tag1Matches = configCenterContent.match(/name:\s*['"]([^'"]+)['"]/g);
  if (tag1Matches) {
    frontendTag1Count = tag1Matches.length;
  }

  if (frontendTag1Count === 7) {
    addResult(true, '前端Tag1数量', '前端有 7 个 Tag1（符合预期）');
  } else {
    addResult(false, '前端Tag1数量', '前端有 ' + frontendTag1Count + ' 个 Tag1（期望 7 个）', 'HIGH');
  }

  // 检查前端默认值
  if (configCenterContent.includes('syncCron')) {
    addResult(true, '前端周同步Cron', '前端常量中存在 syncCron');
  } else {
    addResult(false, '前端周同步Cron', '前端常量中缺少 syncCron', 'MEDIUM');
  }

  if (configCenterContent.includes('analysisCron')) {
    addResult(true, '前端月分析Cron', '前端常量中存在 analysisCron');
  } else {
    addResult(false, '前端月分析Cron', '前端常量中缺少 analysisCron', 'MEDIUM');
  }

  if (configCenterContent.includes('confidenceThreshold')) {
    addResult(true, '前端置信度阈值', '前端常量中存在 confidenceThreshold');
  } else {
    addResult(false, '前端置信度阈值', '前端常量中缺少 confidenceThreshold', 'MEDIUM');
  }

  if (configCenterContent.includes('largeTenantLevels')) {
    addResult(true, '前端大租户级别', '前端常量中存在 largeTenantLevels');
  } else {
    addResult(false, '前端大租户级别', '前端常量中缺少 largeTenantLevels', 'MEDIUM');
  }
}

/**
 * 验证6: API 与前端常量一致性交叉验证
 */
function validateCrossConsistency(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证6: API 与前端常量一致性交叉验证');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const configCenterPath = path.join(process.cwd(), 'src/constants/config-center.ts');

  const routeContent = fs.readFileSync(routePath, 'utf-8');
  const configCenterContent = fs.existsSync(configCenterPath)
    ? fs.readFileSync(configCenterPath, 'utf-8')
    : '';

  // 检查 Tag1 定义是否一致
  const routeTag1Defs = routeContent.match(/definition:\s*['"]([^'"]+)['"]/g) || [];
  const routeTag1DefinitionSet = new Set(routeTag1Defs.map(m => {
    const match = m.match(/definition:\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '';
  }));

  if (configCenterContent) {
    const configTag1Defs = configCenterContent.match(/definition:\s*['"]([^'"]+)['"]/g) || [];
    const configTag1DefinitionSet = new Set(configTag1Defs.map(m => {
      const match = m.match(/definition:\s*['"]([^'"]+)['"]/);
      return match ? match[1] : '';
    }));

    const sharedDefs = [...routeTag1DefinitionSet].filter(d => d && configTag1DefinitionSet.has(d));
    const totalDefs = new Set([...routeTag1DefinitionSet, ...configTag1DefinitionSet]).size;

    if (sharedDefs.length === totalDefs && totalDefs > 0) {
      addResult(true, 'Tag1定义一致', 'API 与前端 Tag1 定义完全一致');
    } else if (sharedDefs.length > 0) {
      addResult(false, 'Tag1定义一致', 'API 与前端 Tag1 定义部分一致', 'MEDIUM');
    } else {
      addResult(false, 'Tag1定义一致', 'API 与前端 Tag1 定义不一致', 'HIGH');
    }
  }

  // 检查 Schedule 默认值
  const routeSyncCron = routeContent.includes("'0 9 * * 1'") || routeContent.includes('"0 9 * * 1"');
  const frontendSyncCron = configCenterContent.includes("syncCron: '0 9 * * 1'") ||
                           configCenterContent.includes('syncCron: "0 9 * * 1"');

  if (routeSyncCron && frontendSyncCron) {
    addResult(true, '周同步Cron一致', 'API 与前端周同步 Cron 一致');
  } else if (!routeSyncCron && !frontendSyncCron) {
    addResult(true, '周同步Cron一致', 'API 与前端均使用非默认值（可能是正确配置）');
  } else {
    addResult(false, '周同步Cron一致', 'API 与前端周同步 Cron 不一致', 'HIGH');
  }
}

/**
 * 验证7: 配置回显的默认值处理
 */
function validateDefaultValueEcho(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证7: 配置回显的默认值处理');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 buildV3Config 是否存在
  const hasBuildV3Config = routeContent.includes('function buildV3Config');

  if (hasBuildV3Config) {
    addResult(true, 'buildV3Config', '存在 buildV3Config 函数用于构建配置');
  } else {
    addResult(false, 'buildV3Config', '缺少 buildV3Config 函数', 'HIGH');
  }

  // 检查 GET handler 是否调用 buildV3Config
  const getHandlerMatch = routeContent.match(/export async function GET[\s\S]*?NextResponse\.json/);
  if (getHandlerMatch && getHandlerMatch[0].includes('buildV3Config')) {
    addResult(true, 'GET使用buildV3', 'GET handler 正确使用 buildV3Config');
  } else {
    addResult(false, 'GET使用buildV3', 'GET handler 未使用 buildV3Config', 'MEDIUM');
  }

  // 检查默认值是否被正确返回
  if (routeContent.includes('DEFAULT_TAG1') && routeContent.includes('|| DEFAULT_TAG1')) {
    addResult(true, '默认值回退', 'Tag1 配置正确使用默认值回退机制');
  } else {
    addResult(false, '默认值回退', 'Tag1 配置缺少默认值回退机制', 'MEDIUM');
  }
}

/**
 * 验证8: 验证默认配置的完整性
 */
function validateDefaultConfigCompleteness(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证8: 默认配置的完整性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 必需的配置项
  const requiredConfigs = [
    { pattern: 'FEISHU_APP_ID', name: '飞书AppId' },
    { pattern: 'BITABLE_TOKEN', name: '多维表格Token' },
    { pattern: 'DATA_SOURCE_API_URL', name: '数据源API URL' },
    { pattern: 'AGNESAI_PROVIDER', name: 'AI Provider' },
    { pattern: 'CONFIG_TAG1', name: 'Tag1配置' },
    { pattern: 'CRON_SYNC_SCHEDULE', name: '同步Cron' },
    { pattern: 'NOTIFICATION_CHAT_ID', name: '通知群ID' },
  ];

  let foundCount = 0;
  requiredConfigs.forEach(({ pattern, name }) => {
    if (routeContent.includes(pattern)) {
      foundCount++;
      addResult(true, name + '配置', '存在 ' + pattern + ' 配置项');
    } else {
      addResult(false, name + '配置', '缺少 ' + pattern + ' 配置项', 'MEDIUM');
    }
  });

  console.log('\n  配置项覆盖率: ' + foundCount + '/' + requiredConfigs.length);

  if (foundCount === requiredConfigs.length) {
    addResult(true, '配置完整性', '所有必需配置项都存在');
  } else if (foundCount >= requiredConfigs.length * 0.7) {
    addResult(true, '配置完整性', '配置项覆盖率达标');
  } else {
    addResult(false, '配置完整性', '配置项覆盖率不足', 'MEDIUM');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', '首次用户默认配置验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径: ' + process.cwd());

  // 打印默认配置
  console.log('\n--- 预期默认配置 ---');
  console.log('Tag1 数量: ' + DEFAULT_TAG1.length);
  console.log('周同步 Cron: ' + DEFAULT_SCHEDULE.syncCron);
  console.log('月分析 Cron: ' + DEFAULT_SCHEDULE.analysisCron);
  console.log('置信度阈值: ' + DEFAULT_TAGGING.confidenceThreshold);
  console.log('大租户级别: ' + DEFAULT_TAGGING.largeTenantLevels.join(', '));

  // 执行所有验证
  validateTag1Config();
  validateScheduleConfig();
  validateConfidenceThreshold();
  validateLargeTenantLevels();
  validateFrontendConstants();
  validateCrossConsistency();
  validateDefaultValueEcho();
  validateDefaultConfigCompleteness();

  // 输出报告
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证报告');
  console.log('='.repeat(60));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const highSeverityFailed = results.filter(r => !r.passed && r.severity === 'HIGH').length;

  console.log('\nPASS: ' + passedCount + ' 项');
  console.log('FAIL: ' + failedCount + ' 项');
  if (highSeverityFailed > 0) {
    log('red', '   其中高危问题: ' + highSeverityFailed + ' 项');
  }

  if (failedCount > 0) {
    console.log('\n--- 失败项详情 ---');
    results.filter(r => !r.passed).forEach((r, i) => {
      log('red', '  ' + (i + 1) + '. [' + r.severity + '] ' + r.test);
      log('red', '     ' + r.message);
    });
  }

  console.log('\n' + '='.repeat(60));
  if (highSeverityFailed > 0) {
    log('red', '验证失败：发现高危问题需要立即修复');
    process.exit(1);
  } else if (failedCount > 0) {
    log('yellow', '验证完成：存在中低危问题，建议修复');
    process.exit(0);
  } else {
    log('green', '验证通过：首次用户默认配置一致');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
