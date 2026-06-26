// 逐步调试同步任务
import { initializeBitableConfig, bitableClient, TABLE_NAMES, FEEDBACK_FIELDS } from './src/lib/feishu/bitable';

async function test() {
  console.log('Step 1: 初始化 bitable 配置...');
  console.time('init');
  try {
    await initializeBitableConfig();
    console.timeEnd('init');
    console.log('✅ 初始化成功');
  } catch (e) {
    console.timeEnd('init');
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  }

  console.log('\nStep 2: 读取反馈表数据...');
  console.time('listRecords');
  try {
    const records = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, { pageSize: 5 });
    console.timeEnd('listRecords');
    console.log(`✅ 读取成功，共 ${records.length} 条`);
    if (records.length > 0) {
      console.log('第一条记录字段:', Object.keys(records[0].fields));
    }
  } catch (e) {
    console.timeEnd('listRecords');
    console.error('❌ 读取失败:', e);
    process.exit(1);
  }
}

test().catch(console.error);
