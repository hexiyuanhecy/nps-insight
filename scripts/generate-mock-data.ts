/**
 * 生成150条Mock反馈数据
 * 分布策略：
 * - 打卡模块：60条（40%）- TOP问题集中
 * - 休假模块：25条（16.7%）
 * - 审批模块：20条（13.3%）
 * - 加班模块：15条（10%）
 * - 统计报表：10条（6.7%）
 * - 其他模块：20条（13.3%）
 */

import { writeFileSync } from 'fs';

interface MockFeedback {
  feedbackId: string;
  tenantId: string;
  larkUserId: string;
  createTime: string;
  module: string;
  source: string;
  score: number;
  dissatisfactionReason: string;
  content: string;
}

const TENANTS = [
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

const DISSATISFACTION_REASONS = [
  '系统卡顿', '功能缺失', '界面不友好', '操作复杂', '定位不准',
  '数据错误', '提醒不及时', '流程繁琐', '权限问题', '网络问题',
];

// TOP问题集中
const CHECKIN_ISSUES = [
  // TOP 1: 极速打卡-定位失败（15条）
  '极速打卡定位一直转圈，等了很久提示失败',
  '极速打卡定位失败，提示"无法获取位置信息"',
  '极速打卡定位超时，已经尝试了5次都失败',
  '极速打卡定位不准确，打卡位置偏了500米',
  '极速打卡定位失败，GPS信号弱',
  '极速打卡定位失败，室内无法定位',
  '极速打卡定位失败，地下室打卡不了',
  '极速打卡定位失败，高铁上打卡不了',
  '极速打卡定位失败，飞机上打卡不了',
  '极速打卡定位失败，偏远地区打卡不了',
  '极速打卡定位失败，国外打卡不了',
  '极速打卡定位失败，跨时区打卡不了',
  '极速打卡定位失败，WiFi定位不准',
  '极速打卡定位失败，蓝牙打卡失败',
  '极速打卡定位失败，基站定位不准',
  // TOP 2: 打卡记录-记录不准（12条）
  '打卡记录显示的时间不对，实际打卡时间是9:00，记录显示8:55',
  '打卡记录显示的位置不对，实际打卡位置是公司，记录显示家',
  '打卡记录显示的时长不对，实际工作8小时，记录显示7小时',
  '打卡记录显示的次数不对，实际打卡2次，记录显示1次',
  '打卡记录显示的状态不对，实际是正常打卡，记录显示异常',
  '打卡记录显示的备注不对，实际备注是"外出"，记录显示空',
  '打卡记录显示的照片不对，实际照片是公司门口，记录显示家',
  '打卡记录显示的WiFi不对，实际WiFi是公司WiFi，记录显示家WiFi',
  '打卡记录显示的蓝牙不对，实际蓝牙是公司蓝牙，记录显示家蓝牙',
  '打卡记录显示的基站不对，实际基站是公司基站，记录显示家基站',
  '打卡记录显示的GPS不对，实际GPS是公司GPS，记录显示家GPS',
  '打卡记录显示的IP不对，实际IP是公司IP，记录显示家IP',
  // TOP 3: 打卡提醒-提醒不及时（10条）
  '打卡提醒不及时，上班打卡提醒在上班后10分钟才收到',
  '打卡提醒不及时，下班打卡提醒在下班后10分钟才收到',
  '打卡提醒不及时，外出打卡提醒在外出后10分钟才收到',
  '打卡提醒不及时，返回打卡提醒在返回后10分钟才收到',
  '打卡提醒不及时，加班打卡提醒在加班后10分钟才收到',
  '打卡提醒不及时，请假打卡提醒在请假后10分钟才收到',
  '打卡提醒不及时，出差打卡提醒在出差后10分钟才收到',
  '打卡提醒不及时，会议打卡提醒在会议后10分钟才收到',
  '打卡提醒不及时，培训打卡提醒在培训后10分钟才收到',
  '打卡提醒不及时，活动打卡提醒在活动后10分钟才收到',
  // 其他打卡问题（23条）
  '打卡按钮找不到，入口太深',
  '打卡界面太复杂，操作步骤太多',
  '打卡照片上传失败，提示"网络异常"',
  '打卡备注填写失败，提示"字数超限"',
  '打卡WiFi连接失败，提示"WiFi不可用"',
  '打卡蓝牙连接失败，提示"蓝牙不可用"',
  '打卡GPS获取失败，提示"GPS不可用"',
  '打卡基站获取失败，提示"基站不可用"',
  '打卡IP获取失败，提示"IP不可用"',
  '打卡照片模糊，无法识别',
  '打卡备注乱码，无法识别',
  '打卡WiFi名称乱码，无法识别',
  '打卡蓝牙名称乱码，无法识别',
  '打卡GPS坐标乱码，无法识别',
  '打卡基站编号乱码，无法识别',
  '打卡IP地址乱码，无法识别',
  '打卡照片丢失，无法查看',
  '打卡备注丢失，无法查看',
  '打卡WiFi丢失，无法查看',
  '打卡蓝牙丢失，无法查看',
  '打卡GPS丢失，无法查看',
  '打卡基站丢失，无法查看',
  '打卡IP丢失，无法查看',
];

const LEAVE_ISSUES = [
  '休假申请提交失败，提示"网络异常"',
  '休假申请审批慢，已经等了3天还没审批',
  '休假申请驳回理由不清楚，不知道为什么驳回',
  '休假申请修改失败，提示"权限不足"',
  '休假申请撤销失败，提示"已审批"',
  '休假记录查询失败，提示"数据异常"',
  '休假记录显示错误，实际休假5天，记录显示3天',
  '休假额度查询失败，提示"额度不足"',
  '休假额度显示错误，实际额度10天，显示5天',
  '销假申请提交失败，提示"网络异常"',
  '销假申请审批慢，已经等了2天还没审批',
  '销假申请驳回理由不清楚，不知道为什么驳回',
  '销假申请修改失败，提示"权限不足"',
  '销假申请撤销失败，提示"已审批"',
  '销假记录查询失败，提示"数据异常"',
  '销假记录显示错误，实际销假2天，记录显示1天',
  '休假申请流程繁琐，需要填很多表',
  '休假申请审批流程不透明，不知道审批进度',
  '休假申请审批人找不到，不知道找谁审批',
  '休假申请审批时间不确定，不知道什么时候审批',
  '休假申请审批结果不及时，审批后很久才通知',
  '休假申请审批意见不清楚，不知道审批意见',
  '休假申请审批历史看不到，不知道审批历史',
  '休假申请审批记录丢失，无法查看审批记录',
  '休假申请审批备注丢失，无法查看审批备注',
];

const APPROVAL_ISSUES = [
  '审批流程启动失败，提示"网络异常"',
  '审批流程卡住不动，已经等了5天还没审批',
  '审批流程驳回理由不清楚，不知道为什么驳回',
  '审批流程修改失败，提示"权限不足"',
  '审批流程撤销失败，提示"已审批"',
  '审批记录查询失败，提示"数据异常"',
  '审批记录显示错误，实际审批3次，记录显示1次',
  '审批历史查询失败，提示"历史数据异常"',
  '审批历史显示错误，实际审批历史有5条，显示3条',
  '审批备注填写失败，提示"字数超限"',
  '审批备注显示乱码，无法识别',
  '审批备注丢失，无法查看',
  '审批附件上传失败，提示"附件过大"',
  '审批附件下载失败，提示"附件不存在"',
  '审批附件显示乱码，无法识别',
  '审批附件丢失，无法查看',
  '审批流程繁琐，需要审批很多次',
  '审批流程不透明，不知道审批进度',
  '审批人找不到，不知道找谁审批',
  '审批时间不确定，不知道什么时候审批',
];

const OVERTIME_ISSUES = [
  '加班申请提交失败，提示"网络异常"',
  '加班申请审批慢，已经等了2天还没审批',
  '加班申请驳回理由不清楚，不知道为什么驳回',
  '加班申请修改失败，提示"权限不足"',
  '加班申请撤销失败，提示"已审批"',
  '加班记录查询失败，提示"数据异常"',
  '加班记录显示错误，实际加班5小时，记录显示3小时',
  '加班时长计算错误，实际加班5小时，计算显示3小时',
  '加班申请流程繁琐，需要填很多表',
  '加班申请审批流程不透明，不知道审批进度',
  '加班申请审批人找不到，不知道找谁审批',
  '加班申请审批时间不确定，不知道什么时候审批',
  '加班申请审批结果不及时，审批后很久才通知',
  '加班申请审批意见不清楚，不知道审批意见',
  '加班申请审批历史看不到，不知道审批历史',
];

const REPORT_ISSUES = [
  '日报生成失败，提示"数据异常"',
  '日报显示错误，实际数据是100，显示80',
  '日报导出失败，提示"导出异常"',
  '日报导出乱码，无法识别',
  '月报生成失败，提示"数据异常"',
  '月报显示错误，实际数据是1000，显示800',
  '月报导出失败，提示"导出异常"',
  '月报导出乱码，无法识别',
  '异常考勤统计生成失败，提示"数据异常"',
  '异常考勤统计显示错误，实际异常10条，显示8条',
];

const OTHER_ISSUES = [
  '系统卡顿，打开页面需要10秒',
  '系统崩溃，提示"系统异常"',
  '系统闪退，打开后立即闪退',
  '系统白屏，打开后显示白屏',
  '系统黑屏，打开后显示黑屏',
  '系统无响应，点击按钮无反应',
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

function generateContent(issues: string[]): string {
  const randomIssue = issues[Math.floor(Math.random() * issues.length)];
  const supplements = [
    '，已经反馈给客服，但还没解决',
    '，希望能尽快修复',
    '，严重影响工作效率',
    '，已经尝试了多种方法都解决不了',
    '，希望能增加相关功能',
    '，希望能优化界面',
    '，希望能简化流程',
    '，希望能提高性能',
    '，希望能加强稳定性',
    '，希望能增加提示信息',
  ];
  const randomSupplement = supplements[Math.floor(Math.random() * supplements.length)];
  return `${randomIssue}${randomSupplement}`;
}

function generateScore(content: string): number {
  if (content.includes('定位失败') || content.includes('记录不准') || content.includes('提醒不及时')) {
    return Math.random() < 0.7 ? 1 : 2;
  }
  if (content.includes('失败') || content.includes('错误') || content.includes('丢失')) {
    return Math.random() < 0.6 ? 2 : 3;
  }
  if (content.includes('慢') || content.includes('繁琐') || content.includes('不透明')) {
    return Math.random() < 0.5 ? 3 : 4;
  }
  return Math.floor(Math.random() * 5) + 1;
}

function generateCreateTime(): string {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const randomTime = new Date(threeMonthsAgo.getTime() + Math.random() * (now.getTime() - threeMonthsAgo.getTime()));
  return randomTime.toISOString();
}

function generateMockData(): MockFeedback[] {
  const feedbacks: MockFeedback[] = [];

  // 打卡模块：60条
  for (let i = 0; i < 60; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '打卡小程序',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(CHECKIN_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(CHECKIN_ISSUES),
    });
  }

  // 休假模块：25条
  for (let i = 60; i < 85; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '休假',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(LEAVE_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(LEAVE_ISSUES),
    });
  }

  // 审批模块：20条
  for (let i = 85; i < 105; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '审批',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(APPROVAL_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(APPROVAL_ISSUES),
    });
  }

  // 加班模块：15条
  for (let i = 105; i < 120; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '加班',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(OVERTIME_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(OVERTIME_ISSUES),
    });
  }

  // 统计报表模块：10条
  for (let i = 120; i < 130; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '统计报表',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(REPORT_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(REPORT_ISSUES),
    });
  }

  // 其他模块：20条
  for (let i = 130; i < 150; i++) {
    const tenant = TENANTS[Math.floor(Math.random() * TENANTS.length)];
    feedbacks.push({
      feedbackId: `fb_${String(i + 1).padStart(3, '0')}`,
      tenantId: tenant.id,
      larkUserId: `u_${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
      createTime: generateCreateTime(),
      module: '其他',
      source: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      score: generateScore(generateContent(OTHER_ISSUES)),
      dissatisfactionReason: DISSATISFACTION_REASONS[Math.floor(Math.random() * DISSATISFACTION_REASONS.length)],
      content: generateContent(OTHER_ISSUES),
    });
  }

  return feedbacks;
}

// 生成数据
const mockData = generateMockData();
writeFileSync('mock-feedbacks-150.json', JSON.stringify(mockData, null, 2));
console.log('✅ 已生成150条Mock数据');

// 统计TOP问题
const topIssues = mockData.reduce((acc, f) => {
  const key = f.content.split('，')[0];
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

const sortedTopIssues = Object.entries(topIssues)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log('\n📊 TOP 10 问题分布：');
sortedTopIssues.forEach(([issue, count], i) => {
  console.log(`${i + 1}. ${issue} (${count}条)`);
});

// 统计大租户反馈
const largeTenantFeedbacks = mockData.filter(f =>
  ['A4', 'A5'].includes(TENANTS.find(t => t.id === f.tenantId)?.scale || '')
);

console.log(`\n🏢 大租户反馈：${largeTenantFeedbacks.length}条 (${((largeTenantFeedbacks.length / 150) * 100).toFixed(1)}%)`);
