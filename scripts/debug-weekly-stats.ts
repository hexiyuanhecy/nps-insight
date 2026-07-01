/**
 * 模拟周报统计逻辑，验证 reviewCount 计算是否正确
 * 用法：npx tsx scripts/debug-weekly-stats.ts
 */
import { config } from 'dotenv';
import { bitableClient } from '../src/lib/feishu/bitable';
import { FEEDBACK_FIELDS, TABLE_NAMES } from '../src/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE, DEFAULT_TOP_N } from '../src/constants/app-constants';
import { extractMultiSelectFieldValue } from '../src/lib/feishu/bitable';

config({ path: '.env.local' });

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function debugStats() {
  console.log('='.repeat(60));
  console.log('调试：模拟周报统计逻辑');
  console.log('='.repeat(60));

  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });
    console.log(`\n总记录数: ${records.length}`);

    // 复制 sync-task.ts 里的时间逻辑
    const today = new Date();
    const weekNum = `第${getISOWeek(today)}周`;

    // 计算本周起止时间（和 sync-task 里的逻辑一致吗？让我看看...）
    // sync-task 里是在 sendNotification 函数里计算的，让我模拟一下
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 周日为0，转为7
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1); // 周一
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7); // 下周一

    console.log(`\n本周范围: ${weekStart.toLocaleString()} ~ ${weekEnd.toLocaleString()}`);

    let reviewCount = 0;
    let needLogCheckCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let totalWeekCount = 0;

    // 复制完全一样的判断逻辑
    for (const r of records) {
      const fields = r.fields || {};
      const createTime = new Date(String(fields[FEEDBACK_FIELDS.CREATE_TIME] || ''));

      // 调试：看看 createTime 对不对
      if (totalWeekCount < 5) {
        const rawVal = fields[FEEDBACK_FIELDS.CREATE_TIME];
        console.log(`\n  样本 ${totalWeekCount + 1}:`);
        console.log(`    原始值: ${rawVal} (类型: ${typeof rawVal})`);
        console.log(`    new Date(String(...)): ${createTime}`);
        console.log(`    isValid: ${!isNaN(createTime.getTime())}`);
      }

      if (createTime < weekStart || createTime >= weekEnd) continue;
      totalWeekCount++;

      // 待审核判断（和原代码完全一致）
      const reviewNeededVal = fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
      const reviewNeeded = reviewNeededVal === true || reviewNeededVal === '是' || String(reviewNeededVal).toLowerCase() === 'true';
      const needLogVal = fields[FEEDBACK_FIELDS.NEED_LOG_CHECK];
      const needLog = needLogVal === true || needLogVal === '是' || String(needLogVal).toLowerCase() === 'true';
      if (reviewNeeded) reviewCount++;
      if (needLog) needLogCheckCount++;

      const score = Number(fields[FEEDBACK_FIELDS.NPS_SCORE] || 0);
      if (score > 0) {
        scoreSum += score;
        scoreCount++;
      }
    }

    console.log(`\n📊 统计结果:`);
    console.log(`  本周记录数: ${totalWeekCount}`);
    console.log(`  待审核数 (reviewCount): ${reviewCount}`);
    console.log(`  需查日志数: ${needLogCheckCount}`);
    console.log(`  评分总数: ${scoreCount}`);
    console.log(`  平均分: ${scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : 0}`);
    console.log(`  是否触发警告(>100): ${reviewCount > 100 ? '是 ⚠️' : '否'}`);

    console.log('\n' + '='.repeat(60));

    if (reviewCount > 100 && totalWeekCount < reviewCount) {
      console.log('❌ 异常：待审核数 > 本周记录数！说明时间过滤失效了');
      console.log('   可能原因：createTime 解析失败，导致所有记录都被算成本周的');
    }

  } catch (error) {
    console.error('❌ 失败:', error);
    process.exit(1);
  }
}

debugStats();
