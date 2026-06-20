// 先用 node 直接调用 API 添加应用为协作者
// 但我们缺少应用的 open_id，换个思路：
// 1. 通过消息 API 发送给自己，然后查看 sender 信息
// 2. 或者简单办法：通过 API 直接用 app 自身把自己加为协作者

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const APP_ID = 'process.env.FEISHU_APP_ID';
const APP_SECRET = 'process.env.FEISHU_APP_SECRET';
const BITABLE_TOKEN = 'Iofpb6FzEaBz9SsYsWtcgm0vnic';
const NOTIFICATION_CHAT_ID = 'oc_29d0d49f829145b53f32dbebba1b3c40';

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

async function sendMessageAndGetAppOpenId(token) {
  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: NOTIFICATION_CHAT_ID,
        msg_type: 'text',
        content: JSON.stringify({ text: '🔧 系统配置测试消息' }),
      }),
    }
  );
  const data = await response.json();
  console.log('消息返回:', JSON.stringify(data, null, 2));
  if (data.data?.sender?.id_type === 'app_id') {
    // 发送消息，拿到 sender 信息
    return data.data.sender;
  }
  return null;
}

async function addCollaborator(token, memberId, memberType, perm) {
  const response = await fetch(
    `${FEISHU_API_BASE}/drive/v1/permissions/${BITABLE_TOKEN}/members?type=bitable`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        member_type: memberType,
        member_id: memberId,
        perm: perm,
        perm_type: 'container',
      }),
    }
  );
  return response.json();
}

async function main() {
  const token = await getTenantAccessToken();
  console.log('Token OK');

  // 先获取 chat 成员列表，找一下应用自己的 open_id
  // 实际上从之前的 message 响应里已看到 sender.id = process.env.FEISHU_APP_ID，id_type = app_id
  // 但是添加协作者可能需要 openid
  // 让我们尝试直接用 app_id
  console.log('\n=== 尝试用 app_id 把自己加为协作者 ===');
  const result1 = await addCollaborator(token, 'process.env.FEISHU_APP_ID', 'openid', 'full_access');
  console.log(JSON.stringify(result1, null, 2));

  // 另一种方法：把 chat 加为协作者（即通知群所有人有编辑权限）
  console.log('\n=== 尝试把通知群加为协作者 ===');
  const result2 = await addCollaborator(token, NOTIFICATION_CHAT_ID, 'openchat', 'full_access');
  console.log(JSON.stringify(result2, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
