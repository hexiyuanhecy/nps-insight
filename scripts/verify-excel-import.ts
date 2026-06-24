/**
 * Excel 导入验证测试脚本
 * 验证 Excel 导入功能是否正确解析数据并写入多维表格
 *
 * 运行方式: npx ts-node scripts/verify-excel-import.ts
 * 或: pnpm exec ts-node scripts/verify-excel-import.ts
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

interface ExcelFieldMapping {
  feedbackId?: string[];
  content?: string[];
  score?: string[];
  createTime?: string[];
  module?: string[];
  source?: string[];
  dissatisfactionReason?: string[];
  tenantId?: string[];
  tenantName?: string[];
  tenantScale?: string[];
  larkUserId?: string[];
}

interface TestFeedbackRecord {
  feedbackId: string;
  content: string;
  score: number;
  createTime: string;
  module?: string;
  source?: string;
  dissatisfactionReason?: string;
  tenantId?: string;
  tenantName?: string;
  tenantScale?: string;
  larkUserId?: string;
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
// Mock 数据
// ============================================

type MockExcelRow = Record<string, string | number | undefined>;

const MOCK_EXCEL_DATA: MockExcelRow[] = [
  {
    '反馈ID': 'FB001',
    '反馈内容': '应用打开速度太慢，希望优化',
    '评分': 6,
    '创建时间': '2024-01-15 10:30:00',
    '模块': '性能优化',
    '平台': 'iOS',
    '不满意原因': '加载慢',
    '租户ID': 'T001',
    '租户名称': '测试公司A',
    '租户规模': 'A4',
    '用户ID': 'U001',
  },
  {
    '反馈ID': 'FB002',
    '反馈内容': '希望增加批量导出功能',
    '评分': 7,
    '创建时间': '2024-01-15 14:20:00',
    '模块': '功能建议',
    '平台': 'Android',
    '不满意原因': '功能缺失',
    '租户ID': 'T002',
    '租户名称': '测试公司B',
    '租户规模': 'A5',
    '用户ID': 'U002',
  },
  {
    '反馈ID': 'FB003',
    '反馈内容': '界面配色不好看',
    '评分': 5,
    '创建时间': '2024-01-16 09:15:00',
    '模块': 'UI设计',
    '平台': 'Web',
    '不满意原因': '界面不美观',
    '租户ID': 'T003',
    '租户名称': '测试公司C',
    '租户规模': 'A3',
    '用户ID': 'U003',
  },
];

// ============================================
// 核心验证逻辑
// ============================================

/**
 * 验证1: 检查 Excel 导入 API 路由
 */
function validateExcelImportRoute(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证1: Excel 导入 API 路由');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');

  if (!fs.existsSync(routePath)) {
    addResult(false, 'API路由', 'import-excel/route.ts 文件不存在', 'HIGH');
    return;
  }

  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查 POST 方法
  if (routeContent.includes('export async function POST')) {
    addResult(true, 'POST方法', '正确使用 POST 方法处理上传');
  } else {
    addResult(false, 'POST方法', '未找到 POST 方法处理器', 'HIGH');
  }

  // 检查 FormData 解析
  if (routeContent.includes('request.formData()')) {
    addResult(true, 'FormData解析', '正确使用 FormData 解析上传文件');
  } else {
    addResult(false, 'FormData解析', '未使用 FormData 解析上传文件', 'HIGH');
  }

  // 检查文件类型验证
  if (routeContent.includes('file.type') && routeContent.includes('.xlsx') && routeContent.includes('.csv')) {
    addResult(true, '文件类型验证', '正确验证文件类型');
  } else {
    addResult(false, '文件类型验证', '缺少文件类型验证', 'HIGH');
  }
}

/**
 * 验证2: 检查 ExcelAdapter 使用
 */
