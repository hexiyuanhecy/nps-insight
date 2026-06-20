/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 完整的端到端集成测试
 * 步骤：
 * 1. 清空旧数据并写入150条Mock反馈（含打标结果）
 * 2. 写入租户和标签
 * 3. 生成Top问题分析
 * 4. 发送3条飞书Bot消息
 * 5. 配置BITABLE_URL让按钮指向真实多维表格
 * 6. 设置用户为多维表格管理员
 */

const { writeFileSync, readFileSync, existsSync } = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// ============= 配置 =============
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const BITABLE_TOKEN = process.env.BITABLE_TOKEN;
const FEEDBACK_TABLE_ID = process.env.BITABLE_TABLE_ID;
const TAGS_TABLE_ID = process.env.BITABLE_TABLE_ID_TAGS;
const TENANTS_TABLE_ID = process.env.BITABLE_TABLE_ID_TENANTS;
const ANALYSIS_TABLE_ID = process.env.BITABLE_TABLE_ID_ANALYSIS;
const NOTIFICATION_CHAT_ID = process.env.NOTIFICATION_CHAT_ID;
const BITABLE_ADMIN_USER_ID = process.env.BITABLE_ADMIN_USER_ID || '7652234870831221705';

// 多维表格访问URL
const BITABLE_URL = `https://www.feishu.cn/base/${BITABLE_TOKEN}`;

