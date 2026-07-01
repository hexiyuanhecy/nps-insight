/**
 * NPS Insight 全流程验证脚本
 * 
 * 两种模式：
 * - full: 完整模式，执行周同步+月分析（较慢，产生新数据）
 * - light: 轻量模式，只验证数据读取和字段绑定（较快，不产生新数据）
 */

const API_BASE = 'http://localhost:3002/api';
const LONG_TIMEOUT = 10 * 60 * 1000; // 长请求超时：10分钟

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
  durationMs?: number;
}

interface TestRoundResult {
  round: number;
  mode: 'full' | 'light';
  timestamp: string;
  results: ValidationResult[];
  allPassed: boolean;
  errors: string[];
  totalDurationMs: number;
}

// ==================== 工具函数 ====================

async function apiGet(path: string, timeoutMs: number = 30000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    clearTimeout(timeout);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: `返回不是JSON: ${text.slice(0, 200)}` };
    }
  } catch (error: any) {
    clearTimeout(timeout);
    return { success: false, error: error.name === 'AbortError' ? `请求超时(${timeoutMs/1000}s)` : error.message };
  }
}

async function apiPost(path: string, body: any, timeoutMs: number = 30000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: `返回不是JSON: ${text.slice(0, 200)}` };
    }
  } catch (error: any) {
    clearTimeout(timeout);
    return { success: false, error: error.name === 'AbortError' ? `请求超时(${timeoutMs/1000}s)` : error.message };
  }
}

function measure<T extends (...args: any[]) => Promise<ValidationResult>>(fn: T): (...args: Parameters<T>) => Promise<ValidationResult> {
  return async (...args: Parameters<T>): Promise<ValidationResult> => {
    const start = Date.now();
    const result = await fn(...args);
    result.durationMs = Date.now() - start;
    return result;
  };
}

// ==================== 轻量级验证项（快速，不产生新数据） ====================

// 1. 配置API连通性
const validateConfigApi = measure(async (): Promise<ValidationResult> => {
  try {
    const res = await apiGet('/config');
    if (res.success && res.data) {
      return { 
        name: '配置API连通性', 
        passed: true, 
        message: `配置加载成功，devMode=${res.data.devMode}`,
        details: { devMode: res.data.devMode, bitableAppToken: res.data.bitable?.appToken ? '已配置' : '未配置' }
      };
    }
    return { name: '配置API连通性', passed: false, message: res.error || '配置加载失败' };
  } catch (error: any) {
    return { name: '配置API连通性', passed: false, message: `异常: ${error.message}` };
  }
});

// 2. 反馈数据读取与字段绑定
const validateFeedbackFields = measure(async (): Promise<ValidationResult> => {
  try {
    const res = await apiGet('/feedback?limit=10');
    if (!res.success || !res.data?.list || res.data.list.length === 0) {
      return { name: '反馈字段绑定', passed: false, message: '无数据或API失败' };
    }
    
    const sample = res.data.list[0];
    const requiredFields = [
      'feedbackId', 'tenantId', 'tenantName', 'userId', 
      'content', 'npsScore', 'source', 'status'
    ];
    
    const missingFields: string[] = [];
    for (const field of requiredFields) {
      if (!(field in sample) || sample[field] === undefined || sample[field] === null) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length === 0) {
      return { 
        name: '反馈字段绑定', 
        passed: true, 
        message: `字段完整，总数${res.data.total}条，抽样${res.data.list.length}条`,
        details: { total: res.data.total, sampleId: sample.feedbackId }
      };
    }
    
    return { 
      name: '反馈字段绑定', 
      passed: false, 
      message: `缺失字段: ${missingFields.join(', ')}`,
      details: { missingFields, sampleKeys: Object.keys(sample) }
    };
  } catch (error: any) {
    return { name: '反馈字段绑定', passed: false, message: `异常: ${error.message}` };
  }
});