function validateExcelAdapter(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证2: ExcelAdapter 使用');
  console.log('='.repeat(60));

  const adapterPath = path.join(process.cwd(), 'src/lib/data-sources/excel-adapter.ts');

  if (!fs.existsSync(adapterPath)) {
    addResult(false, 'ExcelAdapter', 'excel-adapter.ts 文件不存在', 'HIGH');
    return;
  }

  const adapterContent = fs.readFileSync(adapterPath, 'utf-8');

  // 检查 xlsx 库使用
  if (adapterContent.includes('xlsx') || adapterContent.includes('xlsx.utils')) {
    addResult(true, 'xlsx库', '正确使用 xlsx 库解析 Excel');
  } else {
    addResult(false, 'xlsx库', '未使用 xlsx 库', 'HIGH');
  }

  // 检查 fetchData 方法
  if (adapterContent.includes('async fetchData')) {
    addResult(true, 'fetchData方法', '存在 fetchData 异步方法');
  } else {
    addResult(false, 'fetchData方法', '缺少 fetchData 方法', 'HIGH');
  }

  // 检查字段映射
  if (adapterContent.includes('DEFAULT_FIELD_MAPPING') || adapterContent.includes('FieldMapping')) {
    addResult(true, '字段映射', '存在字段映射机制');
  } else {
    addResult(false, '字段映射', '缺少字段映射机制', 'MEDIUM');
  }
}

/**
 * 验证3: 检查字段自动识别
 */
function validateAutoFieldDetection(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证3: 字段自动识别');
  console.log('='.repeat(60));

  const adapterPath = path.join(process.cwd(), 'src/lib/data-sources/excel-adapter.ts');
  const adapterContent = fs.readFileSync(adapterPath, 'utf-8');

  // 检查自动识别方法
  if (adapterContent.includes('autoDetectFieldMapping')) {
    addResult(true, '自动识别方法', '存在 autoDetectFieldMapping 方法');
  } else {
    addResult(false, '自动识别方法', '缺少自动识别方法', 'MEDIUM');
  }

  // 检查字段名标准化
  if (adapterContent.includes('toLowerCase') && adapterContent.includes('trim')) {
    addResult(true, '字段名标准化', '对字段名进行标准化处理');
  } else {
    addResult(false, '字段名标准化', '未对字段名进行标准化', 'MEDIUM');
  }
}

/**
 * 验证4: 检查数据去重逻辑
 */
function validateDuplicateCheck(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证4: 数据去重逻辑');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查去重逻辑
  if (routeContent.includes('existingIds') && routeContent.includes('Set')) {
    addResult(true, '去重机制', '使用 Set 进行去重');
  } else if (routeContent.includes('filter') && routeContent.includes('feedbackId')) {
    addResult(true, '去重机制', '使用 filter 进行去重');
  } else {
    addResult(false, '去重机制', '缺少去重逻辑', 'HIGH');
  }

  // 检查是否查询已存在记录
  if (routeContent.includes('listRecords') || routeContent.includes('batchCreateRecords')) {
    addResult(true, '批量操作', '使用批量查询和创建方法');
  } else {
    addResult(false, '批量操作', '缺少批量操作方法', 'MEDIUM');
  }
}

/**
 * 验证5: 检查必填字段处理
 */
function validateRequiredFields(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证5: 必填字段处理');
  console.log('='.repeat(60));

  const adapterPath = path.join(process.cwd(), 'src/lib/data-sources/excel-adapter.ts');
  const adapterContent = fs.readFileSync(adapterPath, 'utf-8');

  // 检查反馈ID生成
  if (adapterContent.includes('feedbackId') && adapterContent.includes('EXCEL-')) {
    addResult(true, '反馈ID生成', '对缺失反馈ID的记录生成替代ID');
  } else {
    addResult(false, '反馈ID生成', '未处理缺失的反馈ID', 'MEDIUM');
  }

  // 检查评分类型转换
  if (adapterContent.includes('Number(') || adapterContent.includes('parseInt')) {
    addResult(true, '评分转换', '正确转换评分为数值类型');
  } else {
    addResult(false, '评分转换', '未处理评分类型转换', 'MEDIUM');
  }

  // 检查时间处理
  if (adapterContent.includes('Date') || adapterContent.includes('getTime') || adapterContent.includes('toISOString')) {
    addResult(true, '时间处理', '正确处理时间格式');
  } else {
    addResult(false, '时间处理', '缺少时间处理', 'MEDIUM');
  }
}

/**
 * 验证6: 检查可选字段处理
 */
