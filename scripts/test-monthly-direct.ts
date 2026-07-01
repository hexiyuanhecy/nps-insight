/**
 * 月分析专项验证脚本（直接函数调用版）
 * 直接调用 runMonthlyTask 函数，避免 HTTP 网络问题
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { runMonthlyTask } from '@/lib/monthly-task-runner';

interface TestResult {
  round: number;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: any;
}

async function runMonthlyAnalysis(round: number): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log(`  [第${round}轮] 触发月分析...`);
    const result = await runMonthlyTask();

    const evolutionOk = result.evolution?.success === true;
    const topIssuesOk = Array.isArray(result.topIssues) && result.topIssues.length > 0;
    const formulaSyncOk = result.formulaSync === true;
    const meetingDocOk = result.meetingDoc?.documentId && result.meetingDoc?.url;
    const notificationOk = result.notification === true;

    const allOk = evolutionOk && topIssuesOk && formulaSyncOk && meetingDocOk && notificationOk;

    return {
      round,
      passed: allOk,
      message: allOk
        ? `成功：标签进化→Top问题(${result.topIssues?.length || 0}个)→公式同步→会议文档→通知`
        : `不完整: 进化=${evolutionOk}, Top=${topIssuesOk}, 公式=${formulaSyncOk}, 文档=${meetingDocOk}, 通知=${notificationOk}`,
      durationMs: Date.now() - start,
      details: result
    };
  } catch (error: any) {
    return {
      round,
      passed: false,
      message: `异常: ${error.message}`,
      durationMs: Date.now() - start
    };
  }
}

async function main() {
  const totalRounds = parseInt(process.argv[2] || '10', 10);
  const results: TestResult[] = [];

  console.log('='.repeat(60));
  console.log(`  月分析专项验证（函数调用版） - ${totalRounds}轮`);
  console.log('='.repeat(60));
  console.log('');

  let passedCount = 0;
  let failedCount = 0;

  for (let i = 1; i <= totalRounds; i++) {
    console.log(`--- 第 ${i}/${totalRounds} 轮 ---`);
    const result = await runMonthlyAnalysis(i);
    results.push(result);

    const icon = result.passed ? '✅' : '❌';
    const duration = Math.round(result.durationMs / 1000);
    console.log(`  ${icon} ${result.message} (${duration}s)`);
    console.log('');

    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
      // 打印失败详情
      if (result.details?.error) {
        console.log(`    错误详情: ${result.details.error}`);
      }
    }
  }

  console.log('='.repeat(60));
  console.log('  结果汇总');
  console.log('='.repeat(60));
  console.log(`  总轮次: ${totalRounds}`);
  console.log(`  通过: ${passedCount}`);
  console.log(`  失败: ${failedCount}`);
  console.log(`  通过率: ${((passedCount / totalRounds) * 100).toFixed(1)}%`);

  if (results.length > 0) {
    const avgDuration = Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length / 1000);
    console.log(`  平均耗时: ${avgDuration}s`);
  }

  if (failedCount > 0) {
    console.log('');
    console.log('  失败轮次:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - 第${r.round}轮: ${r.message}`);
    });
  }

  console.log('='.repeat(60));

  // 返回退出码
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试脚本执行失败:', err);
  process.exit(1);
});