// ============= Token =============
let _token = null;
async function getTenantAccessToken() {
  if (_token) return _token;
  const response = await fetch(
    `${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
    }
  );
  const data = await response.json();
  if (data.code !== 0) throw new Error('Token failed: ' + JSON.stringify(data));
  _token = data.tenant_access_token;
  return _token;
}

// ============= 打标签规则 =============
// 预设标签映射，基于问题内容自动打标
const TAG_RULES = [
  { keywords: ['定位', '定位失败', '定位超时', 'gps', 'GPS', 'gps信号'], tag1: '产品体验', tag2: '打卡定位', tag3: '定位失败' },
  { keywords: ['打卡记录', '记录不准', '记录错误'], tag1: '产品体验', tag2: '打卡定位', tag3: '打卡记录不准' },
  { keywords: ['打卡提醒', '提醒不及时', '提醒晚'], tag1: '产品体验', tag2: '通知提醒', tag3: '打卡提醒不及时' },
  { keywords: ['休假申请', '休假审批', '休假撤销', '销假'], tag1: '流程功能', tag2: '审批流程', tag3: '休假审批慢' },
  { keywords: ['审批流程', '审批慢', '审批驳回', '审批卡住', '卡住不动'], tag1: '流程功能', tag2: '审批流程', tag3: '审批流程慢' },
  { keywords: ['加班申请', '加班审批', '加班时长'], tag1: '流程功能', tag2: '审批流程', tag3: '加班申请' },
  { keywords: ['日报', '月报', '报表', '统计'], tag1: '流程功能', tag2: '数据报表', tag3: '报表导出失败' },
  { keywords: ['异常考勤', '考勤异常', '考勤统计'], tag1: '流程功能', tag2: '数据报表', tag3: '异常考勤统计' },
  { keywords: ['系统卡顿', '页面慢', '加载慢', '刷新慢', '保存慢'], tag1: '系统稳定性', tag2: '性能问题', tag3: '系统卡顿' },
  { keywords: ['崩溃', '闪退', '白屏', '黑屏'], tag1: '系统稳定性', tag2: '稳定性问题', tag3: '系统崩溃' },
  { keywords: ['按钮', '入口', '找不到', '复杂', '界面不友好'], tag1: '产品体验', tag2: '交互问题', tag3: '界面不友好' },
  { keywords: ['同步', '数据错误', '数据丢失', '上传失败', '下载失败', '导出失败'], tag1: '系统稳定性', tag2: '数据问题', tag3: '数据同步失败' },
  { keywords: ['没有响应', '无响应', '按钮失效'], tag1: '系统稳定性', tag2: '交互问题', tag3: '系统无响应' },
  { keywords: ['权限', '无法访问', '看不到'], tag1: '流程功能', tag2: '权限问题', tag3: '权限配置错误' },
];

function autoTagByContent(content) {
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(k => content.includes(k))) {
      return rule;
    }
  }
  return { tag1: '产品体验', tag2: '其他问题', tag3: '其他功能问题' };
}

// ============= Mock数据生成 =============
const TENANT_MAP = [
  { id: 'T001', name: '字节跳动', scale: 'A5' },
  { id: 'T002', name: '阿里巴巴', scale: 'A5' },
  { id: 'T003', name: '腾讯', scale: 'A4' },
  { id: 'T004', name: '美团', scale: 'A4' },
  { id: 'T005', name: '京东', scale: 'A4' },
  { id: 'T006', name: '小米', scale: 'A3' },
  { id: 'T007', name: '华为', scale: 'A3' },
  { id: 'T008', name: 'OPPO', scale: 'A3' },
  { id: 'T009', name: 'vivo', scale: 'A3' },
  { id: 'T010', name: '联想', scale: 'A2' },
  { id: 'T011', name: '海尔', scale: 'A2' },
  { id: 'T012', name: '格力', scale: 'A2' },
  { id: 'T013', name: '比亚迪', scale: 'A1' },
  { id: 'T014', name: '蔚来', scale: 'A1' },
  { id: 'T015', name: '理想', scale: 'A1' },
];

const PLATFORMS = ['iOS', 'Android', 'Web', '小程序'];

const CONTENT_TEMPLATES = [
  // 打卡定位问题
  '极速打卡定位失败，已经尝试了5次都不行，位置偏了几百米，GPS信号弱',
  '极速打卡定位超时，室内无法定位，地下室打卡不了',
  '极速打卡总是定位失败，高铁和飞机上根本用不了',
  'WiFi定位不准，蓝牙打卡经常失败，基站定位也很诡异',
  '打卡记录显示时间不对，实际打卡时间是9:00记录显示8:55',
  '打卡记录位置不准确，实际在公司记录显示在家里',
  '打卡记录时长不对，明明工作8小时记录显示7小时',
  '打卡记录数量不对，实际打卡2次只显示1次',
  '打卡记录状态不对，明明正常打卡显示异常',
  '打卡记录备注丢失，明明写了"外出"却看不到',
  '打卡记录照片丢失，明明上传了公司门口照片',
  '打卡提醒不及时，上班打卡提醒晚了10分钟才收到',
  '打卡提醒太晚，下班打卡提醒下班后很久才来',
  '外出打卡提醒不及时，回来打卡提醒也有问题',
  // 功能问题
  '打卡按钮找不到，入口太深了',
  '打卡界面太复杂，操作步骤太多',
  '打卡照片上传失败，提示网络异常',
  '打卡备注填写失败，提示字数超限',
  '打卡WiFi连接失败，提示WiFi不可用',
  '打卡蓝牙连接失败，提示蓝牙不可用',
  '打卡GPS获取失败，提示GPS不可用',
  '打卡基站获取失败，提示基站不可用',
  '打卡IP获取失败，提示IP不可用',
  '打卡照片模糊，无法识别',
  '打卡备注乱码，无法识别',
  '打卡WiFi名称乱码，无法识别',
  // 审批流程
  '休假申请提交失败，提示网络异常',
  '休假审批太慢，已经等了3天还没审批完',
  '休假申请被驳回理由不清楚，不知道为什么',
  '休假申请修改失败，提示权限不足',
  '休假申请撤销失败，提示已审批',
  '休假记录查询失败，提示数据异常',
  '休假记录显示错误，实际休假5天显示3天',
  '休假额度查询失败，提示额度不足',
  '休假额度显示错误，实际有10天显示只有5天',
  '销假申请提交失败，提示网络异常',
  '销假申请审批慢，等了2天还没审批',
  '销假申请驳回理由不清楚',
  '销假申请修改失败，提示权限不足',
  '休假申请流程繁琐，需要填很多表',
  '审批流程不透明，完全不知道审批进度',
  '审批人找不到，不知道找谁审批',
  '审批时间不确定，不知道什么时候审批',
  '审批结果不及时，审批后很久才通知',
  '审批意见不清楚，完全看不懂写了什么',
  '审批历史看不到，不知道之前审批了啥',
  // 加班
  '加班申请提交失败，提示网络异常',
  '加班申请审批太慢，已经等了2天',
  '加班申请驳回理由不清楚',
  '加班申请修改失败，提示权限不足',
  '加班申请撤销失败，提示已审批',
  '加班记录查询失败，提示数据异常',
  '加班记录显示错误，实际5小时显示3小时',
  '加班时长计算错误，少算很多时间',
  '加班申请流程繁琐，需要填很多表',
  // 报表
  '日报生成失败，提示数据异常',
  '日报显示错误，实际数据是100显示80',
  '日报导出失败，提示导出异常',
  '日报导出乱码，打开全是乱码',
  '月报生成失败，提示数据异常',
  '月报显示错误，实际数据1000显示800',
  '月报导出失败，提示导出异常',
  '月报导出乱码，无法识别',
  '异常考勤统计生成失败，提示数据异常',
  '异常考勤统计显示错误，实际10条显示8条',
  // 系统稳定性
  '系统卡顿，打开页面需要10秒',
  '系统崩溃，提示系统异常然后闪退',
  '系统闪退，打开后立即闪退',
  '系统白屏，打开后显示白屏',
  '系统黑屏，打开后显示黑屏',
  '系统无响应，点击按钮没反应',
  '系统加载慢，加载页面需要10秒',
  '系统刷新慢，刷新页面需要10秒',
  '系统保存慢，保存数据需要10秒',
  '系统提交慢，提交数据需要10秒',
  '系统查询慢，查询数据需要10秒',
  '系统导出慢，导出数据需要10秒',
  '系统导入慢，导入数据需要10秒',
  '系统上传慢，上传数据需要10秒',
  '系统下载慢，下载数据需要10秒',
  '系统打印慢，打印数据需要10秒',
  '系统分享慢，分享数据需要10秒',
  '系统同步慢，同步数据需要10秒',
  '系统备份慢，备份数据需要10秒',
  '系统恢复慢，恢复数据需要10秒',
];

function generateMockData(count) {
  const items = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const template = CONTENT_TEMPLATES[i % CONTENT_TEMPLATES.length];
    const tenant = TENANT_MAP[Math.floor(Math.random() * TENANT_MAP.length)];
    const platform = PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
    const daysAgo = Math.floor(Math.random() * 90); // 最近90天
    const createTime = now - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 8 * 60 * 60 * 1000);

    const tags = autoTagByContent(template);

    // 根据问题严重性给分
    let score;
    if (template.includes('定位失败') || template.includes('崩溃') || template.includes('闪退')) {
      score = 1;
    } else if (template.includes('失败') || template.includes('错误') || template.includes('丢失')) {
      score = Math.random() < 0.6 ? 2 : 3;
    } else if (template.includes('慢') || template.includes('繁琐') || template.includes('不透明')) {
      score = Math.random() < 0.5 ? 3 : 4;
    } else {
      score = Math.floor(Math.random() * 5) + 1;
    }

    items.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantScale: tenant.scale,
      userId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      userName: `${tenant.name}用户${String(i + 1).padStart(3, '0')}`,
      createTime: createTime,
      module: tags.tag1,
      source: platform,
      score: score,
      content: template,
      tag1: tags.tag1,
      tag2: tags.tag2,
      tag3: tags.tag3,
      confidence: 0.9,
      status: '已审核',
      tagTime: createTime,
    });
  }

  return items;
}

// ============= 多维表格API =============
async function bitableApi(method, path, body) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `${FEISHU_API_BASE}/bitable/v1/apps/${BITABLE_TOKEN}${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`API Error [${method} ${path}]: ${data.msg} (code=${data.code})`);
  }
  return data.data;
}

