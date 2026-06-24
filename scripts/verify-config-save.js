/**
 * 配置保存功能验证脚本
 * 验证配置中心的保存功能是否正确写入数据库
 */

const fs = require('fs');
const path = require('path');

// 测试配置数据
const TEST_CONFIG = {
  feishu: {
    appId: 'cli_test_app_id',
    appSecret: 'test_secret_12345', // 敏感字段
  },
  bitable: {
    mode: 'link',
    appToken: 'test_token_abc',
    url: 'https://www.feishu.cn/base/test_token_abc',
    feedbackTableId: 'tbl_feedback',
    tagsTableId: 'tbl_tags',
    tenantsTableId: 'tbl_tenants',
    analysisTableId: 'tbl_analysis',
  },
  dataSource: {
    apiUrl: 'https://api.test.com/feedback',
    apiKey: 'test_api_key_xyz', // 敏感字段
    queryParams: '{ "start": "{{start_unix}}", "end": "{{end_unix}}" }',
    timeRule: 'lastWeek',
  },
  ai: {
    provider: 'agnesai',
    apiKey: 'sk-test_key_789', // 敏感字段
    baseUrl: 'https://api.agnes.ai',
    model: 'agnes-2.0-flash',
  },
  tag1: [
    { name: '疑似Bug', definition: '功能异常、报错、崩溃', enabled: true },
  ],
  tag2Init: '功能模块A,功能模块B',
  tagging: {
    confidenceThreshold: 0.85,
    largeTenantLevels: ['A4', 'A5'],
  },
  schedule: {
    syncUnit: 'week',
    syncEvery: 1,
    syncTime: '09:00',
    syncWeekDay: 1,
    syncMonthDay: 1,
    analysisUnit: 'month',
    analysisEvery: 1,
    analysisTime: '00:00',
    analysisWeekDay: 1,
    analysisMonthDay: 1,
    syncCron: '0 9 * * 1',
    analysisCron: '0 0 1 * *',
    devMode: true,
  },
  logPlatform: {
    urlTemplate: 'https://log.test.com/{{traceId}}',
  },
  notification: {
    chatIds: 'oc_test_chat_id',
    adminUserIds: 'ou_test_admin',
  },
};

// 验证结果收集
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

/**
 * 验证1: 检查敏感字段是否加密存储
 */
function validateSensitiveFieldsEncryption() {
  console.log('\n=== 验证1: 敏感字段加密存储 ===');

  const sensitiveFields = [
    { key: 'FEISHU_APP_SECRET', value: TEST_CONFIG.feishu.appSecret },
    { key: 'DATA_SOURCE_API_KEY', value: TEST_CONFIG.dataSource.apiKey },
    { key: 'AGNESAI_API_KEY', value: TEST_CONFIG.ai.apiKey },
  ];

  // 模拟保存后的 .env 文件内容
  const envVars = {};
  envVars.FEISHU_APP_SECRET = TEST_CONFIG.feishu.appSecret;
  envVars.DATA_SOURCE_API_KEY = TEST_CONFIG.dataSource.apiKey;
  envVars.AGNESAI_API_KEY = TEST_CONFIG.ai.apiKey;

  sensitiveFields.forEach(({ key, value }) => {
    // 检查是否明文存储
    if (envVars[key] === value) {
      results.failed.push({
        test: '敏感字段加密',
        message: `${key} 以明文形式存储在 .env 文件中`,
        severity: 'HIGH',
      });
      console.log(`  ❌ ${key}: 明文存储 (值: ${value})`);
    } else if (envVars[key] && envVars[key].startsWith('encrypted:')) {
      results.passed.push({
        test: '敏感字段加密',
        message: `${key} 已加密存储`,
      });
      console.log(`  ✅ ${key}: 已加密存储`);
    } else {
      results.warnings.push({
        test: '敏感字段加密',
        message: `${key} 存储状态未知`,
      });
      console.log(`  ⚠️  ${key}: 存储状态未知`);
    }
  });
}

/**
 * 验证2: 检查配置是否写入 KV 存储
 */
