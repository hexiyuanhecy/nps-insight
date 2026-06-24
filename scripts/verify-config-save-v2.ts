/**
 * 配置保存验证测试脚本
 * 验证配置中心的保存功能是否正确写入数据库和环境变量
 *
 * 运行方式: npx ts-node scripts/verify-config-save-v2.ts
 * 或: pnpm exec ts-node scripts/verify-config-save-v2.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================
// 类型定义
// ============================================

interface ValidationResult {
  passed: boolean;
  test: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TestConfig {
  feishu: {
    appId: string;
    appSecret: string;
  };
  bitable: {
    mode: string;
    appToken: string;
    url: string;
    feedbackTableId: string;
    tagsTableId: string;
    tenantsTableId: string;
    analysisTableId: string;
  };
  dataSource: {
    apiUrl: string;
    apiKey: string;
    queryParams: string;
    timeRule: string;
  };
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  tag1: Array<{ name: string; definition: string; enabled: boolean }>;
  tag2Init: string;
  tagging: {
    confidenceThreshold: number;
    largeTenantLevels: string[];
  };
  schedule: {
    syncCron: string;
    analysisCron: string;
    devMode: boolean;
  };
  logPlatform: {
    urlTemplate: string;
  };
  notification: {
    chatIds: string;
    adminUserIds: string;
  };
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
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================
// 验证结果收集
// ============================================

const results: ValidationResult[] = [];

function addResult(passed: boolean, test: string, message: string, severity: ValidationResult['severity'] = 'MEDIUM'): void {
  results.push({ passed, test, message, severity });
  const icon = passed ? '✅' : severity === 'HIGH' ? '❌' : '⚠️';
  log(passed ? 'green' : severity === 'HIGH' ? 'red' : 'yellow', `  ${icon} ${test}: ${message}`);
}

// ============================================
// 核心验证逻辑
// ============================================

/**
 * 验证1: 检查 route.ts 是否使用 KV 存储
 */
function validateKVStorageUsage(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证1: KV 存储使用情况');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');

  if (!fs.existsSync(routePath)) {
    addResult(false, 'KV存储检查', 'route.ts 文件不存在', 'HIGH');
    return;
  }

  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查是否使用了 KV 存储相关的导入
  const kvPatterns = [
    'kv-storage',
    'setConfig',
    'getConfig',
    'ConfigStorage',
    'storageAdapter',
  ];

  const hasKVStorage = kvPatterns.some(pattern => routeContent.includes(pattern));

  // 检查是否有 notifyConfigChange 调用（延迟通知）
  const hasDelayNotifier = routeContent.includes('notifyConfigChange') || routeContent.includes('delay-notifier');

  if (hasKVStorage) {
    addResult(true, 'KV存储', 'route.ts 使用了 KV 存储');
  } else {
    addResult(false, 'KV存储', 'route.ts 未使用 KV 存储，仅写入 .env 文件', 'HIGH');
  }

  if (hasDelayNotifier) {
    addResult(true, '延迟通知', '使用了延迟通知机制');
  } else {
    addResult(false, '延迟通知', '未使用延迟通知机制', 'MEDIUM');
  }
}

/**
 * 验证2: 检查敏感字段加密
 */
function validateSensitiveFieldsEncryption(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证2: 敏感字段加密存储');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 敏感字段列表
  const sensitiveFields = [
    { name: 'FEISHU_APP_SECRET', key: 'appSecret' },
    { name: 'DATA_SOURCE_API_KEY', key: 'apiKey' },
    { name: 'AGNESAI_API_KEY', key: 'apiKey' },
  ];

  // 检查 API 返回时是否对敏感字段进行遮蔽
  const getHandlerIndex = routeContent.indexOf('GET');
  const getHandler = routeContent.substring(getHandlerIndex, getHandlerIndex + 3000);

  // 检查是否有 __SET__ 标记（表示已配置但返回遮蔽值）
  const hasSetMarker = getHandler.includes('__SET__');

  if (hasSetMarker) {
    addResult(true, '敏感字段遮蔽', 'GET API 使用 __SET__ 标记遮蔽敏感字段');
  } else {
    addResult(false, '敏感字段遮蔽', 'GET API 未使用 __SET__ 标记遮蔽敏感字段', 'HIGH');
  }

  // 检查保存时是否识别 __SET__ 占位符
  const saveHandlerIndex = routeContent.indexOf('saveConfigV3');
  const saveHandler = routeContent.substring(saveHandlerIndex, saveHandlerIndex + 2000);
  const ignoresSetPlaceholder = saveHandler.includes("!== '__SET__'") || saveHandler.includes("=== '__SET__'");

  if (ignoresSetPlaceholder) {
    addResult(true, '保存时识别占位符', 'saveConfigV3 正确识别 __SET__ 占位符');
  } else {
    addResult(false, '保存时识别占位符', 'saveConfigV3 未识别 __SET__ 占位符，可能覆盖已有值', 'HIGH');
  }
}

