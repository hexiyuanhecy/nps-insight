/**
 * 配置回显功能验证脚本
 * 用于测试配置 API 是否正确处理敏感字段和非敏感字段
 */

const CONFIG_API_URL = 'http://localhost:3001/api/config';

// 类型定义
type TestStatus = 'PASS' | 'FAIL' | 'WARN' | 'INFO';

interface ValidationResult {
  field: string;
  status: TestStatus;
  message: string;
}

interface TestCase {
  name: string;
  description: string;
  validate: (config: unknown) => ValidationResult[];
}

// 测试用例定义
const testCases: TestCase[] = [
  {
    name: '敏感字段应显示为已配置状态',
    description: '验证 AppSecret、ApiKey 等敏感字段是否正确标记为 __SET__',
    validate: (config: unknown): ValidationResult[] => {
      const results: ValidationResult[] = [];
      const c = config as Record<string, Record<string, string | undefined>>;

      // 检查飞书 App Secret
      const feishuSecret = c.feishu?.appSecret;
      if (feishuSecret) {
        if (feishuSecret === '__SET__') {
          results.push({ field: 'feishu.appSecret', status: 'PASS', message: '正确标记为 __SET__' });
        } else {
          results.push({ field: 'feishu.appSecret', status: 'FAIL', message: `应返回 __SET__，实际返回: ${feishuSecret}` });
        }
      } else {
        results.push({ field: 'feishu.appSecret', status: 'WARN', message: '未配置（返回空字符串）' });
      }

      // 检查数据源 API Key
      const dsApiKey = c.dataSource?.apiKey;
      if (dsApiKey) {
        if (dsApiKey === '__SET__') {
          results.push({ field: 'dataSource.apiKey', status: 'PASS', message: '正确标记为 __SET__' });
        } else {
          results.push({ field: 'dataSource.apiKey', status: 'FAIL', message: `应返回 __SET__，实际返回: ${dsApiKey}` });
        }
      } else {
        results.push({ field: 'dataSource.apiKey', status: 'WARN', message: '未配置（返回空字符串）' });
      }

      // 检查 AI API Key
      const aiApiKey = c.ai?.apiKey;
      if (aiApiKey) {
        if (aiApiKey === '__SET__') {
          results.push({ field: 'ai.apiKey', status: 'PASS', message: '正确标记为 __SET__' });
        } else {
          results.push({ field: 'ai.apiKey', status: 'FAIL', message: `应返回 __SET__，实际返回: ${aiApiKey}` });
        }
      } else {
        results.push({ field: 'ai.apiKey', status: 'WARN', message: '未配置（返回空字符串）' });
      }

      return results;
    },
  },
  {
    name: '非敏感字段应显示实际值',
    description: '验证 AppId、BaseUrl、Model 等非敏感字段是否返回实际配置值',
    validate: (config: unknown): ValidationResult[] => {
      const results: ValidationResult[] = [];
      const c = config as Record<string, Record<string, string | undefined>>;

      // 检查飞书 App ID（非敏感）
      const feishuAppId = c.feishu?.appId;
      if (feishuAppId) {
        if (feishuAppId !== '__SET__' && feishuAppId !== '') {
          results.push({ field: 'feishu.appId', status: 'PASS', message: `正确返回实际值: ${feishuAppId}` });
        } else if (feishuAppId === '') {
          results.push({ field: 'feishu.appId', status: 'WARN', message: '未配置（返回空字符串）' });
        } else {
          results.push({ field: 'feishu.appId', status: 'FAIL', message: '不应标记为 __SET__' });
        }
      } else {
        results.push({ field: 'feishu.appId', status: 'WARN', message: '字段不存在' });
      }

      // 检查数据源 API URL（非敏感）
      const dsApiUrl = c.dataSource?.apiUrl;
      if (dsApiUrl) {
        if (dsApiUrl !== '__SET__') {
          results.push({ field: 'dataSource.apiUrl', status: 'PASS', message: `正确返回实际值: ${dsApiUrl}` });
        } else {
          results.push({ field: 'dataSource.apiUrl', status: 'FAIL', message: '不应标记为 __SET__' });
        }
      } else {
        results.push({ field: 'dataSource.apiUrl', status: 'WARN', message: '未配置（返回空字符串）' });
      }

      // 检查 AI Base URL（非敏感）
      const aiBaseUrl = c.ai?.baseUrl;
      if (aiBaseUrl) {
        if (aiBaseUrl !== '__SET__') {
          results.push({ field: 'ai.baseUrl', status: 'PASS', message: `正确返回实际值: ${aiBaseUrl}` });
        } else {
          results.push({ field: 'ai.baseUrl', status: 'FAIL', message: '不应标记为 __SET__' });
        }
      } else {
        results.push({ field: 'ai.baseUrl', status: 'WARN', message: '未配置（返回空字符串）' });
      }

      // 检查 AI Model（非敏感）
      const aiModel = c.ai?.model;
      if (aiModel) {
        if (aiModel !== '__SET__') {
          results.push({ field: 'ai.model', status: 'PASS', message: `正确返回实际值: ${aiModel}` });
        } else {
          results.push({ field: 'ai.model', status: 'FAIL', message: '不应标记为 __SET__' });
        }
      } else {
        results.push({ field: 'ai.model', status: 'WARN', message: '未配置（返回默认值）' });
      }

      return results;
    },
  },
  {
    name: '未配置字段应返回空字符串或默认值',
    description: '验证未配置的字段是否有合理的默认值',
    validate: (config: unknown): ValidationResult[] => {
      const results: ValidationResult[] = [];
      const c = config as Record<string, unknown>;

      // 检查多维表格配置
      const bitable = c.bitable as Record<string, string | undefined> | undefined;
      const appToken = bitable?.appToken;
      if (appToken === '' || appToken === undefined) {
        results.push({ field: 'bitable.appToken', status: 'PASS', message: '未配置时返回空字符串' });
      } else {
        results.push({ field: 'bitable.appToken', status: 'INFO', message: `已配置: ${appToken}` });
      }

      // 检查通知配置
      const notification = c.notification as Record<string, string | undefined> | undefined;
      const chatIds = notification?.chatIds;
      if (chatIds === '' || chatIds === undefined) {
        results.push({ field: 'notification.chatIds', status: 'PASS', message: '未配置时返回空字符串' });
      } else {
        results.push({ field: 'notification.chatIds', status: 'INFO', message: `已配置: ${chatIds}` });
      }

      // 检查 Tag1 是否有默认值
      const tag1 = c.tag1 as Array<unknown> | undefined;
      if (tag1 && Array.isArray(tag1) && tag1.length > 0) {
        results.push({ field: 'tag1', status: 'PASS', message: `有默认值，包含 ${tag1.length} 个标签` });
      } else {
        results.push({ field: 'tag1', status: 'FAIL', message: '应提供默认的 Tag1 配置' });
      }

      // 检查置信度阈值是否有默认值
      const tagging = c.tagging as Record<string, number | undefined> | undefined;
      const threshold = tagging?.confidenceThreshold;
      if (threshold) {
        results.push({ field: 'tagging.confidenceThreshold', status: 'PASS', message: `有默认值: ${threshold}` });
      } else {
        results.push({ field: 'tagging.confidenceThreshold', status: 'FAIL', message: '应提供默认值 0.8' });
      }

      return results;
    },
  },
  {
    name: '前端组件应正确处理敏感字段标记',
    description: '验证前端是否正确将 __SET__ 转换为显示状态',
    validate: (config: unknown): ValidationResult[] => {
      const results: ValidationResult[] = [];
      const c = config as Record<string, Record<string, string | undefined>>;

      // 模拟前端处理逻辑
      const feishuSecret = c.feishu?.appSecret;
      const dsApiKey = c.dataSource?.apiKey;
      const aiApiKey = c.ai?.apiKey;

      const processedFeishuSecret = feishuSecret === '__SET__' ? '__SET__' : feishuSecret || '';
      const processedDsApiKey = dsApiKey === '__SET__' ? '__SET__' : dsApiKey || '';
      const processedAiApiKey = aiApiKey === '__SET__' ? '__SET__' : aiApiKey || '';

      // 检查前端处理是否正确
      const savedChecks = [
        { field: 'feishu.appSecret', saved: !!processedFeishuSecret },
        { field: 'dataSource.apiKey', saved: !!processedDsApiKey },
        { field: 'ai.apiKey', saved: !!processedAiApiKey },
      ];

      savedChecks.forEach(check => {
        if (check.saved) {
          results.push({ field: check.field, status: 'PASS', message: '前端正确识别为已配置状态' });
        } else {
          results.push({ field: check.field, status: 'WARN', message: '前端识别为未配置状态' });
        }
      });

      return results;
    },
  },
];

