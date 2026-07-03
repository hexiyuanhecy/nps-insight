/**
 * 临时清理脚本：删除飞书表中 Tag3 包含"测试数据"等无效值的记录
 *
 * 安全措施：
 * 1. 先查询确认记录数
 * 2. 逐条删除（串行，避免并发问题）
 * 3. 输出详细删除日志
 *
 * 运行: pnpm tsx scripts/cleanup-invalid-tag3-records.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { bitableClient, extractMultiSelectFieldValue, deleteRecord } from '@/lib/feishu/bitable';
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
  console.log('  清理 Tag3 包含无效值的反馈记录');
  console.log('='.repeat(60));

  // 初始化飞书配置
  await initializeBitableConfig();

  // 步骤1：查询所有无效记录
  console.log('\n[1/3] 拉取反馈表所有记录并过滤无效 Tag3...');
  const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 500 });
  console.log(`  总记录数: ${records.length}`);

  const invalidRecords = records.filter(r => {
    const tag3Arr = extractMultiSelectFieldValue(r.fields[FEEDBACK_FIELDS.TAG3]);
    return tag3Arr.some(t => INVALID_TAG3_PATTERNS.some(p => p.test(t.trim())));
  });

  console.log(`  无效记录数: ${invalidRecords.length}`);

  if (invalidRecords.length === 0) {
    console.log('\n没有发现无效 Tag3 记录，无需清理。');
    process.exit(0);
  }

  // 步骤2：逐条删除
  console.log('\n[2/3] 开始逐条删除...');
  let successCount = 0;
  let failedCount = 0;
  const failedRecords: Array<{ recordId: string; error: string }> = [];

  for (let i = 0; i < invalidRecords.length; i++) {
    const r = invalidRecords[i];
    const content = String(r.fields[FEEDBACK_FIELDS.CONTENT] || '').substring(0, 30);
    try {
      await deleteRecord(TABLE_NAMES.FEEDBACK, r.record_id);
      successCount++;
      // 每删除 10 条打印一次进度
      if ((i + 1) % 10 === 0 || i === invalidRecords.length - 1) {
        console.log(`  进度: ${i + 1}/${invalidRecords.length} (成功 ${successCount}, 失败 ${failedCount})`);
      }
    } catch (err) {
      failedCount++;
      const errMsg = err instanceof Error ? err.message : '未知错误';
      failedRecords.push({ recordId: r.record_id, error: errMsg });
      console.error(`  ❌ 删除失败 [${r.record_id}] ${content}: ${errMsg}`);
    }
    // 短暂延迟，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 步骤3：输出结果汇总
  console.log('\n[3/3] 清理结果汇总');
  console.log('='.repeat(60));
  console.log(`  总记录数: ${invalidRecords.length}`);
  console.log(`  成功删除: ${successCount}`);
  console.log(`  删除失败: ${failedCount}`);

  if (failedRecords.length > 0) {
    console.log('\n  失败记录清单:');
    failedRecords.forEach(f => {
      console.log(`    - ${f.recordId}: ${f.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  if (failedCount === 0) {
    console.log('  ✅ 清理完成，所有无效记录已删除');
  } else {
    console.log(`  ⚠️  清理部分完成，${failedCount} 条记录删除失败，请重试`);
  }
  console.log('='.repeat(60));

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
