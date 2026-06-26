const { FeishuClient } = require('./src/lib/feishu/client');
const client = new FeishuClient();

async function deleteApp() {
  const token = await client.getTenantAccessToken();
  const appToken = 'VRh5bsegaaH2wMsSGKbc6wiwnYd';
  
  // 获取所有表
  const tables = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(r => r.json());
  
  console.log('Tables:', tables.data?.items?.map(t => ({ id: t.table_id, name: t.name })));
  
  // 删除每个表
  for (const table of tables.data?.items || []) {
    const result = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${table.table_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json());
    console.log(`Deleted ${table.name}: `, result.code === 0 ? 'OK' : result.msg);
  }
}

deleteApp().catch(console.error);