// 执行测试
async function runTests() {
  console.log('========================================');
  console.log('配置回显功能验证测试');
  console.log('========================================\n');

  try {
    // 获取配置
    console.log('正在获取配置...');
    const response = await fetch(CONFIG_API_URL);
    const result = await response.json();

    if (!result.success) {
      console.error('❌ 获取配置失败:', result.error);
      return;
    }

    const config = result.data;
    console.log('✓ 配置获取成功\n');

    // 显示当前配置摘要
    const c = config as Record<string, Record<string, string | undefined>>;
    console.log('当前配置摘要:');
    console.log('----------------------------------------');
    console.log(`飞书 App ID: ${c.feishu?.appId || '(未配置)'}`);
    console.log(`飞书 App Secret: ${c.feishu?.appSecret === '__SET__' ? '(已配置)' : '(未配置)'}`);
    console.log(`数据源 API URL: ${c.dataSource?.apiUrl || '(未配置)'}`);
    console.log(`数据源 API Key: ${c.dataSource?.apiKey === '__SET__' ? '(已配置)' : '(未配置)'}`);
    console.log(`AI Provider: ${c.ai?.provider || '(未配置)'}`);
    console.log(`AI API Key: ${c.ai?.apiKey === '__SET__' ? '(已配置)' : '(未配置)'}`);
    console.log(`AI Model: ${c.ai?.model || '(未配置)'}`);
    console.log(`多维表格 Token: ${(c.bitable as Record<string, string>)?.appToken || '(未配置)'}`);
    console.log('----------------------------------------\n');

    // 执行测试用例
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let warningTests = 0;

    testCases.forEach((testCase, index) => {
      console.log(`\n测试 ${index + 1}: ${testCase.name}`);
      console.log(`描述: ${testCase.description}`);
      console.log('----------------------------------------');

      const results = testCase.validate(config);

      results.forEach(result => {
        totalTests++;
        const statusIcon: Record<TestStatus, string> = {
          'PASS': '✓',
          'FAIL': '✗',
          'WARN': '⚠',
          'INFO': 'ℹ',
        };

        if (result.status === 'PASS') passedTests++;
        if (result.status === 'FAIL') failedTests++;
        if (result.status === 'WARN') warningTests++;

        console.log(`${statusIcon[result.status]} ${result.field}: ${result.message}`);
      });
    });

    // 输出测试总结
    console.log('\n========================================');
    console.log('测试总结');
    console.log('========================================');
    console.log(`总测试项: ${totalTests}`);
    console.log(`通过: ${passedTests} ✓`);
    console.log(`失败: ${failedTests} ✗`);
    console.log(`警告: ${warningTests} ⚠`);
    console.log('========================================\n');

    if (failedTests > 0) {
      console.log('❌ 发现问题，需要修复');
    } else if (warningTests > 0) {
      console.log('⚠ 测试通过，但有部分字段未配置');
    } else {
      console.log('✓ 所有测试通过，配置回显功能正常');
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('❌ 测试执行失败:', errorMessage);
    console.error('\n请确保:');
    console.error('1. 开发服务器正在运行 (pnpm dev)');
    console.error('2. API 地址正确: ' + CONFIG_API_URL);
  }
}

// 执行测试
runTests();
