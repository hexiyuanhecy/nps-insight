/**
 * 周打标专项验证脚本（直接函数调用版）
 * 直接调用 runSyncTask 函数，避免 HTTP 网络问题
 *
 * 注意：执行此脚本会：
 * 1. 拉取外部数据源（如配置了 DATA_SOURCE_CONFIG）
 * 2. AI 批量打标未打标反馈
 * 3. 发送周报 Bot 通知卡片到飞书群（真实消息）
 * 4. 生成周报飞书文档（真实文档）
 *
 * 用法: pnpm tsx scripts/test-weekly-direct.ts [轮次]
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { runSyncTask } from '@/app/api/cron/sync/sync-task';

interface TestResult {
  round: number;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: any;
}

async function runWeeklyTask(round: number): Promise<TestResult> {
  const start = Date.now();
  try {
    console.log(`  [第${round}轮] 触发周打标...`);
    const result = await runSyncTask();

    // 验收标准：success=true + 发送通知成功 + 周报文档生成（如配置了）
    const success = result.success === true;
    const hasNotification = result.details?.some((d: string) => d.includes('发送通知成功'));
    const hasWeeklyDoc = result.details?.some((d: string) => d.includes('周报文档成功'));
    const hasTagging = result.details?.some((d: string) => d.includes('AI自动打标') || d.includes('AI打标完成'));

    const allOk = success && hasNotification;

    return {
      round,
      passed: allOk,
      message: allOk
        ? `成功：同步${result.syncedCount}条 | 打标${hasTagging ? '✓' : '✗'} | 通知${hasNotification ? '✓' : '✗'} | 周报文档${hasWeeklyDoc ? '✓' : '✗'}`
        : `不完整: success=${success}, 打标=${hasTagging}, 通知=${hasNotification}, 文档=${hasWeeklyDoc}`,
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
  const totalRounds = parseInt(process.argv[2] || '1', 10);
  const results: TestResult[] = [];

  console.log('='.repeat(60));
  console.log(`  周打标专项验证（函数调用版） - ${totalRounds}轮`);
  console.log('='.repeat(60));
  console.log('');

  // 打印关键配置状态（不打印敏感值）
  console.log('  [配置检查]');
  console.log(`    NOTIFICATION_CHAT_ID: ${process.env.NOTIFICATION_CHAT_ID ? '✓ 已配置' : '✗ 未配置'}`);
  console.log(`    DATA_SOURCE_CONFIG: ${process.env.DATA_SOURCE_CONFIG ? '✓ 已配置' : '✗ 未配置（将跳过外部数据同步）'}`);
  console.log(`    CRON_DEV_MODE: ${process.env.CRON_DEV_MODE === 'true' ? '✓ 开启（使用 Mock 数据）' : '✗ 关闭'}`);
  console.log(`    BITABLE_TOKEN: ${process.env.BITABLE_TOKEN ? '✓ 已配置' : '✗ 未配置'}`);
  console.log(`    FEISHU_APP_ID: ${process.env.FEISHU_APP_ID ? '✓ 已配置' : '✗ 未配置'}`);
  console.log('');

  let passedCount = 0;
  let failedCount = 0;

  for (let i = 1; i <= totalRounds; i++) {
    console.log(`--- 第 ${i}/${totalRounds} 轮 ---`);
    const result = await runWeeklyTask(i);
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
      if (result.details?.details) {
        console.log(`    详情: ${JSON.stringify(result.details.details)}`);
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