// 3. 打标状态验证
const validateTaggingStatus = measure(async (): Promise<ValidationResult> => {
  try {
    const res = await apiGet('/feedback?limit=50');
    if (!res.success || !res.data?.list) {
      return { name: '打标状态验证', passed: false, message: '获取数据失败' };
    }
    
    const list = res.data.list;
    let taggedCount = 0;
    let withTag1 = 0;
    let withTag2 = 0;
    let withTag3 = 0;
    
    for (const item of list) {
      if (item.status === '已打标') taggedCount++;
      if (item.tag1 && item.tag1.length > 0) withTag1++;
      if (item.tag2 && item.tag2.length > 0) withTag2++;
      if (item.tag3 && item.tag3.length > 0) withTag3++;
    }
    
    const allTagged = taggedCount === list.length;
    const hasAllTags = withTag1 > 0 && withTag2 > 0 && withTag3 > 0;
    const passed = allTagged && hasAllTags;
    
    return {
      name: '打标状态验证',
      passed,
      message: passed 
        ? `抽样${list.length}条全部已打标，Tag1/2/3都有数据`
        : `数据异常: 已打标${taggedCount}/${list.length}, Tag1=${withTag1}, Tag2=${withTag2}, Tag3=${withTag3}`,
      details: { taggedCount, withTag1, withTag2, withTag3, total: list.length }
    };
  } catch (error: any) {
    return { name: '打标状态验证', passed: false, message: `异常: ${error.message}` };
  }
});

// 4. 标签表同步验证
const validateTagTables = measure(async (): Promise<ValidationResult> => {
  try {
    const [tag1Res, tag2Res, tag3Res] = await Promise.all([
      apiGet('/tags?level=tag1&pageSize=20'),
      apiGet('/tags?level=tag2&pageSize=20'),
      apiGet('/tags?level=tag3&pageSize=50'),
    ]);
    
    const tag1Count = tag1Res.data?.total || 0;
    const tag2Count = tag2Res.data?.total || 0;
    const tag3Count = tag3Res.data?.total || 0;
    
    // Tag1 应该有固定的7类
    const tag1Ok = tag1Count >= 7;
    // Tag2 和 Tag3 应该有数据
    const tag2Ok = tag2Count > 0;
    const tag3Ok = tag3Count > 0;
    
    const allOk = tag1Ok && tag2Ok && tag3Ok;
    
    return {
      name: '标签表同步验证',
      passed: allOk,
      message: allOk 
        ? `标签同步正常 - Tag1: ${tag1Count}, Tag2: ${tag2Count}, Tag3: ${tag3Count}`
        : `标签同步异常 - Tag1: ${tag1Count}(需>=7), Tag2: ${tag2Count}(需>0), Tag3: ${tag3Count}(需>0)`,
      details: { tag1Count, tag2Count, tag3Count }
    };
  } catch (error: any) {
    return { name: '标签表同步验证', passed: false, message: `异常: ${error.message}` };
  }
});

// 5. Top问题数据验证
const validateTopIssues = measure(async (): Promise<ValidationResult> => {
  try {
    const res = await apiGet('/analysis?pageSize=10');
    if (!res.success || !res.data?.list) {
      return { name: 'Top问题验证', passed: false, message: `获取失败: ${res.error}` };
    }
    
    const issues = res.data.list;
    
    if (issues.length === 0) {
      return { name: 'Top问题验证', passed: false, message: 'Top问题列表为空' };
    }
    
    // 验证Top问题结构
    const sample = issues[0];
    const hasRequiredFields = sample.tag2 && sample.totalCount > 0 && sample.largeTenantRatio !== undefined;
    
    // 验证排序（按大客户数降序）
    let sortedOk = true;
    for (let i = 1; i < Math.min(issues.length, 5); i++) {
      if (issues[i-1].largeTenantCount < issues[i].largeTenantCount) {
        sortedOk = false;
        break;
      }
    }
    
    const allOk = hasRequiredFields && sortedOk;
    
    return {
      name: 'Top问题验证',
      passed: allOk,
      message: allOk
        ? `Top问题数据正常，共${issues.length}个，按大客户数降序排列`
        : `Top问题数据异常: 字段完整=${hasRequiredFields}, 排序正确=${sortedOk}`,
      details: { count: issues.length, top3: issues.slice(0, 3).map((i: any) => ({ tag2: i.tag2, count: i.totalCount })) }
    };
  } catch (error: any) {
    return { name: 'Top问题验证', passed: false, message: `异常: ${error.message}` };
  }
});

