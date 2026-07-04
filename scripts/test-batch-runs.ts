/**
 * 批量测试脚本：执行 3 次周打标 + 3 次月分析
 * 直接调用内部函数，绕过 HTTP API 认证
 * 
 * 运行方式：npx ts-node scripts/test-batch-runs.ts
 */

// ponytail: 直接复用项目内部函数，不重新实现逻辑
require('dotenv').config();

import { runSyncTask } from '../src/app/api/cron/sync/sync-task';
import { runMonthlyTask } from '../src/lib/monthly-task-runner';

// ============================================
// 配置
// ============================================

const RUN_COUNT = 3;
const WAIT_BETWEEN_RUNS_MS = 5000; // 每次运行间隔 5 秒

// ============================================
// 工具函数
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

// ============================================
// 主流程
// ============================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  NPS Insight 批量测试 - 3 次周打标 + 3 次月分析');
  console.log('  开始时间:', timestamp());
  console.log('  DEV_MODE:', process.env.CRON_DEV_MODE === 'true' ? '是（Mock 数据）' : '否（真实数据）');
  console.log('  通知群:', process.env.NOTIFICATION_CHAT_ID || '未配置');
  console.log('  日志平台 URL:', process.env.LOG_PLATFORM_URL_TEMPLATE || process.env.LOG_PLATFORM_URL || '未配置');
  console.log('='.repeat(60) + '\n');

  // ============================================
  // 第一阶段：3 次周打标
  // ============================================

  console.log('\n' + '─'.repeat(60));
  console.log('  📌 第一阶段：周打标（3 次）');
  console.log('─'.repeat(60) + '\n');

  const syncResults: any[] = [];

  for (let i = 1; i <= RUN_COUNT; i++) {
    console.log(`\n>>> 周打标 第 ${i}/${RUN_COUNT} 次开始 <<<`);
    console.log(`  时间: ${timestamp()}`);

    try {
      const result = await runSyncTask();
      console.log(`  ✅ 成功: syncedCount=${result.syncedCount}, failedCount=${result.failedCount}`);
      console.log(`  详情: ${result.details?.join(' | ') || '无'}`);
      syncResults.push({ round: i, success: true, result });
    } catch (error) {
      console.error(`  ❌ 失败: ${error instanceof Error ? error.message : String(error)}`);
      syncResults.push({ round: i, success: false, error: String(error) });
    }

    if (i < RUN_COUNT) {
      console.log(`  等待 ${WAIT_BETWEEN_RUNS_MS / 1000} 秒后继续...`);
      await sleep(WAIT_BETWEEN_RUNS_MS);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('  📊 周打标汇总');
  console.log('─'.repeat(60));
  syncResults.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`  第${r.round}次: ${status} ${r.success ? `synced=${r.result.syncedCount}` : r.error}`);
  });

  // 等待一段时间再开始月分析
  console.log('\n  等待 10 秒后开始月分析...');
  await sleep(10000);

  // ============================================
  // 第二阶段：3 次月分析
  // ============================================

  console.log('\n' + '─'.repeat(60));
  console.log('  📌 第二阶段：月分析（3 次）');
  console.log('─'.repeat(60) + '\n');

  const monthlyResults: any[] = [];

  for (let i = 1; i <= RUN_COUNT; i++) {
    console.log(`\n>>> 月分析 第 ${i}/${RUN_COUNT} 次开始 <<<`);
    console.log(`  时间: ${timestamp()}`);

    try {
      const result = await runMonthlyTask();
      console.log(`  ✅ 成功: evolution=${result.evolution ? '有' : '无'}, topIssues=${result.topIssues?.length || 0} 个, formulaSync=${result.formulaSync}, meetingDoc=${result.meetingDoc?.url || '无'}, notification=${result.notification}`);
      monthlyResults.push({ round: i, success: true, result });
    } catch (error) {
      console.error(`  ❌ 失败: ${error instanceof Error ? error.message : String(error)}`);
      monthlyResults.push({ round: i, success: false, error: String(error) });
    }

    if (i < RUN_COUNT) {
      console.log(`  等待 ${WAIT_BETWEEN_RUNS_MS / 1000} 秒后继续...`);
      await sleep(WAIT_BETWEEN_RUNS_MS);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('  📊 月分析汇总');
  console.log('─'.repeat(60));
  monthlyResults.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`  第${r.round}次: ${status} ${r.success ? `notification=${r.result.notification}, doc=${r.result.meetingDoc?.url ? '已生成' : '未生成'}` : r.error}`);
  });

  // ============================================
  // 最终汇总
  // ============================================

  console.log('\n' + '='.repeat(60));
  console.log('  🎯 最终汇总');
  console.log('='.repeat(60));

  const syncSuccess = syncResults.filter(r => r.success).length;
  const monthlySuccess = monthlyResults.filter(r => r.success).length;

  console.log(`  周打标: ${syncSuccess}/${RUN_COUNT} 成功`);
  console.log(`    - 通知消息: ${syncSuccess} 条`);
  console.log(`    - 周报文档: ${syncResults.filter(r => r.success && r.result?.details?.some((d: string) => d.includes('周报'))).length} 份`);

  console.log(`  月分析: ${monthlySuccess}/${RUN_COUNT} 成功`);
  console.log(`    - 通知消息: ${monthlyResults.filter(r => r.success && r.result?.notification).length} 条`);
  console.log(`    - 月报文档: ${monthlyResults.filter(r => r.success && r.result?.meetingDoc).length} 份`);

  console.log(`\n  日志平台 URL: ${process.env.LOG_PLATFORM_URL_TEMPLATE || process.env.LOG_PLATFORM_URL || '⚠️ 未配置'}`);
  console.log(`  结束时间: ${timestamp()}`);
  console.log('='.repeat(60) + '\n');
}

// 执行
main().catch(error => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
