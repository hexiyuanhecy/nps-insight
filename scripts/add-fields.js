/**
 * 脚本：给多维表格添加必要字段
 */

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

async function getTenantAccessToken() {
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: 'process.env.FEISHU_APP_ID',
      app_secret: 'process.env.FEISHU_APP_SECRET',
    }),
  });

  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`获取 token 失败: ${data.msg}`);
  }

  return data.tenant_access_token;
}

async function addField(token, appToken, tableId, fieldName, fieldType, property) {
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        field_name: fieldName,
        type: fieldType,
        property: property || undefined,
      }),
    }
  );

  const data = await response.json();
  if (data.code !== 0) {
    console.error(`添加字段 "${fieldName}" 失败:`, data.msg);
    return;
  }
  console.log(`✓ 添加字段 "${fieldName}" 成功`);
}

async function main() {
  const appToken = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
  const tableId = 'tblsiUDHKL6Mqj6P';

  console.log('开始添加字段...');
  const token = await getTenantAccessToken();
  console.log('Token 获取成功');

  // 要添加的字段列表
  const fields = [
    { name: '反馈ID', type: 1 },
    { name: '租户ID', type: 1 },
    { name: '租户名称', type: 1 },
    {
      name: '租户规模',
      type: 3,
      property: {
        options: [
          { color: 0, name: 'A1' },
          { color: 1, name: 'A2' },
          { color: 2, name: 'A3' },
          { color: 3, name: 'A4' },
          { color: 4, name: 'A5' },
        ],
      },
    },
    { name: '用户ID', type: 1 },
    { name: '用户名称', type: 1 },
    { name: '创建时间', type: 5 },
    { name: '模块', type: 1 },
    { name: '反馈内容', type: 1 },
    { name: '评分', type: 2 },
    { name: '来源', type: 1 },
    { name: 'Tag1', type: 1 },
    { name: 'Tag2', type: 1 },
    { name: 'Tag3', type: 1 },
    { name: '置信度', type: 2 },
    {
      name: '审核状态',
      type: 3,
      property: {
        options: [
          { color: 0, name: '待审核' },
          { color: 1, name: '已审核' },
          { color: 2, name: '无需审核' },
        ],
      },
    },
  ];

  for (const field of fields) {
    await addField(token, appToken, tableId, field.name, field.type, field.property);
  }

  console.log('\n✅ 所有字段添加完成！');
}

main().catch(console.error);