async function listRecords(tableId, pageSize = 500) {
  return bitableApi('GET', `/tables/${tableId}/records?page_size=${pageSize}`);
}

async function batchCreateRecords(tableId, records) {
  if (records.length === 0) return [];

  const batchSize = 100;
  const results = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const data = await bitableApi('POST', `/tables/${tableId}/records/batch_create`, {
      records: batch.map(fields => ({ fields })),
    });
    results.push(...(data.records || []));
    console.log(`  ✓ 写入 ${batch.length} 条 (${i + batch.length}/${records.length})`);
  }

  return results;
}

async function batchDeleteRecords(tableId, recordIds) {
  if (recordIds.length === 0) return;

  const batchSize = 50;
  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    await bitableApi('POST', `/tables/${tableId}/records/batch_delete`, { records: batch });
  }
}

async function deleteAllRecords(tableId) {
  console.log(`  读取 ${tableId} 现有数据...`);
  try {
    const data = await listRecords(tableId, 500);
    const ids = (data.records || []).map(r => r.record_id);
    console.log(`  发现 ${ids.length} 条旧数据，正在删除...`);
    await batchDeleteRecords(tableId, ids);
    console.log(`  ✓ 删除完成`);
  } catch (e) {
    console.log(`  读取失败，跳过删除: ${e.message}`);
  }
}

