// 检查多维表格的协作者
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';
const BITABLE_TOKEN = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';

async function getTenantAccessToken() {
  const response = await fetch(
    `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
    }
  );
  const data = await response.json();
  if (data.code === 0) return data.tenant_access_token;
  throw new Error(JSON.stringify(data));
}

async function checkDriveCollaborators(token) {
  // 飞书文档/表格协作者列表
  // file_token = bitable_token, 类型 bitable
  const response = await fetch(
    `${FEISHU_API_BASE}/drive/v1/permissions/${BITABLE_TOKEN}/members?type=bitable&page_size=50`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function addAppAsCollaborator(token) {
  // 使用应用自身的 open_id 或 app_id 添加为协作者
  // 通常需要先获取应用自身的身份
  // 先尝试用 app 方式获取用户信息
  const response = await fetch(
    `${FEISHU_API_BASE}/authen/v1/user_info`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.json();
}

async function main() {
  const token = await getTenantAccessToken();
  console.log('Token OK');

  console.log('\n=== 协作者列表 ===');
  const collabs = await checkDriveCollaborators(token);
  console.log(JSON.stringify(collabs, null, 2));

  console.log('\n=== 尝试检查应用自身 user_info ===');
  const info = await addAppAsCollaborator(token);
  console.log(JSON.stringify(info, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
