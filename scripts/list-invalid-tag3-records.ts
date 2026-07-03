/**
 * 临时诊断脚本：列出飞书表中 Tag3 包含"测试数据"等无效值的记录
 * 用于清理历史污染数据
 *
 * 运行: pnpm tsx scripts/list-invalid-tag3-records.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { bitableClient, extractMultiSelectFieldValue, parseBitableDate } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { initializeBitableConfig } from '@/lib/feishu/bitable';

// 无效 Tag3 黑名单（与 tagger.ts 保持一致）
const INVALID_TAG3_PATTERNS = [
  /^测试数据$/,
  /^测试$/,
  /^test$/i,
  /^未知$/,
  /^无$/,
  /^未分类$/,
  /^暂无$/,
  /^其他$/,
];

async function main() {
  console.log('='.repeat(60));
  console.log('  查询 Tag3 包含无效值的反馈记录');
  console.log('='.repeat(60));

  // 初始化飞书配置
  await initializeBitableConfig();

  // 拉取所有反馈记录
  console.log('\n[1/2] 拉取反馈表所有记录...');
  const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 500 });
  console.log(`  总记录数: ${records.length}`);

  // 过滤 Tag3 包含无效值的记录
  console.log('\n[2/2] 过滤 Tag3 包含无效值的记录...');
  const invalidRecords = records.filter(r => {
    const tag3Arr = extractMultiSelectFieldValue(r.fields[FEEDBACK_FIELDS.TAG3]);
    return tag3Arr.some(t => INVALID_TAG3_PATTERNS.some(p => p.test(t.trim())));
  });

  console.log(`  无效记录数: ${invalidRecords.length}`);

  if (invalidRecords.length === 0) {
    console.log('\n没有发现无效 Tag3 记录，无需清理。');
    process.exit(0);
  }

  // 输出记录清单
  console.log('\n' + '='.repeat(60));
  console.log('  无效记录清单（待删除）');
  console.log('='.repeat(60));

  invalidRecords.forEach((r, idx) => {
    const tag3Arr = extractMultiSelectFieldValue(r.fields[FEEDBACK_FIELDS.TAG3]);
    const content = String(r.fields[FEEDBACK_FIELDS.CONTENT] || '').substring(0, 40);
    const createTime = parseBitableDate(r.fields[FEEDBACK_FIELDS.CREATE_TIME]);
    const score = r.fields[FEEDBACK_FIELDS.NPS_SCORE];
    console.log(`\n  #${idx + 1} record_id: ${r.record_id}`);
    console.log(`     内容: ${content}`);
    console.log(`     评分: ${score}`);
    console.log(`     创建时间: ${createTime ? createTime.toISOString() : '未知'}`);
    console.log(`     Tag3: ${tag3Arr.join(', ')}`);
  });

  // 输出 record_id 列表（方便后续删除脚本使用）
  console.log('\n' + '='.repeat(60));
  console.log('  record_id 列表（用于删除）');
  console.log('='.repeat(60));
  console.log(invalidRecords.map(r => r.record_id).join('\n'));

  console.log('\n' + '='.repeat(60));
  console.log(`  共 ${invalidRecords.length} 条记录待清理`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