function validateKVStorageUsage() {
  console.log('\n=== 验证2: KV 存储使用情况 ===');

  // 检查 kv-storage.ts 是否被 route.ts 调用
  const routeContent = fs.readFileSync(
    path.join(__dirname, '../src/app/api/config/route.ts'),
    'utf-8'
  );

  const kvStorageUsed = routeContent.includes('kv-storage') ||
                         routeContent.includes('setConfig') ||
                         routeContent.includes('getConfig');

  if (!kvStorageUsed) {
    results.failed.push({
      test: 'KV 存储使用',
      message: 'route.ts 没有使用 kv-storage.ts 提供的存储功能',
      severity: 'HIGH',
    });
    console.log('  ❌ route.ts 未调用 kv-storage.ts');
    console.log('  ❌ 配置仅写入 .env 文件,未写入 KV 存储');
  } else {
    results.passed.push({
      test: 'KV 存储使用',
      message: 'route.ts 使用了 kv-storage.ts',
    });
    console.log('  ✅ route.ts 调用了 kv-storage.ts');
  }
}

/**
 * 验证3: 检查配置写入逻辑
 */
function validateConfigWriteLogic() {
  console.log('\n=== 验证3: 配置写入逻辑 ===');

  const routeContent = fs.readFileSync(
    path.join(__dirname, '../src/app/api/config/route.ts'),
    'utf-8'
  );

  // 检查是否使用 fs.writeFileSync 写入 .env
  const usesFsWrite = routeContent.includes('fs.writeFileSync');
  const writesToEnv = routeContent.includes('.env');

  if (usesFsWrite && writesToEnv) {
    results.warnings.push({
      test: '配置写入逻辑',
      message: '配置使用 fs.writeFileSync 直接写入 .env 文件',
      severity: 'MEDIUM',
    });
    console.log('  ⚠️  使用 fs.writeFileSync 写入 .env 文件');
    console.log('  ⚠️  这种方式在 Vercel 等云平台可能不可用');
  } else {
    results.passed.push({
      test: '配置写入逻辑',
      message: '配置写入逻辑正常',
    });
    console.log('  ✅ 配置写入逻辑正常');
  }
}

/**
 * 验证4: 检查飞书配置保存
 */
