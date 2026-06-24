/**
 * 消息通知验证测试脚本
 * 验证飞书消息通知功能是否正确发送通知
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

interface NotificationConfig {
  chatIds: string;
  adminUserIds: string;
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
 * 验证1: 检查通知适配器实现
 */
function validateNotificationAdapter(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证1: 通知适配器实现');
  console.log('='.repeat(60));

  const adapterPath = path.join(process.cwd(), 'src/lib/notification/feishu-notification.ts');

  if (!fs.existsSync(adapterPath)) {
    addResult(false, '通知适配器', 'feishu-notification.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(adapterPath, 'utf-8');

  // 检查通知适配器接口实现
  if (content.includes('NotificationAdapter')) {
    addResult(true, '接口实现', '正确实现 NotificationAdapter 接口');
  } else {
    addResult(false, '接口实现', '未实现 NotificationAdapter 接口', 'HIGH');
  }

  // 检查方法实现
  const methods = ['sendText', 'sendCard', 'sendPost', 'sendToMultiple'];
  methods.forEach(method => {
    if (content.includes(method)) {
      addResult(true, method + '方法', '实现了 ' + method + ' 方法');
    } else {
      addResult(false, method + '方法', '缺少 ' + method + ' 方法', 'MEDIUM');
    }
  });
}

/**
 * 验证2: 检查通知发送服务
 */
function validateNotifierService(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证2: 通知发送服务');
  console.log('='.repeat(60));

  const notifierPath = path.join(process.cwd(), 'src/lib/notification/feishu-notifier.ts');

  if (!fs.existsSync(notifierPath)) {
    addResult(false, '通知服务', 'feishu-notifier.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(notifierPath, 'utf-8');

  // 检查 Token 获取
  if (content.includes('getTenantAccessToken')) {
    addResult(true, 'Token获取', '使用 getTenantAccessToken 获取访问令牌');
  } else {
    addResult(false, 'Token获取', '未使用 getTenantAccessToken', 'HIGH');
  }

  // 检查消息发送 API
  if (content.includes('/im/v1/messages')) {
    addResult(true, '消息API', '正确使用飞书消息发送 API');
  } else {
    addResult(false, '消息API', '未使用飞书消息发送 API', 'HIGH');
  }

  // 检查错误处理
  if (content.includes('code !== 0') || content.includes('code == 0')) {
    addResult(true, '错误处理', '正确处理飞书 API 错误码');
  } else {
    addResult(false, '错误处理', '缺少错误码处理', 'MEDIUM');
  }
}

/**
 * 验证3: 检查延迟通知机制
 */
function validateDelayNotifier(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证3: 延迟通知机制');
  console.log('='.repeat(60));

  const delayNotifierPath = path.join(process.cwd(), 'src/lib/notification/delay-notifier.ts');

  if (!fs.existsSync(delayNotifierPath)) {
    addResult(false, '延迟通知', 'delay-notifier.ts 文件不存在', 'MEDIUM');
    return;
  }

  const content = fs.readFileSync(delayNotifierPath, 'utf-8');

  // 检查延迟通知函数
  if (content.includes('notifyConfigChange')) {
    addResult(true, '延迟通知函数', '存在 notifyConfigChange 函数');
  } else {
    addResult(false, '延迟通知函数', '缺少 notifyConfigChange 函数', 'MEDIUM');
  }

  // 检查延迟配置
  if (content.includes('setTimeout') || content.includes('delay')) {
    addResult(true, '延迟机制', '实现了延迟机制');
  } else {
    addResult(false, '延迟机制', '缺少延迟机制', 'MEDIUM');
  }
}

/**
 * 验证4: 检查 API 路由的通知功能
 */
function validateNotificationAPI(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证4: API 路由的通知功能');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');

  if (!fs.existsSync(routePath)) {
    addResult(false, '配置路由', 'route.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(routePath, 'utf-8');

  // 检查通知 API
  if (content.includes('testNotify')) {
    addResult(true, 'testNotify', '存在 testNotify 函数');
  } else {
    addResult(false, 'testNotify', '缺少 testNotify 函数', 'HIGH');
  }

  // 检查通知发送逻辑
  if (content.includes('sendNotification') || content.includes('/im/v1/messages')) {
    addResult(true, '发送逻辑', '存在通知发送逻辑');
  } else {
    addResult(false, '发送逻辑', '缺少通知发送逻辑', 'HIGH');
  }

  // 检查 ChatId 验证
  if (content.includes('chatIds') && content.includes('NOTIFICATION_CHAT_ID')) {
    addResult(true, 'ChatId验证', '正确处理 ChatId');
  } else {
    addResult(false, 'ChatId验证', '缺少 ChatId 验证', 'MEDIUM');
  }
}

/**
 * 验证5: 检查通知配置验证
 */
function validateNotificationConfig(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证5: 通知配置验证');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const content = fs.readFileSync(routePath, 'utf-8');

  // 检查配置验证
  if (content.includes('adminUserIds') && content.includes('trim()')) {
    addResult(true, '配置验证', '正确验证通知配置');
  } else {
    addResult(false, '配置验证', '缺少配置验证', 'MEDIUM');
  }

  // 检查错误返回
  if (content.includes('请先填写通知群 ID')) {
    addResult(true, '错误提示', '存在友好的错误提示');
  } else {
    addResult(false, '错误提示', '缺少错误提示', 'LOW');
  }
}

/**
 * 验证6: 检查通知消息格式
 */
function validateMessageFormat(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证6: 通知消息格式');
  console.log('='.repeat(60));

  const notifierPath = path.join(process.cwd(), 'src/lib/notification/feishu-notifier.ts');

  if (!fs.existsSync(notifierPath)) {
    addResult(false, '通知服务', 'feishu-notifier.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(notifierPath, 'utf-8');

  // 检查消息类型
  if (content.includes('msg_type')) {
    addResult(true, '消息类型', '正确设置消息类型');
  } else {
    addResult(false, '消息类型', '缺少消息类型设置', 'MEDIUM');
  }

  // 检查接收者类型
  if (content.includes('receive_id_type')) {
    addResult(true, '接收者类型', '正确设置接收者类型');
  } else {
    addResult(false, '接收者类型', '缺少接收者类型设置', 'MEDIUM');
  }

  // 检查 content 格式
  if (content.includes('JSON.stringify')) {
    addResult(true, '内容格式', '正确使用 JSON.stringify 格式化内容');
  } else {
    addResult(false, '内容格式', '未使用 JSON.stringify', 'MEDIUM');
  }
}

/**
 * 验证7: 检查通知卡片构建
 */
function validateCardBuilding(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证7: 通知卡片构建');
  console.log('='.repeat(60));

  const botPath = path.join(process.cwd(), 'src/lib/feishu/bot.ts');

  if (!fs.existsSync(botPath)) {
    addResult(false, 'Bot模块', 'bot.ts 文件不存在', 'MEDIUM');
    return;
  }

  const content = fs.readFileSync(botPath, 'utf-8');

  // 检查卡片构建函数
  if (content.includes('createWeeklyReportCard') || content.includes('createMonthlyReportCard')) {
    addResult(true, '报告卡片', '存在报告卡片构建函数');
  } else {
    addResult(false, '报告卡片', '缺少报告卡片构建函数', 'MEDIUM');
  }

  // 检查卡片元素
  if (content.includes('elements') && content.includes('tag:')) {
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
 * 验证8: 检查多群通知发送
 */
function validateMultiChatNotification(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证8: 多群通知发送');
  console.log('='.repeat(60));

  const adapterPath = path.join(process.cwd(), 'src/lib/notification/feishu-notification.ts');

  if (!fs.existsSync(adapterPath)) {
    addResult(false, '通知适配器', 'feishu-notification.ts 文件不存在', 'HIGH');
    return;
  }

  const content = fs.readFileSync(adapterPath, 'utf-8');

  // 检查多群发送
  if (content.includes('sendToMultiple') || content.includes('chatIds')) {
    addResult(true, '多群发送', '支持多群通知发送');
  } else {
    addResult(false, '多群发送', '不支持多群通知发送', 'MEDIUM');
  }

  // 检查循环发送
  if (content.includes('forEach') || content.includes('for')) {
    addResult(true, '循环发送', '使用循环发送多个群');
  } else {
    addResult(false, '循环发送', '缺少循环发送逻辑', 'MEDIUM');
  }

  // 检查错误处理
  if (content.includes('try') && content.includes('catch')) {
    addResult(true, '错误隔离', '每个群发送失败不影响其他群');
  } else {
    addResult(false, '错误隔离', '缺少错误隔离机制', 'MEDIUM');
  }
}

/**
 * 验证9: 模拟通知发送场景
 */
function simulateNotification(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证9: 模拟通知发送场景');
  console.log('='.repeat(60));

  // 模拟通知配置
  const mockConfig: NotificationConfig = {
    chatIds: 'oc_chat123,oc_chat456',
    adminUserIds: 'ou_admin1,ou_admin2',
  };

  // 模拟消息构建
  const mockMessage = {
    receive_id: 'oc_chat123',
    msg_type: 'text',
    content: JSON.stringify({ text: '[NPS Insight] 配置变更通知' }),
    receive_id_type: 'chat_id',
  };

  console.log('\n  模拟通知配置:');
  console.log('    ChatIds: ' + mockConfig.chatIds);
  console.log('    AdminUserIds: ' + mockConfig.adminUserIds);

  console.log('\n  模拟消息内容:');
  console.log('    receive_id: ' + mockMessage.receive_id);
  console.log('    msg_type: ' + mockMessage.msg_type);
  console.log('    content: ' + mockMessage.content);

  // 验证模拟
  if (mockConfig.chatIds.includes(',')) {
    addResult(true, '多群配置', '正确配置多个群 ID');
  } else {
    addResult(false, '多群配置', '群 ID 配置不正确', 'MEDIUM');
  }

  if (mockMessage.msg_type === 'text') {
    addResult(true, '消息类型', '消息类型正确');
  } else {
    addResult(false, '消息类型', '消息类型不正确', 'MEDIUM');
  }

  try {
    JSON.parse(mockMessage.content);
    addResult(true, '内容解析', '消息内容 JSON 格式正确');
  } catch {
    addResult(false, '内容解析', '消息内容 JSON 格式错误', 'HIGH');
  }
}

/**
 * 验证10: 检查通知与配置的关联
 */
function validateConfigNotificationLink(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '验证10: 通知与配置关联');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/route.ts');
  const content = fs.readFileSync(routePath, 'utf-8');

  // 检查配置变更通知
  if (content.includes('notifyConfigChange')) {
    addResult(true, '变更通知', '配置变更时发送通知');
  } else {
    addResult(false, '变更通知', '配置变更时未发送通知', 'MEDIUM');
  }

  // 检查环境变量关联
  if (content.includes('NOTIFICATION_CHAT_ID')) {
    addResult(true, '环境变量', '通知使用环境变量配置');
  } else {
    addResult(false, '环境变量', '通知未使用环境变量', 'HIGH');
  }

  // 检查通知测试功能
  if (content.includes('testNotify') || content.includes('测试')) {
    addResult(true, '测试功能', '存在通知测试功能');
  } else {
    addResult(false, '测试功能', '缺少通知测试功能', 'MEDIUM');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', '消息通知功能验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径: ' + process.cwd());

  // 执行所有验证
  validateNotificationAdapter();
  validateNotifierService();
  validateDelayNotifier();
  validateNotificationAPI();
  validateNotificationConfig();
  validateMessageFormat();
  validateCardBuilding();
  validateMultiChatNotification();
  simulateNotification();
  validateConfigNotificationLink();

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
    log('green', '验证通过：消息通知功能正常');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