// 6. 租户数据验证
const validateTenantData = measure(async (): Promise<ValidationResult> => {
  try {
    const res = await apiGet('/tenants?limit=20');
    if (!res.success || !res.data?.list) {
      return { name: '租户数据验证', passed: false, message: `获取失败: ${res.error}` };
    }
    
    const tenants = res.data.list;
    if (tenants.length === 0) {
      return { name: '租户数据验证', passed: false, message: '租户列表为空' };
    }
    
    const sample = tenants[0];
    const hasRequired = sample.tenantId && sample.tenantName;
    
    return {
      name: '租户数据验证',
      passed: hasRequired,
      message: hasRequired 
        ? `租户数据正常，共${res.data.total || tenants.length}个`
        : '租户数据字段不完整',
      details: { count: tenants.length, sample }
    };
  } catch (error: any) {
    return { name: '租户数据验证', passed: false, message: `异常: ${error.message}` };
  }
});

// ==================== 完整模式验证项（较慢，产生新数据） ====================

// 7. 周同步任务验证
const validateWeeklySync = measure(async (): Promise<ValidationResult> => {
  try {
    // 先获取当前数量
    const beforeRes = await apiGet('/feedback?limit=1');
    const beforeCount = beforeRes.data?.total || 0;
    
    console.log(`    执行前反馈数: ${beforeCount}`);
    console.log(`    触发周同步（可能需要2-3分钟）...`);
    
    // 触发周同步
    const syncRes = await apiPost('/config', { action: 'runManualSync', config: {} }, LONG_TIMEOUT);
    
    if (!syncRes.success) {
      return { 
        name: '周同步任务验证', 
        passed: false, 
        message: `同步失败: ${syncRes.error || syncRes.message}`,
        details: syncRes
      };
    }
    
    const data = syncRes.data;
    const details = data.details || [];
    
    // 检查关键步骤是否都完成了
    const hasMockData = details.some((d: string) => d.includes('写入') && d.includes('条反馈'));
    const hasTagging = details.some((d: string) => d.includes('AI打标完成'));
    const hasNotification = details.some((d: string) => d.includes('发送通知成功'));
    const hasWeeklyDoc = details.some((d: string) => d.includes('生成周报文档成功'));
    
    const allStepsOk = hasMockData && hasTagging && hasNotification && hasWeeklyDoc;
    
    // 验证数据是否增加
    const afterRes = await apiGet('/feedback?limit=1');
    const afterCount = afterRes.data?.total || 0;
    const actualNew = afterCount - beforeCount;
    
    return {
      name: '周同步任务验证',
      passed: allStepsOk && actualNew > 0,
      message: allStepsOk && actualNew > 0
        ? `周同步全流程成功：新增${actualNew}条，数据写入→AI打标→通知发送→周报生成`
        : `周同步异常: 步骤完整=${allStepsOk}, 新增数据=${actualNew > 0}`,
      details: { 
        beforeCount, 
        afterCount, 
        actualNew,
        syncedCount: data.syncedCount, 
        failedCount: data.failedCount, 
        details 
      }
    };
  } catch (error: any) {
    return { name: '周同步任务验证', passed: false, message: `异常: ${error.message}` };
  }
});

// 8. 月分析任务验证
const validateMonthlyAnalysis = measure(async (): Promise<ValidationResult> => {
  try {
    console.log(`    触发月分析（可能需要2-3分钟）...`);
    
    const res = await apiPost('/config', { action: 'runMonthlyAnalysis', config: {} }, LONG_TIMEOUT);
    
    if (!res.success) {
      return { 
        name: '月分析任务验证', 
        passed: false, 
        message: `月分析失败: ${res.error || res.message}`,
        details: res
      };
    }
    
    const data = res.data.data || res.data;
    
    // 检查关键步骤
    const evolutionOk = data.evolution?.success === true;
    const topIssuesOk = Array.isArray(data.topIssues) && data.topIssues.length > 0;
    const formulaSyncOk = data.formulaSync === true;
    const meetingDocOk = data.meetingDoc?.documentId && data.meetingDoc?.url;
    const notificationOk = data.notification === true;
    
    const allOk = evolutionOk && topIssuesOk && formulaSyncOk && meetingDocOk && notificationOk;
    
    return {
      name: '月分析任务验证',
      passed: allOk,
      message: allOk
        ? `月分析全流程成功：标签进化→Top问题(${data.topIssues.length}个)→公式同步→会议文档→通知发送`
        : `月分析步骤不完整: 标签进化=${evolutionOk}, Top问题=${topIssuesOk}, 公式同步=${formulaSyncOk}, 会议文档=${meetingDocOk}, 通知=${notificationOk}`,
      details: {
        evolutionSuccess: data.evolution?.success,
        topIssuesCount: data.topIssues?.length || 0,
        formulaSync: data.formulaSync,
        hasMeetingDoc: !!data.meetingDoc?.documentId,
        notification: data.notification
      }
    };
  } catch (error: any) {
    return { name: '月分析任务验证', passed: false, message: `异常: ${error.message}` };
  }
});

