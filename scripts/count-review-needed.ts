/**
 * 统计多维表格中待审核记录数量
 * 用法：npx tsx scripts/count-review-needed.ts
 */
import { config } from 'dotenv';
import { bitableClient } from '../src/lib/feishu/bitable';
import { FEEDBACK_FIELDS, TABLE_NAMES } from '../src/lib/feishu/constants';

config({ path: '.env.local' });

async function countReviewNeeded() {
  console.log('='.repeat(60));
  console.log('统计多维表格待审核记录数');
  console.log('='.repeat(60));

  try {
    console.log('\n📊 获取所有反馈记录...');
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 500 });
    console.log(`总记录数: ${records.length}`);

    // 统计各种情况
    let countYes = 0;
    let countTrue = 0;
    let countNo = 0;
    let countFalse = 0;
    let countEmpty = 0;
    let countOther = 0;
    const otherValues: string[] = [];

    // 计算本周时间范围
    const now = new Date();
    const dayOfWeek = now.getDay() || 7;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    let weekCount = 0;
    let weekReviewCount = 0;

    for (const r of records) {
      const val = r.fields[FEEDBACK_FIELDS.REVIEW_NEEDED];

      if (val === '是') countYes++;
      else if (val === true) countTrue++;
      else if (val === '否') countNo++;
      else if (val === false) countFalse++;
      else if (val === undefined || val === null || val === '') countEmpty++;
      else {
        countOther++;
        if (otherValues.length < 10) otherValues.push(String(val));
      }

      // 统计本周的
      const createTimeVal = r.fields[FEEDBACK_FIELDS.CREATE_TIME];
      let createTime: Date | null = null;
      if (typeof createTimeVal === 'number') {
        createTime = new Date(createTimeVal);
      } else if (typeof createTimeVal === 'string') {
        createTime = new Date(createTimeVal);
      }

      if (createTime && createTime >= weekStart && createTime < weekEnd) {
        weekCount++;
        if (val === '是' || val === true) {
          weekReviewCount++;
        }
      }
    }

    console.log('\n📋 待审核字段值分布:');
    console.log(`  "是": ${countYes}`);
    console.log(`  true: ${countTrue}`);
    console.log(`  "否": ${countNo}`);
    console.log(`  false: ${countFalse}`);
    console.log(`  空值: ${countEmpty}`);
    console.log(`  其他值: ${countOther}`);
    if (otherValues.length > 0) {
      console.log(`    示例: ${otherValues.join(', ')}`);
    }

    console.log(`\n📅 本周记录数: ${weekCount}`);
    console.log(`  其中待审核: ${weekReviewCount}`);

    console.log('\n' + '='.repeat(60));
    console.log('结论：待审核=是 OR = true 的记录总数:', countYes + countTrue);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 统计失败:', error);
    process.exit(1);
  }
}

countReviewNeeded();