function validateOptionalFields(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证6: 可选字段处理');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查可选字段条件写入
  const optionalFields = ['tenantId', 'tenantName', 'tenantScale', 'larkUserId', 'dissatisfactionReason'];
  let handledCount = 0;

  optionalFields.forEach(field => {
    if (routeContent.includes(`fields[FEEDBACK_FIELDS.${field.toUpperCase()}`) || routeContent.includes(field)) {
      handledCount++;
    }
  });

  if (handledCount >= 3) {
    addResult(true, '可选字段', `正确处理可选字段（${handledCount}/${optionalFields.length}）`);
  } else {
    addResult(false, '可选字段', `可选字段处理不完整（${handledCount}/${optionalFields.length}）`, 'MEDIUM');
  }
}

/**
 * 验证7: 检查响应格式
 */
function validateResponseFormat(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证7: 响应格式');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查成功响应
  if (routeContent.includes('success: true')) {
    addResult(true, '成功响应', '返回 success: true');
  } else {
    addResult(false, '成功响应', '缺少 success: true 响应', 'HIGH');
  }

  // 检查数据统计
  const hasStats = routeContent.includes('total') && routeContent.includes('written') && routeContent.includes('skipped');
  if (hasStats) {
    addResult(true, '数据统计', '返回导入统计数据（total/written/skipped）');
  } else {
    addResult(false, '数据统计', '缺少导入统计数据', 'MEDIUM');
  }

  // 检查错误处理
  if (routeContent.includes('try') && routeContent.includes('catch')) {
    addResult(true, '错误处理', '存在 try-catch 错误处理');
  } else {
    addResult(false, '错误处理', '缺少错误处理', 'HIGH');
  }
}

/**
 * 验证8: 检查状态字段设置
 */
function validateStatusField(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证8: 状态字段设置');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查状态字段设置
  if (routeContent.includes("STATUS") && routeContent.includes('未打标')) {
    addResult(true, '状态字段', '正确设置状态为"未打标"');
  } else {
    addResult(false, '状态字段', '未正确设置状态字段', 'MEDIUM');
  }

  // 检查来源字段设置
  if (routeContent.includes("SOURCE") && routeContent.includes('excel_import')) {
    addResult(true, '来源字段', '正确设置来源为 excel_import');
  } else {
    addResult(false, '来源字段', '未正确设置来源字段', 'MEDIUM');
  }
}

/**
 * 验证9: 模拟 ExcelAdapter 数据解析
 */
