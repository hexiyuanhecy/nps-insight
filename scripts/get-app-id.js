// 获取应用的 open_id
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';

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

async function getAppOpenId(token) {
  // 用 application/v3/app/info 或通过其他方式查应用 open_id
  // 实际上应用的 open_id 通常在消息通知返回的 sender.id 中
  // 让我们从 chat 接口中推断
  const response = await fetch(
    `${FEISHU_API_BASE}/bot/v3/info`,
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

  const botInfo = await getAppOpenId(token);
  console.log('Bot info:', JSON.stringify(botInfo, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