// ==================== 主流程 ====================

async function runLightRound(round: number): Promise<TestRoundResult> {
  const startTime = Date.now();
  const results: ValidationResult[] = [];
  const errors: string[] = [];
  
  const validations = [
    validateConfigApi,
    validateFeedbackFields,
    validateTaggingStatus,
    validateTagTables,
    validateTopIssues,
    validateTenantData,
  ];
  
  for (const validate of validations) {
    const result = await validate();
    results.push(result);
    if (!result.passed) {
      errors.push(`${result.name}: ${result.message}`);
    }
    const icon = result.passed ? '✅' : '❌';
    const dur = result.durationMs ? ` (${result.durationMs}ms)` : '';
    console.log(`  ${icon} ${result.name}${dur}: ${result.message}`);
  }
  
  const allPassed = results.every(r => r.passed);
  const totalDurationMs = Date.now() - startTime;
  
  return {
    round,
    mode: 'light',
    timestamp: new Date().toISOString(),
    results,
    allPassed,
    errors,
    totalDurationMs,
  };
}

async function runFullRound(round: number): Promise<TestRoundResult> {
  const startTime = Date.now();
  const results: ValidationResult[] = [];
  const errors: string[] = [];
  
  // 先跑轻量级的
  console.log('\n  --- 轻量验证 ---');
  const lightValidations = [
    validateConfigApi,
    validateFeedbackFields,
    validateTaggingStatus,
    validateTagTables,
    validateTopIssues,
  ];
  
  for (const validate of lightValidations) {
    const result = await validate();
    results.push(result);
    if (!result.passed) errors.push(`${result.name}: ${result.message}`);
    const icon = result.passed ? '✅' : '❌';
    const dur = result.durationMs ? ` (${result.durationMs}ms)` : '';
    console.log(`  ${icon} ${result.name}${dur}: ${result.message}`);
  }
  
  // 周同步
  console.log('\n  --- 周同步任务 ---');
  const weeklyResult = await validateWeeklySync();
  results.push(weeklyResult);
  if (!weeklyResult.passed) errors.push(`周同步: ${weeklyResult.message}`);
  const wIcon = weeklyResult.passed ? '✅' : '❌';
  const wDur = weeklyResult.durationMs ? ` (${Math.round(weeklyResult.durationMs/1000)}s)` : '';
  console.log(`  ${wIcon} ${weeklyResult.name}${wDur}: ${weeklyResult.message}`);
  
  // 等一下让数据稳定
  await new Promise(r => setTimeout(r, 3000));
  
  // 月分析
  console.log('\n  --- 月分析任务 ---');
  const monthlyResult = await validateMonthlyAnalysis();
  results.push(monthlyResult);
  if (!monthlyResult.passed) errors.push(`月分析: ${monthlyResult.message}`);
  const mIcon = monthlyResult.passed ? '✅' : '❌';
  const mDur = monthlyResult.durationMs ? ` (${Math.round(monthlyResult.durationMs/1000)}s)` : '';
  console.log(`  ${mIcon} ${monthlyResult.name}${mDur}: ${monthlyResult.message}`);
  
  const allPassed = results.every(r => r.passed);
  const totalDurationMs = Date.now() - startTime;
  
  return {
    round,
    mode: 'full',
    timestamp: new Date().toISOString(),
    results,
    allPassed,
    errors,
    totalDurationMs,
  };
}