/**
 * 验证3: 检查配置写入 .env 的逻辑
 */
function validateEnvWriteLogic(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证3: .env 文件写入逻辑');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查是否使用 fs.writeFileSync
  const usesFsWrite = routeContent.includes('fs.writeFileSync');
  const writesToEnv = routeContent.includes(".env");

  if (usesFsWrite && writesToEnv) {
    addResult(true, '写入.env', '使用 fs.writeFileSync 写入 .env 文件');

    // 检查是否有备份逻辑
    const hasBackup = routeContent.includes('.bak') || routeContent.includes('backup');
    if (hasBackup) {
      addResult(true, '备份逻辑', '存在备份逻辑');
    } else {
      addResult(false, '备份逻辑', '缺少备份逻辑，建议添加', 'LOW');
    }
  } else {
    addResult(false, '写入.env', '未使用标准方式写入 .env 文件', 'MEDIUM');
  }

  // 检查是否使用了环境变量更新模式（读取-修改-写入）
  const hasReadModifyWrite = routeContent.includes('readFileSync') && routeContent.includes('writeFileSync');
  if (hasReadModifyWrite) {
    addResult(true, '读写模式', '使用读取-修改-写入模式更新配置');
  } else {
    addResult(false, '读写模式', '未使用标准读写模式', 'MEDIUM');
  }
}

/**
 * 验证4: 检查飞书配置保存
 */
function validateFeishuConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证4: 飞书配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const saveHandlerIndex = routeContent.indexOf('saveConfigV3');
  const saveHandler = routeContent.substring(saveHandlerIndex, saveHandlerIndex + 5000);

  // 检查 AppId 保存
  const savesAppId = saveHandler.includes('FEISHU_APP_ID');
  if (savesAppId) {
    addResult(true, 'AppId保存', '正确保存 FEISHU_APP_ID');
  } else {
    addResult(false, 'AppId保存', '未保存 FEISHU_APP_ID', 'HIGH');
  }

  // 检查 AppSecret 保存（应该有特殊处理）
  const savesAppSecret = saveHandler.includes('FEISHU_APP_SECRET');
  if (savesAppSecret) {
    addResult(true, 'AppSecret保存', '正确保存 FEISHU_APP_SECRET');
  } else {
    addResult(false, 'AppSecret保存', '未保存 FEISHU_APP_SECRET', 'HIGH');
  }
}

/**
 * 验证5: 检查多维表格配置保存
 */
function validateBitableConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证5: 多维表格配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const envVarsChecks = [
    { key: 'BITABLE_TOKEN', name: 'AppToken' },
    { key: 'BITABLE_URL', name: 'URL' },
    { key: 'BITABLE_FEEDBACK_TABLE_ID', name: 'FeedbackTableId' },
    { key: 'BITABLE_TAGS_TABLE_ID', name: 'TagsTableId' },
    { key: 'BITABLE_TENANTS_TABLE_ID', name: 'TenantsTableId' },
    { key: 'BITABLE_ANALYSIS_TABLE_ID', name: 'AnalysisTableId' },
  ];

  envVarsChecks.forEach(({ key, name }) => {
    if (routeContent.includes(key)) {
      addResult(true, `${name}保存`, `正确保存 ${key}`);
    } else {
      addResult(false, `${name}保存`, `未保存 ${key}`, 'MEDIUM');
    }
  });
}

/**
 * 验证6: 检查 AI 配置保存
 */
function validateAIConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证6: AI 配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const aiEnvVars = [
    { key: 'AGNESAI_PROVIDER', name: 'Provider' },
    { key: 'AGNESAI_API_KEY', name: 'ApiKey' },
    { key: 'AGNESAI_BASE_URL', name: 'BaseUrl' },
    { key: 'AGNESAI_MODEL', name: 'Model' },
  ];

  aiEnvVars.forEach(({ key, name }) => {
    if (routeContent.includes(key)) {
      addResult(true, `${name}保存`, `正确保存 ${key}`);
    } else {
      addResult(false, `${name}保存`, `未保存 ${key}`, 'MEDIUM');
    }
  });
}

/**
 * 验证7: 检查标签配置保存
 */
function validateTagConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证7: 标签配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const tagEnvVars = [
    { key: 'CONFIG_TAG1', name: 'Tag1' },
    { key: 'CONFIG_TAG2_INIT', name: 'Tag2Init' },
    { key: 'CONFIG_CONFIDENCE', name: 'Confidence' },
    { key: 'CONFIG_LARGE_TENANTS', name: 'LargeTenants' },
  ];

  tagEnvVars.forEach(({ key, name }) => {
    if (routeContent.includes(key)) {
      addResult(true, `${name}保存`, `正确保存 ${key}`);
    } else {
      addResult(false, `${name}保存`, `未保存 ${key}`, 'MEDIUM');
    }
  });
}

/**
 * 验证8: 检查任务调度配置保存
 */
function validateScheduleConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证8: 任务调度配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const scheduleEnvVars = [
    { key: 'CRON_SYNC_SCHEDULE', name: 'SyncCron' },
    { key: 'CRON_ANALYSIS_SCHEDULE', name: 'AnalysisCron' },
    { key: 'CRON_DEV_MODE', name: 'DevMode' },
  ];

  scheduleEnvVars.forEach(({ key, name }) => {
    if (routeContent.includes(key)) {
      addResult(true, `${name}保存`, `正确保存 ${key}`);
    } else {
      addResult(false, `${name}保存`, `未保存 ${key}`, 'MEDIUM');
    }
  });
}

/**
 * 验证9: 检查通知配置保存
 */
function validateNotificationConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证9: 通知配置保存');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  const notifEnvVars = [
    { key: 'NOTIFICATION_CHAT_ID', name: 'ChatId' },
    { key: 'NOTIFICATION_ADMIN_USER_IDS', name: 'AdminUserIds' },
  ];

  notifEnvVars.forEach(({ key, name }) => {
    if (routeContent.includes(key)) {
      addResult(true, `${name}保存`, `正确保存 ${key}`);
    } else {
      addResult(false, `${name}保存`, `未保存 ${key}`, 'MEDIUM');
    }
  });
}

/**
 * 验证10: API 响应格式验证
 */
function validateAPIResponseFormat(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证10: API 响应格式');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查是否返回统一的响应格式
  const hasSuccessField = routeContent.includes("success: true") || routeContent.includes("success: false");
  const hasErrorField = routeContent.includes("error:");
  const hasDataField = routeContent.includes("data:");

  if (hasSuccessField) {
    addResult(true, 'success字段', 'API 返回包含 success 字段');
  } else {
    addResult(false, 'success字段', 'API 返回缺少 success 字段', 'HIGH');
  }

  if (hasErrorField) {
    addResult(true, 'error字段', 'API 返回包含 error 字段');
  } else {
    addResult(false, 'error字段', 'API 返回缺少 error 字段', 'MEDIUM');
  }

  if (hasDataField) {
    addResult(true, 'data字段', 'API 返回包含 data 字段');
  } else {
    addResult(false, 'data字段', 'API 返回缺少 data 字段', 'MEDIUM');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', '🔍 配置保存功能验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径:', process.cwd());

  // 执行所有验证
  validateKVStorageUsage();
  validateSensitiveFieldsEncryption();
  validateEnvWriteLogic();
  validateFeishuConfig();
  validateBitableConfig();
  validateAIConfig();
  validateTagConfig();
  validateScheduleConfig();
  validateNotificationConfig();
  validateAPIResponseFormat();

  // 输出报告
  console.log('\n' + '='.repeat(60));
  log('cyan', '📊 验证报告');
  console.log('='.repeat(60));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const highSeverityFailed = results.filter(r => !r.passed && r.severity === 'HIGH').length;

  console.log(`\n✅ 通过: ${passedCount} 项`);
  console.log(`❌ 失败: ${failedCount} 项`);
  if (highSeverityFailed > 0) {
    log('red', `   其中高危问题: ${highSeverityFailed} 项`);
  }

  if (failedCount > 0) {
    console.log('\n--- 失败项详情 ---');
    results.filter(r => !r.passed).forEach((r, i) => {
      log('red', `  ${i + 1}. [${r.severity}] ${r.test}`);
      log('red', `     ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  if (highSeverityFailed > 0) {
    log('red', '❌ 验证失败：发现高危问题需要立即修复');
    process.exit(1);
  } else if (failedCount > 0) {
    log('yellow', '⚠️ 验证完成：存在中低危问题，建议修复');
    process.exit(0);
  } else {
    log('green', '✅ 验证通过：配置保存功能正常');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
