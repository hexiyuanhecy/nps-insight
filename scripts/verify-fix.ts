/**
 * 验证时间解析修复
 * 用法：npx tsx scripts/verify-fix.ts
 */
import { config } from 'dotenv';
import { bitableClient, parseBitableDate } from '../src/lib/feishu/bitable';
import { FEEDBACK_FIELDS, TABLE_NAMES } from '../src/lib/feishu/constants';
import { DEFAULT_PAGE_SIZE } from '../src/constants/app-constants';

config({ path: '.env.local' });

async function verify() {
  console.log('='.repeat(60));
  console.log('验证：时间解析修复');
  console.log('='.repeat(60));

  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: DEFAULT_PAGE_SIZE });
    console.log(`\n总记录数: ${records.length}`);

    // 计算本周时间范围
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    console.log(`本周范围: ${weekStart.toLocaleDateString()} ~ ${weekEnd.toLocaleDateString()}`);

    // 使用修复后的 parseBitableDate
    let weekCount = 0;
    let reviewCount = 0;
    let invalidCount = 0;

    for (const r of records) {
      const createTime = parseBitableDate(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
      if (!createTime) {
        invalidCount++;
        continue;
      }
      if (createTime >= weekStart && createTime < weekEnd) {
        weekCount++;
        const val = r.fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
        if (val === true || val === '是') reviewCount++;
      }
    }

    console.log(`\n📊 修复后统计结果:`);
    console.log(`  本周记录数: ${weekCount}`);
    console.log(`  本周待审核: ${reviewCount}`);
    console.log(`  时间解析失败: ${invalidCount}`);

    // 对比修复前（new Date(String(...))）
    let oldWeekCount = 0;
    let oldReviewCount = 0;
    for (const r of records) {
      const createTime = new Date(String(r.fields[FEEDBACK_FIELDS.CREATE_TIME] || ''));
      if (createTime < weekStart || createTime >= weekEnd) continue;
      oldWeekCount++;
      const val = r.fields[FEEDBACK_FIELDS.REVIEW_NEEDED];
      if (val === true || val === '是') oldReviewCount++;
    }

    console.log(`\n📊 修复前（对比）:`);
    console.log(`  本周记录数: ${oldWeekCount}`);
    console.log(`  本周待审核: ${oldReviewCount}`);

    console.log(`\n✅ 修复验证: ${weekCount !== oldWeekCount ? '修复生效！' : '无变化'}`);
    console.log(`   差异: ${oldWeekCount - weekCount} 条记录被错误算入本周`);

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ 失败:', error);
    process.exit(1);
  }
}

verify();