// ============= 添加协作者 =============
async function addCollaborator(memberId, memberType, perm) {
  const token = await getTenantAccessToken();
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

// ============= 发送飞书消息 =============
async function sendTextMessage(chatId, text) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    }
  );
  return response.json();
}

async function sendInteractiveCard(chatId, card) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      }),
    }
  );
  return response.json();
}

// ============= 标签卡片 =============
function createTaggingCard(result, bitableUrl) {
  return {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      title: { tag: 'plain_text', content: `🏷️  AI自动打标完成 - ${new Date().toLocaleDateString('zh-CN')}` },
      template: 'blue',
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**打标完成**: 共处理 **${result.total}** 条反馈` } },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            `**Tag1分布**: \n` +
            Object.entries(result.tag1Stats)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([tag, count]) => `• ${tag}: ${count}条 (${Math.round((count / result.total) * 100)}%)`)
              .join('\n'),
        },
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📊 查看多维表格' },
            type: 'primary',
            url: bitableUrl,
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '📈 查看分析报告' },
            url: bitableUrl,
          },
        ],
      },
    ],
  };
}

// ============= Top问题分析卡片 =============
function createTopIssuesCard(result, bitableUrl) {
  const total = result.totalFeedbacks;
  const promoter = result.promoterCount;
  const passive = result.passiveCount;
  const detractor = result.detractorCount;
  const nps = total > 0 ? Math.round(((promoter - detractor) / total) * 100) : 0;

  const elements = [
    { tag: 'div', text: { tag: 'lark_md', content: `**📊 NPS分析报告 - ${result.periodName}**` } },
    {
      tag: 'column_set',
      flex_mode: 'none',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `📈 **总反馈**\n**${total}**` } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `🏆 **NPS得分**\n**${nps}**` } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `⭐ **平均分**\n**${result.avgScore}**` } }],
        },
      ],
    },
    {
      tag: 'column_set',
      flex_mode: 'none',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `😊 推荐者\n**${promoter}** (${Math.round((promoter / total) * 100)}%)` } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `😐 被动者\n**${passive}** (${Math.round((passive / total) * 100)}%)` } }],
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'center',
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: `😠 贬损者\n**${detractor}** (${Math.round((detractor / total) * 100)}%)` } }],
        },
      ],
    },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: `**🔥 TOP问题分析**` } },
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: result.topIssues.slice(0, 5).map((issue, idx) => {
          const desc = `${issue.tag1}${issue.tag2 ? ' - ' + issue.tag2 : ''}${issue.tag3 ? ' - ' + issue.tag3 : ''}`;
          return `${idx + 1}. **${desc}**: ${issue.count}条 (${Math.round((issue.count / total) * 100)}%)`;
        }).join('\n'),
      },
    },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '📊 查看多维表格' },
          type: 'primary',
          url: bitableUrl,
        },
      ],
    },
  ];

  return {
    config: { wide_screen_mode: true, enable_forward: true },
    header: {
      title: { tag: 'plain_text', content: `📊 NPS分析报告 - ${result.periodName}` },
      template: 'blue',
    },
    elements,
  };
}

// ============= 主逻辑 =============
async function main() {
  console.log('========================================');
  console.log('🚀 NPS Insight - 完整端到端集成测试');
  console.log('========================================');

  console.log('\n[1/6] 🔧 配置信息');
  console.log(`  BITABLE_TOKEN: ${BITABLE_TOKEN}`);
  console.log(`  反馈表: ${FEEDBACK_TABLE_ID}`);
  console.log(`  标签表: ${TAGS_TABLE_ID}`);
  console.log(`  租户表: ${TENANTS_TABLE_ID}`);
  console.log(`  分析表: ${ANALYSIS_TABLE_ID}`);
  console.log(`  通知群: ${NOTIFICATION_CHAT_ID}`);
  console.log(`  BITABLE_URL: ${BITABLE_URL}`);

  console.log('\n[2/6] 🗑️ 清空旧数据');
  await deleteAllRecords(FEEDBACK_TABLE_ID);
  await deleteAllRecords(TAGS_TABLE_ID);
  await deleteAllRecords(TENANTS_TABLE_ID);
  await deleteAllRecords(ANALYSIS_TABLE_ID);

  console.log('\n[3/6] 📥 生成并写入150条Mock反馈数据');
  const mockData = generateMockData(150);

  const feedbackRecords = mockData.map(f => ({
    '反馈ID': f.feedbackId,
    '租户ID': f.tenantId,
    '租户名称': f.tenantName,
    '租户规模': f.tenantScale,
    '用户ID': f.userId,
    '用户名称': f.userName,
    '创建时间': f.createTime,
    '模块': f.module,
    '反馈内容': f.content,
    '评分': f.score,
    '来源': f.source,
    'Tag1': f.tag1,
    'Tag2': f.tag2,
    'Tag3': f.tag3,
    '置信度': f.confidence,
    '审核状态': f.status,
    '打标时间': f.tagTime,
  }));

  await batchCreateRecords(FEEDBACK_TABLE_ID, feedbackRecords);
  console.log(`  ✓ 共写入 ${mockData.length} 条反馈`);

  console.log('\n[4/6] 🏷️  写入标签和租户数据');
  // 标签统计
  const tagStats = {};
  mockData.forEach(f => {
    const key = `${f.tag1}|${f.tag2}|${f.tag3}`;
    if (!tagStats[key]) {
      tagStats[key] = { tag1: f.tag1, tag2: f.tag2, tag3: f.tag3, count: 0 };
    }
    tagStats[key].count++;
  });

  const tagRecords = Object.entries(tagStats).map(([key, t], idx) => ({
    'tagId': `tag_${String(idx + 1).padStart(3, '0')}`,
    'Tag1名称': t.tag1,
    'Tag2名称': t.tag2,
    'Tag3名称': t.tag3,
    '使用次数': t.count,
    '定义': `${t.tag1} - ${t.tag2} - ${t.tag3}`,
    '状态': 'active',
    '创建人': 'system',
    '创建时间': Date.now(),
  }));

  await batchCreateRecords(TAGS_TABLE_ID, tagRecords);
  console.log(`  ✓ 写入 ${tagRecords.length} 条标签`);

  // 租户
  const tenantRecords = TENANT_MAP.map((t, idx) => ({
    '租户ID': t.id,
    '租户名称': t.name,
    '规模': t.scale,
    '联系人': `联系人${idx + 1}`,
    '联系邮箱': `${t.id}@example.com`,
    '日志平台': 'platform',
    '日志端点': '/api/log',
    '日志凭证': 'credential',
    '创建时间': Date.now(),
  }));

  await batchCreateRecords(TENANTS_TABLE_ID, tenantRecords);
  console.log(`  ✓ 写入 ${tenantRecords.length} 条租户`);

  console.log('\n[5/6] 📊 生成Top问题分析报告');

  // 计算统计
  let promoterCount = 0, passiveCount = 0, detractorCount = 0;
  let totalScore = 0;
  mockData.forEach(f => {
    totalScore += f.score;
    if (f.score >= 4) promoterCount++;
    else if (f.score === 3) passiveCount++;
    else detractorCount++;
  });

  // Top问题按 tag1+tag2+tag3 聚合
  const issueMap = {};
  mockData.forEach(f => {
    const key = `${f.tag1}|${f.tag2}|${f.tag3}`;
    if (!issueMap[key]) {
      issueMap[key] = { tag1: f.tag1, tag2: f.tag2, tag3: f.tag3, count: 0 };
    }
    issueMap[key].count++;
  });

  const topIssues = Object.values(issueMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Tag1 分布统计
  const tag1Stats = {};
  mockData.forEach(f => {
    tag1Stats[f.tag1] = (tag1Stats[f.tag1] || 0) + 1;
  });

  const avgScore = mockData.length > 0 ? (totalScore / mockData.length).toFixed(2) : '0';

  // 写入分析表
  const analysisRecords = topIssues.slice(0, 10).map((issue, idx) => ({
    '问题标识': `issue_${String(idx + 1).padStart(3, '0')}`,
    'Tag1': issue.tag1,
    'Tag2': issue.tag2,
    'Tag3': issue.tag3,
    '累计数量': issue.count,
    '大租户数': Math.floor(issue.count * 0.3),
    '大租户占比': 0.3,
    '平均分': parseFloat(avgScore),
    '综合评分': issue.count * 0.7,
    '本月新增': issue.count,
    '状态': '待讨论',
  }));

  await batchCreateRecords(ANALYSIS_TABLE_ID, analysisRecords);
  console.log(`  ✓ 写入 ${analysisRecords.length} 条 Top问题分析`);

  console.log('\n[6/6] 📨 发送飞书Bot消息');

  // 消息1: 打标完成（批次1）
  console.log('  → 发送打标完成消息1/2...');
  const tagResult1 = {
    total: Math.floor(mockData.length / 2),
    tag1Stats: Object.fromEntries(Object.entries(tag1Stats).map(([k, v]) => [k, Math.floor(v / 2)])),
  };
  const card1 = createTaggingCard(tagResult1, BITABLE_URL);
  const msg1 = await sendInteractiveCard(NOTIFICATION_CHAT_ID, card1);
  if (msg1.code === 0) {
    console.log(`    ✓ 消息1发送成功 (message_id: ${msg1.data?.message_id?.substring(0, 16)}...)`);
  } else {
    console.log(`    ✗ 消息1发送失败: ${msg1.msg}`);
  }

  // 等1秒避免限流
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 消息2: 打标完成（批次2）
  console.log('  → 发送打标完成消息2/2...');
  const tagResult2 = {
    total: mockData.length - Math.floor(mockData.length / 2),
    tag1Stats: Object.fromEntries(Object.entries(tag1Stats).map(([k, v]) => [k, v - Math.floor(v / 2)])),
  };
  const card2 = createTaggingCard(tagResult2, BITABLE_URL);
  const msg2 = await sendInteractiveCard(NOTIFICATION_CHAT_ID, card2);
  if (msg2.code === 0) {
    console.log(`    ✓ 消息2发送成功 (message_id: ${msg2.data?.message_id?.substring(0, 16)}...)`);
  } else {
    console.log(`    ✗ 消息2发送失败: ${msg2.msg}`);
  }

  await new Promise(resolve => setTimeout(resolve, 1500));

  // 消息3: Top问题分析完成
  console.log('  → 发送Top问题分析消息3/3...');
  const analysisCard = createTopIssuesCard({
    periodName: '最近30天',
    totalFeedbacks: mockData.length,
    promoterCount,
    passiveCount,
    detractorCount,
    avgScore,
    topIssues,
  }, BITABLE_URL);

  const msg3 = await sendInteractiveCard(NOTIFICATION_CHAT_ID, analysisCard);
  if (msg3.code === 0) {
    console.log(`    ✓ 消息3发送成功 (message_id: ${msg3.data?.message_id?.substring(0, 16)}...)`);
  } else {
    console.log(`    ✗ 消息3发送失败: ${msg3.msg}`);
  }

  console.log('\n[额外] 👤 设置多维表格协作者权限');
  console.log(`  管理员 UserID: ${BITABLE_ADMIN_USER_ID}`);
  const colabResult = await addCollaborator(BITABLE_ADMIN_USER_ID, 'userid', 'full_access');
  console.log(`  协作者添加结果: ${JSON.stringify(colabResult).substring(0, 200)}`);

  // 也尝试把通知群加为协作者
  const chatColabResult = await addCollaborator(NOTIFICATION_CHAT_ID, 'openchat', 'edit');
  console.log(`  通知群协作者结果: ${JSON.stringify(chatColabResult).substring(0, 200)}`);

  console.log('\n========================================');
  console.log('✅ 所有步骤执行完成！');
  console.log('========================================');
  console.log(`\n📊 统计摘要：`);
  console.log(`  • 反馈总数: ${mockData.length}`);
  console.log(`  • 标签总数: ${tagRecords.length}`);
  console.log(`  • 租户总数: ${tenantRecords.length}`);
  console.log(`  • Top问题数: ${topIssues.length}`);
  console.log(`  • NPS: ${Math.round(((promoterCount - detractorCount) / mockData.length) * 100)}`);
  console.log(`  • 平均分: ${avgScore}`);
  console.log(`\n🔗 多维表格: ${BITABLE_URL}`);
  console.log(`\n📨 已发送3条消息到飞书群`);
  console.log('========================================');

  // 保存BITABLE_URL到.env文件
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  let newEnvContent = envContent;

  if (!envContent.includes('BITABLE_URL=')) {
    newEnvContent += `\nBITABLE_URL=${BITABLE_URL}\n`;
    writeFileSync(envPath, newEnvContent);
    console.log(`\n💾 已写入 BITABLE_URL 到 .env 文件`);
  } else {
    // 更新已有的BITABLE_URL
    newEnvContent = newEnvContent.replace(/BITABLE_URL=.*/g, `BITABLE_URL=${BITABLE_URL}`);
    writeFileSync(envPath, newEnvContent);
    console.log(`\n💾 已更新 .env 中的 BITABLE_URL`);
  }
}

main().catch(err => {
  console.error('\n❌ 执行失败:', err);
  process.exit(1);
});
