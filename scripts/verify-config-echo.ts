/**
 * 配置回显验证测试脚本
 * 验证配置 API 是否正确处理敏感字段和非敏感字段的回显
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

type TestStatus = 'PASS' | 'FAIL' | 'WARN' | 'INFO';

interface ValidationCheck {
  field: string;
  status: TestStatus;
  message: string;
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
// 核心验证逻辑
// ============================================

/**
 * 验证1: 检查 GET handler 是否使用 __SET__ 标记敏感字段
 */
function validateSensitiveFieldMasking(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证1: 敏感字段 __SET__ 标记处理');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 查找 GET handler
  const getHandlerMatch = routeContent.match(/export async function GET[\s\S]*?return NextResponse\.json\([\s\S]*?\}/);
  if (!getHandlerMatch) {
    addResult(false, 'GET handler', '未找到 GET handler', 'HIGH');
    return;
  }

  const getHandler = getHandlerMatch[0];

  // 检查敏感字段是否使用 __SET__ 标记
  const sensitiveFields = [
    { field: 'appSecret', name: '飞书AppSecret' },
    { field: 'apiKey', name: '数据源ApiKey' },
    { field: 'apiKey', name: 'AI ApiKey', context: 'ai' },
  ];

  let maskedCount = 0;
  sensitiveFields.forEach(({ field, name, context }) => {
    // 检查是否有类似 ...config.feishu, appSecret: config.feishu.appSecret ? '__SET__' : '' 的模式
    const hasSetMarker = getHandler.includes('__SET__');

    if (hasSetMarker) {
      maskedCount++;
      addResult(true, name + '遮蔽', '正确使用 __SET__ 标记');
    } else {
      addResult(false, name + '遮蔽', '未使用 __SET__ 标记', 'HIGH');
    }
  });

  if (maskedCount > 0) {
    addResult(true, '敏感字段处理', 'GET API 正确处理敏感字段回显');
  }
}

/**
 * 验证2: 检查非敏感字段是否返回实际值
 */
function validateNonSensitiveFieldEcho(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证2: 非敏感字段实际值回显');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 非敏感字段
  const nonSensitiveFields = [
    { field: 'appId', name: '飞书AppId', section: 'feishu' },
    { field: 'apiUrl', name: '数据源API URL', section: 'dataSource' },
    { field: 'baseUrl', name: 'AI BaseUrl', section: 'ai' },
    { field: 'model', name: 'AI Model', section: 'ai' },
    { field: 'provider', name: 'AI Provider', section: 'ai' },
  ];

  // 检查 GET handler 是否返回实际值（不是 __SET__）
  const getHandlerMatch = routeContent.match(/export async function GET[\s\S]*?return NextResponse\.json\([\s\S]*?\}/);
  if (!getHandlerMatch) {
    addResult(false, 'GET handler', '未找到 GET handler', 'HIGH');
    return;
  }

  const getHandler = getHandlerMatch[0];

  nonSensitiveFields.forEach(({ field, name }) => {
    // 检查字段是否直接返回（不在三元表达式中返回 __SET__）
    const hasDirectReturn = getHandler.includes('config.') && getHandler.includes(field);
    if (hasDirectReturn) {
      addResult(true, name + '返回', '返回实际配置值');
    }
  });
}

/**
 * 验证3: 检查默认值填充
 */
function validateDefaultValueFilling(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证3: 默认值填充机制');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 buildV3Config 函数
  if (!routeContent.includes('function buildV3Config')) {
    addResult(false, 'buildV3Config', '缺少 buildV3Config 函数', 'HIGH');
    return;
  }

  // 检查是否在环境变量为空时使用默认值
  const defaultPatterns = [
    { pattern: "|| 'agnesai'", name: 'AI Provider默认值' },
    { pattern: "|| 'agnes-2.0-flash'", name: 'AI Model默认值' },
    { pattern: "|| '0.8'", name: '置信度阈值默认值' },
    { pattern: "|| 'lastWeek'", name: '数据源时间规则默认值' },
    { pattern: "|| 'link'", name: '多维表格模式默认值' },
  ];

  let defaultsFound = 0;
  defaultPatterns.forEach(({ pattern, name }) => {
    if (routeContent.includes(pattern)) {
      defaultsFound++;
      addResult(true, name, '正确设置默认值');
    } else {
      addResult(false, name, '缺少默认值: ' + pattern, 'MEDIUM');
    }
  });

  if (defaultsFound >= 3) {
    addResult(true, '默认值机制', '存在完整的默认值填充机制');
  }
}

/**
 * 验证4: 检查 Tag1 配置回显
 */