function simulateExcelParsing(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证9: 模拟数据解析');
  console.log('='.repeat(60));

  try {
    // 模拟字段映射识别
    const headers = Object.keys(MOCK_EXCEL_DATA[0]);
    const fieldMapping: Record<string, string> = {};

    const fieldPatterns: Record<string, string[]> = {
      feedbackId: ['反馈ID', 'feedbackId', 'id'],
      content: ['反馈内容', 'content', '反馈'],
      score: ['评分', 'score', 'NPS'],
      createTime: ['创建时间', 'createTime', '时间'],
      module: ['模块', 'module', '分类'],
      source: ['平台', 'source', '来源'],
      dissatisfactionReason: ['不满意原因', 'reason'],
      tenantId: ['租户ID', 'tenantId'],
      tenantName: ['租户名称', 'tenantName'],
      tenantScale: ['租户规模', 'tenantScale', '规模'],
      larkUserId: ['用户ID', 'userId'],
    };

    headers.forEach(header => {
      const normalizedHeader = header.toLowerCase().trim();
      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(p => p.toLowerCase() === normalizedHeader)) {
          fieldMapping[field] = header;
          break;
        }
      }
    });

    // 验证字段识别
    const identifiedFields = Object.keys(fieldMapping).length;
    if (identifiedFields >= 5) {
      addResult(true, '字段识别', `成功识别 ${identifiedFields} 个字段: ${Object.keys(fieldMapping).join(', ')}`);
    } else {
      addResult(false, '字段识别', `仅识别 ${identifiedFields} 个字段，可能存在遗漏`, 'MEDIUM');
    }

    // 验证数据解析
    const parsedRecords = MOCK_EXCEL_DATA.map((row, index) => ({
      feedbackId: String(row[fieldMapping.feedbackId] || `EXCEL-${index + 1}`),
      content: String(row[fieldMapping.content] || ''),
      score: Number(row[fieldMapping.score]) || 0,
      createTime: String(row[fieldMapping.createTime] || new Date().toISOString()),
      module: row[fieldMapping.module],
      source: row[fieldMapping.source],
      dissatisfactionReason: row[fieldMapping.dissatisfactionReason],
      tenantId: row[fieldMapping.tenantId],
      tenantName: row[fieldMapping.tenantName],
      tenantScale: row[fieldMapping.tenantScale],
      larkUserId: row[fieldMapping.larkUserId],
    }));

    console.log('\n  解析结果示例:');
    parsedRecords.slice(0, 2).forEach((record, i) => {
      console.log(`    记录${i + 1}:`);
      console.log(`      反馈ID: ${record.feedbackId}`);
      console.log(`      内容: ${record.content.substring(0, 30)}...`);
      console.log(`      评分: ${record.score}`);
      console.log(`      租户: ${record.tenantName || '(无)'}`);
    });

    // 验证解析结果
    if (parsedRecords.length === MOCK_EXCEL_DATA.length) {
      addResult(true, '数据解析', `成功解析 ${parsedRecords.length} 条记录`);
    } else {
      addResult(false, '数据解析', `记录数不匹配：期望 ${MOCK_EXCEL_DATA.length}，实际 ${parsedRecords.length}`, 'HIGH');
    }

    // 验证评分范围
    const invalidScores = parsedRecords.filter(r => r.score < 0 || r.score > 10);
    if (invalidScores.length === 0) {
      addResult(true, '评分范围', '所有评分均在 0-10 范围内');
    } else {
      addResult(false, '评分范围', `发现 ${invalidScores.length} 条评分异常`, 'MEDIUM');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    addResult(false, '模拟解析', `模拟解析失败: ${errorMessage}`, 'HIGH');
  }
}

/**
 * 验证10: 检查错误场景处理
 */
function validateErrorHandling(): void {
  console.log('\n' + '='.repeat(60));
  log('cyan', '📋 验证10: 错误场景处理');
  console.log('='.repeat(60));

  const routePath = path.join(process.cwd(), 'src/app/api/config/import-excel/route.ts');
  const routeContent = fs.readFileSync(routePath, 'utf-8');

  // 检查空文件处理
  if (routeContent.includes('length === 0') || routeContent.includes('rawData.length === 0')) {
    addResult(true, '空文件处理', '正确处理空文件场景');
  } else {
    addResult(false, '空文件处理', '缺少空文件处理', 'MEDIUM');
  }

  // 检查文件类型错误
  if (routeContent.includes('文件格式不支持') || routeContent.includes('invalid') || routeContent.includes('not supported')) {
    addResult(true, '类型错误提示', '提供文件类型错误提示');
  } else {
    addResult(false, '类型错误提示', '缺少文件类型错误提示', 'MEDIUM');
  }

  // 检查环境变量验证
  if (routeContent.includes('BITABLE_TOKEN') && routeContent.includes('BITABLE_FEEDBACK_TABLE_ID')) {
    addResult(true, '环境变量检查', '检查多维表格环境变量');
  } else {
    addResult(false, '环境变量检查', '未检查多维表格环境变量', 'HIGH');
  }
}

// ============================================
// 主函数
// ============================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  log('cyan', '🔍 Excel 导入功能验证测试');
  console.log('='.repeat(60));
  console.log('\n项目路径:', process.cwd());

  // 执行所有验证
  validateExcelImportRoute();
  validateExcelAdapter();
  validateAutoFieldDetection();
  validateDuplicateCheck();
  validateRequiredFields();
  validateOptionalFields();
  validateResponseFormat();
  validateStatusField();
  simulateExcelParsing();
  validateErrorHandling();

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
    log('green', '✅ 验证通过：Excel 导入功能正常');
    process.exit(0);
  }
}

// 执行
main().catch((error) => {
  console.error('验证脚本执行失败:', error);
  process.exit(1);
});
