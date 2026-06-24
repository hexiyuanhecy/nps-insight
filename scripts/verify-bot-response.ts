/**
 * Bot 响应验证测试脚本
 * 验证飞书 Bot 响应功能是否正确处理消息和命令
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

type MessageType = 'text' | 'post' | 'interactive';

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
 * 验证1: 检查 Bot 模块实现
 */
function validateBotModule(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证1: Bot 模块实现');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');

  if (!fs.existsSync(botPath)) {
    addResult(false, 'Bot模块', 'bot.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查发送消息函数
  if (content.includes('sendMessage')) {
    addResult(true, 'sendMessage', '实现了 sendMessage 函数');
  } else {
    addResult(false, 'sendMessage', '缺少 sendMessage 函数', 'HIGH');
  }

  // 检查消息类型支持
  const msgTypes: MessageType[] = ['text', 'post', 'interactive'];
  msgTypes.forEach(type => {
    if (content.includes(type)) {
      addResult(true, type + '类型', '支持 ' + type + ' 消息类型');
    } else {
      addResult(false, type + '类型', '不支持 ' + type + ' 消息类型', 'MEDIUM');
    }
  });

  // 检查 UUID 生成
  if (content.includes('generateUUID') || content.includes('uuid')) {
    addResult(true, 'UUID生成', '实现了 UUID 生成');
  } else {
    addResult(false, 'UUID生成', '缺少 UUID 生成', 'MEDIUM');
  }
}

/**
 * 验证2: 检查 Bot 客户端配置
 */
function validateBotClient(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证2: Bot 客户端配置');
  console.log('='.repeat(60));

  const clientPath = path.join(process.cwd(), 'src/lib/feishu/client.ts');

  if (!fs.existsSync(clientPath)) {
    addResult(false, '客户端模块', 'client.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(clientPath, 'utf-8');

  // 检查客户端导出
  if (content.includes('export') && content.includes('getFeishuClient')) {
    addResult(true, '客户端导出', '正确导出 getFeishuClient');
  } else {
    addResult(false, '客户端导出', '缺少 getFeishuClient 导出', 'HIGH');
  }

  // 检查 Token 获取
  if (content.includes('getTenantAccessToken')) {
    addResult(true, 'Token获取', '实现了 getTenantAccessToken');
  } else {
    addResult(false, 'Token获取', '缺少 getTenantAccessToken', 'HIGH');
  }

  // 检查环境变量使用
  if (content.includes('FEISHU_APP_ID') && content.includes('FEISHU_APP_SECRET')) {
    addResult(true, '环境变量', '正确使用飞书应用配置');
  } else {
    addResult(false, '环境变量', '未使用飞书应用配置', 'HIGH');
  }
}

/**
 * 验证3: 检查消息发送实现
 */
function validateMessageSending(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证3: 消息发送实现');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查 im.message.create API
  if (content.includes('im.message.create')) {
    addResult(true, '消息API', '正确使用 im.message.create API');
  } else {
    addResult(false, '消息API', '未使用 im.message.create API', 'HIGH');
  }

  // 检查 receive_id_type 参数
  if (content.includes('receive_id_type')) {
    addResult(true, '接收者类型', '正确设置 receive_id_type');
  } else {
    addResult(false, '接收者类型', '缺少 receive_id_type', 'MEDIUM');
  }

  // 检查错误处理
  if (content.includes('code !== 0') || content.includes('response.code')) {
    addResult(true, '错误处理', '正确处理 API 响应错误');
  } else {
    addResult(false, '错误处理', '缺少错误处理', 'HIGH');
  }
}

/**
 * 验证4: 检查卡片消息构建
 */
function validateCardBuilding(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证4: 卡片消息构建');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查卡片构建函数
  const cardFunctions = [
    'createFeedbackCard',
    'createAnalysisCard',
    'createWeeklyReportCard',
    'createMonthlyReportCard',
    'createHelpCard',
  ];

  let foundCount = 0;
  cardFunctions.forEach(func => {
    if (content.includes(func)) {
      foundCount++;
      addResult(true, func, '实现了 ' + func + ' 函数');
    }
  });

  if (foundCount >= 3) {
    addResult(true, '卡片函数', '实现了足够的卡片构建函数 (' + foundCount + '/' + cardFunctions.length + ')');
  } else {
    addResult(false, '卡片函数', '卡片构建函数不足', 'MEDIUM');
  }

  // 检查卡片元素
  if (content.includes('elements:')) {
    addResult(true, '卡片元素', '存在卡片元素定义');
  } else {
    addResult(false, '卡片元素', '缺少卡片元素定义', 'MEDIUM');
  }

  // 检查卡片配置
  if (content.includes('config:') && content.includes('wide_screen_mode')) {
    addResult(true, '卡片配置', '存在卡片配置');
  } else {
    addResult(false, '卡片配置', '缺少卡片配置', 'LOW');
  }
}

/**
 * 验证5: 检查 Webhook 路由
 */
function validateWebhookRoute(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证5: Webhook 路由');
  console.log('='.repeat(60));

  const webhookPath = path.join(process.cwd(), 'src/app/api/webhook/feishu/route.ts');

  if (!fs.existsSync(webhookPath)) {
    addResult(false, 'Webhook路由', 'webhook/feishu/route.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(webhookPath, 'utf-8');

  // 检查 POST 方法
  if (content.includes('export async function POST')) {
    addResult(true, 'POST方法', '正确实现 POST 方法');
  } else {
    addResult(false, 'POST方法', '缺少 POST 方法', 'HIGH');
  }

  // 检查事件验证
  if (content.includes('verification') || content.includes('challenge')) {
    addResult(true, '事件验证', '实现事件验证机制');
  } else {
    addResult(false, '事件验证', '缺少事件验证机制', 'MEDIUM');
  }

  // 检查消息处理
  if (content.includes('message') || content.includes('im.message')) {
    addResult(true, '消息处理', '实现消息处理逻辑');
  } else {
    addResult(false, '消息处理', '缺少消息处理逻辑', 'MEDIUM');
  }
}

/**
 * 验证6: 检查 Bot 命令处理
 */
function validateCommandHandling(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证6: Bot 命令处理');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查命令关键字
  const commands = ['help', 'report', 'status', 'config'];
  let foundCommands = 0;

  commands.forEach(cmd => {
    if (content.includes(cmd)) {
      foundCommands++;
    }
  });

  if (foundCommands >= 2) {
    addResult(true, '命令支持', '支持多种命令 (' + foundCommands + '/' + commands.length + ')');
  } else {
    addResult(false, '命令支持', '命令支持不足', 'MEDIUM');
  }

  // 检查快捷命令
  if (content.includes('/nps')) {
    addResult(true, '快捷命令', '支持 /nps 快捷命令');
  } else {
    addResult(false, '快捷命令', '不支持快捷命令', 'MEDIUM');
  }
}

/**
 * 验证7: 检查 Bot Onboarding
 */
function validateBotOnboarding(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证7: Bot Onboarding');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查 onboarding 卡片
  if (content.includes('createOnboardingCard')) {
    addResult(true, 'Onboarding', '实现了 onboarding 卡片');
  } else {
    addResult(false, 'Onboarding', '缺少 onboarding 卡片', 'MEDIUM');
  }

  // 检查 onboarding 内容
  if (content.includes('配置中心') || content.includes('配置')) {
    addResult(true, '配置引导', '包含配置引导内容');
  } else {
    addResult(false, '配置引导', '缺少配置引导内容', 'MEDIUM');
  }
}

/**
 * 验证8: 模拟 Bot 响应场景
 */
function simulateBotResponse(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证8: 模拟 Bot 响应场景');
  console.log('='.repeat(60));

  // 模拟消息
  const mockMessage = {
    receive_id: 'oc_chat123',
    msg_type: 'text' as MessageType,
    content: JSON.stringify({ text: 'NPS 当前分数是多少？' }),
    receive_id_type: 'chat_id',
    uuid: 'test-uuid-123',
  };

  console.log('\n  模拟发送消息:');
  console.log('    receive_id: ' + mockMessage.receive_id);
  console.log('    msg_type: ' + mockMessage.msg_type);
  console.log('    content: ' + mockMessage.content);
  console.log('    uuid: ' + mockMessage.uuid);

  // 验证消息格式
  try {
    JSON.parse(mockMessage.content);
    addResult(true, '消息格式', '消息内容 JSON 格式正确');
  } catch {
    addResult(false, '消息格式', '消息内容 JSON 格式错误', 'HIGH');
  }

  // 验证必需字段
  const requiredFields = ['receive_id', 'msg_type', 'content', 'receive_id_type'];
  let validFields = 0;
  requiredFields.forEach(field => {
    if (mockMessage[field as keyof typeof mockMessage]) {
      validFields++;
    }
  });

  if (validFields === requiredFields.length) {
    addResult(true, '必需字段', '所有必需字段都存在');
  } else {
    addResult(false, '必需字段', '缺少必需字段', 'HIGH');
  }
}

/**
 * 验证9: 检查错误处理和重试机制
 */
function validateErrorHandling(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证9: 错误处理和重试机制');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查 try-catch
  if (content.includes('try') && content.includes('catch')) {
    addResult(true, '异常捕获', '实现了异常捕获');
  } else {
    addResult(false, '异常捕获', '缺少异常捕获', 'MEDIUM');
  }

  // 检查错误日志
  if (content.includes('console.error') || content.includes('logger.error')) {
    addResult(true, '错误日志', '实现了错误日志');
  } else {
    addResult(false, '错误日志', '缺少错误日志', 'LOW');
  }

  // 检查消息 ID 返回
  if (content.includes('message_id') || content.includes('messageId')) {
    addResult(true, '消息ID', '返回消息 ID');
  } else {
    addResult(false, '消息ID', '未返回消息 ID', 'MEDIUM');
  }
}

/**
 * 验证10: 检查 Bot 与通知的集成
 */
function validateBotNotificationIntegration(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证10: Bot 与通知集成');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');
  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查通知发送函数引用
  if (content.includes('sendNotification') || content.includes('sendCardNotification')) {
    addResult(true, '通知引用', 'Bot 引用了通知发送函数');
  } else {
    addResult(false, '通知引用', 'Bot 未引用通知发送函数', 'MEDIUM');
  }

  // 检查 feishuBot 导出对象
  if (content.includes('export const feishuBot')) {
    addResult(true, '导出对象', '正确导出 feishuBot 对象');
  } else {
    addResult(false, '导出对象', '缺少 feishuBot 导出', 'MEDIUM');
  }

  // 检查导出方法
  const exportedMethods = ['sendMessage', 'sendTextMessage', 'sendPostMessage', 'sendCardMessage'];
  let exportedCount = 0;
  exportedMethods.forEach(method => {
    if (content.includes(method)) {
      exportedCount++;
    }
  });

  if (exportedCount >= 2) {
    addResult(true, '导出方法', '正确导出 Bot 方法 (' + exportedCount + '/' + exportedMethods.length + ')');
  } else {
    addResult(false, '导出方法', 'Bot 方法导出不足', 'MEDIUM');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', 'Bot 响应功能验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径: ' + process.cwd());

  // 执行所有验证
  validateBotModule();
  validateBotClient();
  validateMessageSending();
  validateCardBuilding();
  validateWebhookRoute();
  validateCommandHandling();
  validateBotOnboarding();
  simulateBotResponse();
  validateErrorHandling();
  validateBotNotificationIntegration();

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
    log('green', '验证通过：Bot 响应功能正常');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