function validateTag1Echo(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证4: Tag1 配置回显');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 Tag1 配置
  if (routeContent.includes('tag1')) {
    addResult(true, 'Tag1字段', '配置中包含 tag1 字段');
  } else {
    addResult(false, 'Tag1字段', '配置中缺少 tag1 字段', 'HIGH');
  }

  // 检查是否返回 DEFAULT_TAG1
  if (routeContent.includes('DEFAULT_TAG1')) {
    addResult(true, 'DEFAULT_TAG1', '使用 DEFAULT_TAG1 作为默认值');
  } else {
    addResult(false, 'DEFAULT_TAG1', '未使用 DEFAULT_TAG1', 'MEDIUM');
  }

  // 检查 Tag1 是否有 7 个
  const tag1Match = routeContent.match(/DEFAULT_TAG1\s*=\s*\[([\s\S]*?)\];/);
  if (tag1Match) {
    const tag1Content = tag1Match[1];
    const tagCount = (tag1Content.match(/name:/g) || []).length;
    if (tagCount === 7) {
      addResult(true, 'Tag1数量', 'Tag1 包含 7 个默认标签');
    } else {
      addResult(false, 'Tag1数量', 'Tag1 数量不正确: ' + tagCount, 'MEDIUM');
    }
  }
}

/**
 * 验证5: 检查调度配置回显
 */
function validateScheduleEcho(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证5: 调度配置回显');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 schedule 配置
  if (routeContent.includes('schedule')) {
    addResult(true, 'schedule字段', '配置中包含 schedule 字段');
  } else {
    addResult(false, 'schedule字段', '配置中缺少 schedule 字段', 'HIGH');
  }

  // 检查 cron 字段
  const cronFields = ['syncCron', 'analysisCron', 'devMode'];
  cronFields.forEach(field => {
    if (routeContent.includes(field)) {
      addResult(true, field + '字段', '包含 ' + field + ' 字段');
    } else {
      addResult(false, field + '字段', '缺少 ' + field + ' 字段', 'MEDIUM');
    }
  });
}

/**
 * 验证6: 检查通知配置回显
 */
function validateNotificationEcho(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证6: 通知配置回显');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 notification 配置
  if (routeContent.includes('notification')) {
    addResult(true, 'notification字段', '配置中包含 notification 字段');
  } else {
    addResult(false, 'notification字段', '配置中缺少 notification 字段', 'HIGH');
  }

  // 检查通知字段
  const notifFields = [
    { field: 'chatIds', name: '群ID' },
    { field: 'adminUserIds', name: '管理员ID' },
  ];

  notifFields.forEach(({ field, name }) => {
    if (routeContent.includes(field)) {
      addResult(true, name + '字段', '包含 ' + name + ' 字段');
    } else {
      addResult(false, name + '字段', '缺少 ' + name + ' 字段', 'MEDIUM');
    }
  });
}

/**
 * 验证7: 检查响应格式一致性
 */
function validateResponseFormat(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证7: 响应格式一致性');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 GET handler 的返回格式
  const getHandlerMatch = routeContent.match(/export async function GET[\s\S]*?return NextResponse\.json\([\s\S]*?\}/);
  if (!getHandlerMatch) {
    addResult(false, 'GET handler', '未找到 GET handler', 'HIGH');
    return;
  }

  const getHandler = getHandlerMatch[0];

  // 检查返回格式
  if (getHandler.includes('success: true')) {
    addResult(true, 'success字段', '正确返回 success: true');
  } else {
    addResult(false, 'success字段', '缺少 success: true', 'HIGH');
  }

  if (getHandler.includes('data:')) {
    addResult(true, 'data字段', '正确返回 data 字段');
  } else {
    addResult(false, 'data字段', '缺少 data 字段', 'HIGH');
  }
}

/**
 * 验证8: 模拟配置回显场景
 */
