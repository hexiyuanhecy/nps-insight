/**
 * NPS Insight API测试脚本
 * 测试各个API端点
 * 
 * 用法: npm run test:api
 */

require('dotenv').config();

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

// 从环境变量获取配置
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_TOKEN = process.env.BITABLE_TOKEN;
const BITABLE_TABLE_ID = process.env.BITABLE_TABLE_ID;
const BITABLE_TABLE_ID_TAGS = process.env.BITABLE_TABLE_ID_TAGS;
const BITABLE_TABLE_ID_TENANTS = process.env.BITABLE_TABLE_ID_TENANTS;
const BITABLE_TABLE_ID_ANALYSIS = process.env.BITABLE_TABLE_ID_ANALYSIS;
const NOTIFICATION_CHAT_ID = process.env.NOTIFICATION_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

/**
 * 获取飞书Tenant Access Token
 */
async function getTenantAccessToken(): Promise<string> {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取Token失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

/**
 * 获取所有记录
 */
async function listRecords(token: string, tableId: string, pageSize: number = 100): Promise<any[]> {
  const allRecords: any[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BITABLE_API_BASE}/apps/${BITABLE_TOKEN}/tables/${tableId}/records`);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    url.searchParams.set('page_size', String(pageSize));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`列出记录失败: ${data.msg}`);
    }

    allRecords.push(...(data.data?.items || []));
    pageToken = data.data?.page_token;
    if (!data.data?.has_more) break;
  } while (pageToken);

  return allRecords;
}

/**
 * 发送API请求
 */
async function sendApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return {
    status: response.status,
    data: await response.json(),
  };
}

/**
 * 执行API测试
 */
async function testAPIs() {
  console.log('========================================');
  console.log('NPS Insight API测试');
  console.log('========================================\n');

  const results: Array<{ name: string; status: string; message: string }> = [];

  // 测试飞书连接
  try {
    console.log('【1】测试飞书连接...');
    const token = await getTenantAccessToken();
    results.push({ name: '飞书连接', status: 'PASS', message: '连接成功' });
    console.log('✓ 飞书连接成功');
  } catch (error) {
    results.push({ name: '飞书连接', status: 'FAIL', message: String(error) });
    console.log(`✗ 飞书连接失败: ${error}`);
  }

  // 测试反馈API
  try {
    console.log('\n【2】测试反馈API (/api/feedback)...');
    const response = await sendApiRequest('/api/feedback');
    if (response.status === 200) {
      results.push({ name: '反馈API', status: 'PASS', message: `获取${response.data.data?.length || 0}条反馈` });
      console.log(`✓ 反馈API成功: ${response.data.data?.length || 0}条反馈`);
    } else {
      results.push({ name: '反馈API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 反馈API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '反馈API', status: 'FAIL', message: String(error) });
    console.log(`✗ 反馈API失败: ${error}`);
  }

  // 测试标签API
  try {
    console.log('\n【3】测试标签API (/api/tags)...');
    const response = await sendApiRequest('/api/tags');
    if (response.status === 200) {
      results.push({ name: '标签API', status: 'PASS', message: `获取${response.data.data?.length || 0}条标签` });
      console.log(`✓ 标签API成功: ${response.data.data?.length || 0}条标签`);
    } else {
      results.push({ name: '标签API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 标签API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '标签API', status: 'FAIL', message: String(error) });
    console.log(`✗ 标签API失败: ${error}`);
  }

  // 测试租户API
  try {
    console.log('\n【4】测试租户API (/api/tenants)...');
    const response = await sendApiRequest('/api/tenants');
    if (response.status === 200) {
      results.push({ name: '租户API', status: 'PASS', message: `获取${response.data.data?.length || 0}条租户` });
      console.log(`✓ 租户API成功: ${response.data.data?.length || 0}条租户`);
    } else {
      results.push({ name: '租户API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 租户API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '租户API', status: 'FAIL', message: String(error) });
    console.log(`✗ 租户API失败: ${error}`);
  }

  // 测试分析API
  try {
    console.log('\n【5】测试分析API (/api/analysis)...');
    const response = await sendApiRequest('/api/analysis');
    if (response.status === 200) {
      results.push({ name: '分析API', status: 'PASS', message: '分析成功' });
      console.log(`✓ 分析API成功`);
    } else {
      results.push({ name: '分析API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 分析API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '分析API', status: 'FAIL', message: String(error) });
    console.log(`✗ 分析API失败: ${error}`);
  }

  // 测试通知API
  try {
    console.log('\n【6】测试通知API (/api/notify)...');
    const response = await sendApiRequest('/api/notify', {
      method: 'POST',
      body: JSON.stringify({
        title: '测试通知',
        message: '这是一条测试消息',
      }),
    });
    if (response.status === 200 || response.status === 201) {
      results.push({ name: '通知API', status: 'PASS', message: '发送成功' });
      console.log(`✓ 通知API成功`);
    } else {
      results.push({ name: '通知API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 通知API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '通知API', status: 'FAIL', message: String(error) });
    console.log(`✗ 通知API失败: ${error}`);
  }

  // 测试Cron同步API
  try {
    console.log('\n【7】测试Cron同步API (/api/cron/sync)...');
    const response = await sendApiRequest('/api/cron/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    if (response.status === 200) {
      results.push({ name: 'Cron同步API', status: 'PASS', message: '同步成功' });
      console.log(`✓ Cron同步API成功`);
    } else {
      results.push({ name: 'Cron同步API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ Cron同步API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: 'Cron同步API', status: 'FAIL', message: String(error) });
    console.log(`✗ Cron同步API失败: ${error}`);
  }

  // 测试Cron月度API
  try {
    console.log('\n【8】测试Cron月度API (/api/cron/monthly)...');
    const response = await sendApiRequest('/api/cron/monthly', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    if (response.status === 200) {
      results.push({ name: 'Cron月度API', status: 'PASS', message: '月度分析成功' });
      console.log(`✓ Cron月度API成功`);
    } else {
      results.push({ name: 'Cron月度API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ Cron月度API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: 'Cron月度API', status: 'FAIL', message: String(error) });
    console.log(`✗ Cron月度API失败: ${error}`);
  }

  // 测试配置API
  try {
    console.log('\n【9】测试配置API (/api/config)...');
    const response = await sendApiRequest('/api/config');
    if (response.status === 200) {
      results.push({ name: '配置API', status: 'PASS', message: '获取配置成功' });
      console.log(`✓ 配置API成功`);
    } else {
      results.push({ name: '配置API', status: 'FAIL', message: `状态码${response.status}` });
      console.log(`✗ 配置API失败: 状态码${response.status}`);
    }
  } catch (error) {
    results.push({ name: '配置API', status: 'FAIL', message: String(error) });
    console.log(`✗ 配置API失败: ${error}`);
  }

  // 汇总结果
  console.log('\n========================================');
  console.log('API测试结果汇总');
  console.log('========================================');
  console.log('\n| API | 状态 | 消息 |');
  console.log('|-----|------|------|');
  for (const result of results) {
    const icon = result.status === 'PASS' ? '✓' : '✗';
    console.log(`| ${result.name} | ${icon} ${result.status} | ${result.message} |`);
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n通过: ${passCount}/${results.length}`);
  console.log(`失败: ${failCount}/${results.length}`);

  if (failCount > 0) {
    console.log('\n失败的API:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
  }

  console.log('\n========================================');
}

testAPIs().catch(console.error);