async function runValidation(fullRounds: number, lightRounds: number) {
  console.log(`\n========================================`);
  console.log(`  NPS Insight 全流程验证`);
  console.log(`  完整模式: ${fullRounds} 轮`);
  console.log(`  轻量模式: ${lightRounds} 轮`);
  console.log(`  API: ${API_BASE}`);
  console.log(`========================================`);
  
  const allResults: TestRoundResult[] = [];
  let fullPassed = 0;
  let fullFailed = 0;
  let lightPassed = 0;
  let lightFailed = 0;
  const allErrors = new Set<string>();
  
  // 完整模式轮次
  for (let i = 1; i <= fullRounds; i++) {
    console.log(`\n========== [完整模式] 第 ${i}/${fullRounds} 轮 ==========`);
    try {
      const result = await runFullRound(i);
      allResults.push(result);
      
      if (result.allPassed) {
        fullPassed++;
        console.log(`\n  ✅ 第 ${i} 轮全部通过 (${Math.round(result.totalDurationMs/1000)}s)`);
      } else {
        fullFailed++;
        result.errors.forEach(e => allErrors.add(e));
        console.log(`\n  ❌ 第 ${i} 轮失败，错误 ${result.errors.length} 个`);
      }
      
      // 轮次之间休息
      if (i < fullRounds) {
        const waitTime = 5000;
        console.log(`  休息 ${waitTime/1000}s ...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    } catch (error: any) {
      console.error(`  第 ${i} 轮异常:`, error);
      fullFailed++;
      allErrors.add(`第${i}轮异常: ${error.message}`);
    }
  }
  
  // 轻量模式轮次
  if (lightRounds > 0) {
    console.log(`\n\n========== 开始轻量模式 ${lightRounds} 轮 ==========`);
    
    for (let i = 1; i <= lightRounds; i++) {
      const roundNum = fullRounds + i;
      process.stdout.write(`\r  轻量模式 第 ${i}/${lightRounds} 轮 ... `);
      
      try {
        const result = await runLightRound(roundNum);
        allResults.push(result);
        
        if (result.allPassed) {
          lightPassed++;
          process.stdout.write(`✅ (${Math.round(result.totalDurationMs/1000)}s)`);
        } else {
          lightFailed++;
          result.errors.forEach(e => allErrors.add(e));
          process.stdout.write(`❌ ${result.errors.length}个错误`);
        }
      } catch (error: any) {
        lightFailed++;
        allErrors.add(`轻量第${i}轮异常: ${error.message}`);
        process.stdout.write(`❌ 异常`);
      }
      
      // 轻量模式快速轮询，间隔短一点
      if (i < lightRounds) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    console.log('');
  }
  
  // 输出汇总
  console.log('\n\n========================================');
  console.log(`  验证结果汇总`);
  console.log(`========================================`);
  console.log(`完整模式: ${fullRounds} 轮，通过 ${fullPassed}，失败 ${fullFailed}`);
  console.log(`轻量模式: ${lightRounds} 轮，通过 ${lightPassed}，失败 ${lightFailed}`);
  console.log(`总轮次: ${allResults.length}`);
  const totalPassed = fullPassed + lightPassed;
  console.log(`总通过率: ${((totalPassed / allResults.length) * 100).toFixed(1)}%`);
  
  if (allErrors.size > 0) {
    console.log(`\n所有错误 (${allErrors.size}个):`);
    Array.from(allErrors).forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err}`);
    });
  } else {
    console.log(`\n  🎉 所有测试全部通过！`);
  }
  
  console.log('\n========================================');
  
  return allResults;
}

// 解析命令行参数
const args = process.argv.slice(2);
let fullRounds = 3;
let lightRounds = 10;

if (args[0]) {
  if (args[0] === 'full') {
    fullRounds = parseInt(args[1] || '3', 10);
    lightRounds = 0;
  } else if (args[0] === 'light') {
    fullRounds = 0;
    lightRounds = parseInt(args[1] || '10', 10);
  } else {
    fullRounds = parseInt(args[0], 10);
    lightRounds = parseInt(args[1] || '0', 10);
  }
}

runValidation(fullRounds, lightRounds).catch(console.error);