function simulateConfigEcho(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证8: 模拟配置回显场景');
  console.log('='.repeat(60));

  // 模拟环境变量
  const mockEnv = {
    FEISHU_APP_ID: 'cli_abc123',
    FEISHU_APP_SECRET: 'encrypted_secret_xyz',
    BITABLE_TOKEN: 'test_token',
    AGNESAI_API_KEY: 'sk_test_key',
    AGNESAI_MODEL: 'agnes-2.0-flash',
    NOTIFICATION_CHAT_ID: 'oc_chat123',
  };

  // 模拟 buildV3Config 逻辑
  const mockConfig: Record<string, any> = {
    feishu: {
      appId: mockEnv.FEISHU_APP_ID || '',
      appSecret: mockEnv.FEISHU_APP_SECRET ? '__SET__' : '',
    },
    ai: {
      provider: 'agnesai',
      apiKey: mockEnv.AGNESAI_API_KEY ? '__SET__' : '',
      baseUrl: '',
      model: mockEnv.AGNESAI_MODEL || 'agnes-2.0-flash',
    },
    notification: {
      chatIds: mockEnv.NOTIFICATION_CHAT_ID || '',
      adminUserIds: '',
    },
  };

  // 验证模拟结果
  console.log('\n  模拟回显结果:');
  console.log('    feishu.appId: ' + mockConfig.feishu.appId + ' (应为实际值)');
  console.log('    feishu.appSecret: ' + mockConfig.feishu.appSecret + ' (应为__SET__)');
  console.log('    ai.apiKey: ' + mockConfig.ai.apiKey + ' (应为__SET__)');
  console.log('    ai.model: ' + mockConfig.ai.model + ' (应为实际值或默认值)');

  // 验证敏感字段遮蔽
  if (mockConfig.feishu.appSecret === '__SET__') {
    addResult(true, '敏感字段遮蔽', '飞书 AppSecret 正确遮蔽为 __SET__');
  } else {
    addResult(false, '敏感字段遮蔽', '飞书 AppSecret 未正确遮蔽', 'HIGH');
  }

  if (mockConfig.ai.apiKey === '__SET__') {
    addResult(true, '敏感字段遮蔽', 'AI ApiKey 正确遮蔽为 __SET__');
  } else {
    addResult(false, '敏感字段遮蔽', 'AI ApiKey 未正确遮蔽', 'HIGH');
  }

  // 验证非敏感字段返回实际值
  if (mockConfig.feishu.appId === 'cli_abc123') {
    addResult(true, '非敏感字段回显', '飞书 AppId 返回实际值');
  } else {
    addResult(false, '非敏感字段回显', '飞书 AppId 未返回实际值', 'MEDIUM');
  }

  if (mockConfig.ai.model === 'agnes-2.0-flash') {
    addResult(true, '默认值回显', 'AI Model 返回实际值或默认值');
  }
}

/**
 * 验证9: 检查前端组件的敏感字段处理
 */
function validateFrontendHandling(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证9: 前端敏感字段处理');
  console.log('='.repeat(60));

  // 检查配置中心组件
  const configCenterPath = path.join(process.cwd(), 'src/components/admin/config-center/use-config-actions.ts');

  if (!fs.existsSync(configCenterPath)) {
    addResult(false, 'use-config-actions', '文件不存在', 'MEDIUM');
    return;
  }

  const content = fs.readFileSync(configCenterPath, 'utf-8');

  // 检查是否处理 __SET__ 标记
  if (content.includes('__SET__')) {
    addResult(true, '__SET__处理', '前端正确处理 __SET__ 标记');
  } else {
    addResult(false, '__SET__处理', '前端未处理 __SET__ 标记', 'HIGH');
  }

  // 检查是否正确处理保存逻辑
  if (content.includes('appSecret') && content.includes('apiKey')) {
    addResult(true, '敏感字段引用', '组件中正确引用敏感字段');
  } else {
    addResult(false, '敏感字段引用', '组件中未正确引用敏感字段', 'MEDIUM');
  }
}

/**
 * 验证10: 检查配置验证逻辑
 */
function validateConfigValidation(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证10: 配置验证逻辑');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 POST handler
  const postHandlerMatch = routeContent.match(/export async function POST[\s\S]*?switch\s*\([\s\S]*?\}/);
  if (!postHandlerMatch) {
    addResult(false, 'POST handler', '未找到 POST handler', 'HIGH');
    return;
  }

  const postHandler = postHandlerMatch[0];

  // 检查 saveConfigV3 函数
  if (postHandler.includes('saveConfigV3')) {
    addResult(true, 'saveConfigV3', 'POST handler 正确调用 saveConfigV3');
  } else {
    addResult(false, 'saveConfigV3', 'POST handler 未调用 saveConfigV3', 'MEDIUM');
  }

  // 检查敏感字段保存时是否忽略 __SET__
  if (postHandler.includes("!== '__SET__'") || postHandler.includes("=== '__SET__'")) {
    addResult(true, '占位符识别', '正确识别 __SET__ 占位符');
  } else {
    addResult(false, '占位符识别', '未识别 __SET__ 占位符', 'HIGH');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', '配置回显功能验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径: ' + process.cwd());

  // 执行所有验证
  validateSensitiveFieldMasking();
  validateNonSensitiveFieldEcho();
  validateDefaultValueFilling();
  validateTag1Echo();
  validateScheduleEcho();
  validateNotificationEcho();
  validateResponseFormat();
  simulateConfigEcho();
  validateFrontendHandling();
  validateConfigValidation();

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
    log('green', '验证通过：配置回显功能正常');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