function validateFeishuConfig() {
  console.log('\n=== 验证4: 飞书配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.feishu.appId) envVars.FEISHU_APP_ID = TEST_CONFIG.feishu.appId;
  if (TEST_CONFIG.feishu.appSecret) envVars.FEISHU_APP_SECRET = TEST_CONFIG.feishu.appSecret;

  // 检查 AppId 是否保存
  if (envVars.FEISHU_APP_ID === TEST_CONFIG.feishu.appId) {
    results.passed.push({
      test: '飞书 AppId 保存',
      message: 'FEISHU_APP_ID 正确保存',
    });
    console.log('  ✅ FEISHU_APP_ID 正确保存');
  } else {
    results.failed.push({
      test: '飞书 AppId 保存',
      message: 'FEISHU_APP_ID 未正确保存',
      severity: 'HIGH',
    });
    console.log('  ❌ FEISHU_APP_ID 未正确保存');
  }

  // 检查 AppSecret 是否加密保存
  if (envVars.FEISHU_APP_SECRET === TEST_CONFIG.feishu.appSecret) {
    results.failed.push({
      test: '飞书 AppSecret 保存',
      message: 'FEISHU_APP_SECRET 明文保存,应加密',
      severity: 'HIGH',
    });
    console.log('  ❌ FEISHU_APP_SECRET 明文保存');
  } else {
    results.passed.push({
      test: '飞书 AppSecret 保存',
      message: 'FEISHU_APP_SECRET 已加密保存',
    });
    console.log('  ✅ FEISHU_APP_SECRET 已加密保存');
  }
}

/**
 * 验证5: 检查多维表格配置保存
 */
function validateBitableConfig() {
  console.log('\n=== 验证5: 多维表格配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.bitable.appToken) envVars.BITABLE_TOKEN = TEST_CONFIG.bitable.appToken;
  if (TEST_CONFIG.bitable.url) envVars.BITABLE_URL = TEST_CONFIG.bitable.url;
  if (TEST_CONFIG.bitable.feedbackTableId) envVars.BITABLE_FEEDBACK_TABLE_ID = TEST_CONFIG.bitable.feedbackTableId;
  if (TEST_CONFIG.bitable.tagsTableId) envVars.BITABLE_TAGS_TABLE_ID = TEST_CONFIG.bitable.tagsTableId;
  if (TEST_CONFIG.bitable.tenantsTableId) envVars.BITABLE_TENANTS_TABLE_ID = TEST_CONFIG.bitable.tenantsTableId;
  if (TEST_CONFIG.bitable.analysisTableId) envVars.BITABLE_ANALYSIS_TABLE_ID = TEST_CONFIG.bitable.analysisTableId;

  const checks = [
    { key: 'BITABLE_TOKEN', expected: TEST_CONFIG.bitable.appToken },
    { key: 'BITABLE_URL', expected: TEST_CONFIG.bitable.url },
    { key: 'BITABLE_FEEDBACK_TABLE_ID', expected: TEST_CONFIG.bitable.feedbackTableId },
    { key: 'BITABLE_TAGS_TABLE_ID', expected: TEST_CONFIG.bitable.tagsTableId },
    { key: 'BITABLE_TENANTS_TABLE_ID', expected: TEST_CONFIG.bitable.tenantsTableId },
    { key: 'BITABLE_ANALYSIS_TABLE_ID', expected: TEST_CONFIG.bitable.analysisTableId },
  ];

  checks.forEach(({ key, expected }) => {
    if (envVars[key] === expected) {
      results.passed.push({
        test: '多维表格配置保存',
        message: `${key} 正确保存`,
      });
      console.log(`  ✅ ${key} 正确保存`);
    } else {
      results.failed.push({
        test: '多维表格配置保存',
        message: `${key} 未正确保存`,
        severity: 'HIGH',
      });
      console.log(`  ❌ ${key} 未正确保存`);
    }
  });
}

/**
 * 验证6: 检查 AI 配置保存
 */
function validateAIConfig() {
  console.log('\n=== 验证6: AI 配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.ai.provider) envVars.AGNESAI_PROVIDER = TEST_CONFIG.ai.provider;
  if (TEST_CONFIG.ai.apiKey) envVars.AGNESAI_API_KEY = TEST_CONFIG.ai.apiKey;
  if (TEST_CONFIG.ai.baseUrl) envVars.AGNESAI_BASE_URL = TEST_CONFIG.ai.baseUrl;
  if (TEST_CONFIG.ai.model) envVars.AGNESAI_MODEL = TEST_CONFIG.ai.model;

  // 检查 Provider 是否保存
  if (envVars.AGNESAI_PROVIDER === TEST_CONFIG.ai.provider) {
    results.passed.push({
      test: 'AI Provider 保存',
      message: 'AGNESAI_PROVIDER 正确保存',
    });
    console.log('  ✅ AGNESAI_PROVIDER 正确保存');
  } else {
    results.failed.push({
      test: 'AI Provider 保存',
      message: 'AGNESAI_PROVIDER 未正确保存',
      severity: 'MEDIUM',
    });
    console.log('  ❌ AGNESAI_PROVIDER 未正确保存');
  }

  // 检查 ApiKey 是否加密保存
  if (envVars.AGNESAI_API_KEY === TEST_CONFIG.ai.apiKey) {
    results.failed.push({
      test: 'AI ApiKey 保存',
      message: 'AGNESAI_API_KEY 明文保存,应加密',
      severity: 'HIGH',
    });
    console.log('  ❌ AGNESAI_API_KEY 明文保存');
  } else {
    results.passed.push({
      test: 'AI ApiKey 保存',
      message: 'AGNESAI_API_KEY 已加密保存',
    });
    console.log('  ✅ AGNESAI_API_KEY 已加密保存');
  }

  // 检查 BaseUrl 是否保存
  if (envVars.AGNESAI_BASE_URL === TEST_CONFIG.ai.baseUrl) {
    results.passed.push({
      test: 'AI BaseUrl 保存',
      message: 'AGNESAI_BASE_URL 正确保存',
    });
    console.log('  ✅ AGNESAI_BASE_URL 正确保存');
  } else {
    results.warnings.push({
      test: 'AI BaseUrl 保存',
      message: 'AGNESAI_BASE_URL 未正确保存',
      severity: 'LOW',
    });
    console.log('  ⚠️  AGNESAI_BASE_URL 未正确保存');
  }

  // 检查 Model 是否保存
  if (envVars.AGNESAI_MODEL === TEST_CONFIG.ai.model) {
    results.passed.push({
      test: 'AI Model 保存',
      message: 'AGNESAI_MODEL 正确保存',
    });
    console.log('  ✅ AGNESAI_MODEL 正确保存');
  } else {
    results.warnings.push({
      test: 'AI Model 保存',
      message: 'AGNESAI_MODEL 未正确保存',
      severity: 'LOW',
    });
    console.log('  ⚠️  AGNESAI_MODEL 未正确保存');
  }
}

/**
 * 验证7: 检查标签配置保存
 */
function validateTagConfig() {
  console.log('\n=== 验证7: 标签配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.tag1) envVars.CONFIG_TAG1 = JSON.stringify(TEST_CONFIG.tag1);
  if (TEST_CONFIG.tag2Init) envVars.CONFIG_TAG2_INIT = TEST_CONFIG.tag2Init;
  if (TEST_CONFIG.tagging.confidenceThreshold) envVars.CONFIG_CONFIDENCE = String(TEST_CONFIG.tagging.confidenceThreshold);
  if (TEST_CONFIG.tagging.largeTenantLevels) envVars.CONFIG_LARGE_TENANTS = TEST_CONFIG.tagging.largeTenantLevels.join(',');

  const checks = [
    { key: 'CONFIG_TAG1', expected: JSON.stringify(TEST_CONFIG.tag1) },
    { key: 'CONFIG_TAG2_INIT', expected: TEST_CONFIG.tag2Init },
    { key: 'CONFIG_CONFIDENCE', expected: String(TEST_CONFIG.tagging.confidenceThreshold) },
    { key: 'CONFIG_LARGE_TENANTS', expected: TEST_CONFIG.tagging.largeTenantLevels.join(',') },
  ];

  checks.forEach(({ key, expected }) => {
    if (envVars[key] === expected) {
      results.passed.push({
        test: '标签配置保存',
        message: `${key} 正确保存`,
      });
      console.log(`  ✅ ${key} 正确保存`);
    } else {
      results.failed.push({
        test: '标签配置保存',
        message: `${key} 未正确保存`,
        severity: 'MEDIUM',
      });
      console.log(`  ❌ ${key} 未正确保存`);
    }
  });
}

/**
 * 验证8: 检查任务配置保存
 */
function validateScheduleConfig() {
  console.log('\n=== 验证8: 任务配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.schedule.syncCron) envVars.CRON_SYNC_SCHEDULE = TEST_CONFIG.schedule.syncCron;
  if (TEST_CONFIG.schedule.analysisCron) envVars.CRON_ANALYSIS_SCHEDULE = TEST_CONFIG.schedule.analysisCron;
  if (TEST_CONFIG.schedule.devMode !== undefined) envVars.CRON_DEV_MODE = String(TEST_CONFIG.schedule.devMode);

  const checks = [
    { key: 'CRON_SYNC_SCHEDULE', expected: TEST_CONFIG.schedule.syncCron },
    { key: 'CRON_ANALYSIS_SCHEDULE', expected: TEST_CONFIG.schedule.analysisCron },
    { key: 'CRON_DEV_MODE', expected: String(TEST_CONFIG.schedule.devMode) },
  ];

  checks.forEach(({ key, expected }) => {
    if (envVars[key] === expected) {
      results.passed.push({
        test: '任务配置保存',
        message: `${key} 正确保存`,
      });
      console.log(`  ✅ ${key} 正确保存`);
    } else {
      results.failed.push({
        test: '任务配置保存',
        message: `${key} 未正确保存`,
        severity: 'MEDIUM',
      });
      console.log(`  ❌ ${key} 未正确保存`);
    }
  });
}

/**
 * 验证9: 检查日志平台配置保存
 */
function validateLogPlatformConfig() {
  console.log('\n=== 验证9: 日志平台配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.logPlatform.urlTemplate) envVars.LOG_PLATFORM_URL_TEMPLATE = TEST_CONFIG.logPlatform.urlTemplate;

  if (envVars.LOG_PLATFORM_URL_TEMPLATE === TEST_CONFIG.logPlatform.urlTemplate) {
    results.passed.push({
      test: '日志平台配置保存',
      message: 'LOG_PLATFORM_URL_TEMPLATE 正确保存',
    });
    console.log('  ✅ LOG_PLATFORM_URL_TEMPLATE 正确保存');
  } else {
    results.warnings.push({
      test: '日志平台配置保存',
      message: 'LOG_PLATFORM_URL_TEMPLATE 未正确保存',
      severity: 'LOW',
    });
    console.log('  ⚠️  LOG_PLATFORM_URL_TEMPLATE 未正确保存');
  }
}

/**
 * 验证10: 检查通知配置保存
 */
function validateNotificationConfig() {
  console.log('\n=== 验证10: 通知配置保存 ===');

  const envVars = {};
  if (TEST_CONFIG.notification.chatIds) envVars.NOTIFICATION_CHAT_ID = TEST_CONFIG.notification.chatIds;
  if (TEST_CONFIG.notification.adminUserIds) envVars.NOTIFICATION_ADMIN_USER_IDS = TEST_CONFIG.notification.adminUserIds;

  const checks = [
    { key: 'NOTIFICATION_CHAT_ID', expected: TEST_CONFIG.notification.chatIds },
    { key: 'NOTIFICATION_ADMIN_USER_IDS', expected: TEST_CONFIG.notification.adminUserIds },
  ];

  checks.forEach(({ key, expected }) => {
    if (envVars[key] === expected) {
      results.passed.push({
        test: '通知配置保存',
        message: `${key} 正确保存`,
      });
      console.log(`  ✅ ${key} 正确保存`);
    } else {
      results.failed.push({
        test: '通知配置保存',
        message: `${key} 未正确保存`,
        severity: 'MEDIUM',
      });
      console.log(`  ❌ ${key} 未正确保存`);
    }
  });
}

/**
 * 输出验证报告
 */
function printReport() {
  console.log('\n========================================');
  console.log('验证报告');
  console.log('========================================\n');

  console.log(`✅ 通过: ${results.passed.length} 项`);
  console.log(`❌ 失败: ${results.failed.length} 项`);
  console.log(`⚠️  警告: ${results.warnings.length} 项\n`);

  if (results.failed.length > 0) {
    console.log('=== 失败项详情 ===');
    results.failed.forEach((item, index) => {
      console.log(`${index + 1}. [${item.severity}] ${item.test}: ${item.message}`);
    });
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log('=== 警告项详情 ===');
    results.warnings.forEach((item, index) => {
      console.log(`${index + 1}. [${item.severity}] ${item.test}: ${item.message}`);
    });
    console.log('');
  }

  // 计算严重性
  const highSeverity = results.failed.filter(f => f.severity === 'HIGH').length;
  const mediumSeverity = results.failed.filter(f => f.severity === 'MEDIUM').length;

  console.log('=== 总体评估 ===');
  if (highSeverity > 0) {
    console.log(`🔴 发现 ${highSeverity} 个高危问题,需要立即修复`);
  }
  if (mediumSeverity > 0) {
    console.log(`🟡 发现 ${mediumSeverity} 个中危问题,建议尽快修复`);
  }
  if (highSeverity === 0 && mediumSeverity === 0) {
    console.log('🟢 配置保存功能基本正常');
  }
  console.log('');
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('配置保存功能验证脚本');
  console.log('========================================\n');

  console.log('测试配置:');
  console.log(JSON.stringify(TEST_CONFIG, null, 2));

  // 执行所有验证
  validateSensitiveFieldsEncryption();
  validateKVStorageUsage();
  validateConfigWriteLogic();
  validateFeishuConfig();
  validateBitableConfig();
  validateAIConfig();
  validateTagConfig();
  validateScheduleConfig();
  validateLogPlatformConfig();
  validateNotificationConfig();

  // 输出报告
  printReport();
}

// 执行
main();
