/**
 * Mock Feelgood 数据 API
 * GET /api/mock/feedbacks
 * 返回 200 条模拟反馈数据
 */

import { NextRequest, NextResponse } from 'next/server';

// 模拟数据生成器
const MODULES = ['极速打卡', '正常打卡', '补卡', '外勤打卡', '休假申请', '审批流程', '抄送人选择', '工资条', '考勤统计', '假期余额'];
const SOURCES = ['小程序-打卡', '小程序-统计', 'PC端', 'APP'];
const TENANT_NAMES = ['字节跳动', '美团', '滴滴', '京东', '网易', '小米', '携程', '哔哩哔哩', '知乎', '小红书'];

// 各类反馈内容模板
const FEEDBACK_TEMPLATES = [
  // 疑似Bug
  { tag1: '疑似Bug', contents: ['打卡定位失败，一直显示定位中', '点击打卡按钮没反应', '考勤数据丢失，昨天打卡记录不见了', '补卡申请提交后页面报错', '审批流程卡住，无法继续', '工资条显示乱码', '假期余额计算错误'] },
  // 功能优化
  { tag1: '功能优化', contents: ['希望支持批量打卡', '建议增加导出考勤报表功能', '希望能自定义审批模板', '建议增加一键补卡功能', '希望支持多地点打卡', '建议增加打卡提醒功能', '希望能设置弹性工作时间'] },
  // 界面改进
  { tag1: '界面改进', contents: ['打卡页面按钮太小，容易误触', '审批页面排版太乱', '工资条页面颜色不统一', '休假申请流程太长，步骤太多', '统计页面图表不清晰', '移动端页面适配有问题', '深色模式下文字看不清'] },
  // 性能提升
  { tag1: '性能提升', contents: ['打卡页面加载太慢，要等5秒', '打开统计页面卡顿严重', 'APP耗电太快', '审批列表滑动卡顿', '工资条页面打开速度慢', '假期余额查询响应慢', '多人同时打卡时系统卡死'] },
  // 用户教育
  { tag1: '用户教育', contents: ['不知道怎么申请补卡', '找不到休假申请入口', '不清楚如何设置审批人', '不知道怎么看工资条', '不了解打卡规则', '不会使用外勤打卡功能', '不清楚假期余额怎么算'] },
  // 安全
  { tag1: '安全', contents: ['打卡位置可以伪造', '审批权限设置不合理', '工资条信息泄露风险', '考勤数据访问权限过大', '用户隐私保护不足', '打卡记录被篡改', '敏感信息未加密'] },
  // 无效
  { tag1: '无效', contents: ['test', '测试数据', '111111', '无意义反馈', 'aaaaaaaa', '随便填的', '不知道说什么'] },
];

function generateMockData(count: number = 200) {
  const data = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const templateGroup = FEEDBACK_TEMPLATES[Math.floor(Math.random() * FEEDBACK_TEMPLATES.length)];
    const content = templateGroup.contents[Math.floor(Math.random() * templateGroup.contents.length)];
    const moduleName = MODULES[Math.floor(Math.random() * MODULES.length)];
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const tenantName = TENANT_NAMES[Math.floor(Math.random() * TENANT_NAMES.length)];
    
    // 生成随机时间（最近30天内）
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const createTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);
    
    // 评分分布：1-2分占60%，3分占20%，4-5分占20%
    const scoreRandom = Math.random();
    let score: number;
    if (scoreRandom < 0.4) score = 1;
    else if (scoreRandom < 0.6) score = 2;
    else if (scoreRandom < 0.8) score = 3;
    else if (scoreRandom < 0.9) score = 4;
    else score = 5;

    data.push({
      id: `FB${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(i + 1).padStart(4, '0')}`,
      content,
      score,
      create_time: createTime.toISOString(),
      module: moduleName,
      source,
      tenant_id: `TENANT${Math.floor(Math.random() * 10000)}`,
      tenant_name: tenantName,
      tenant_scale: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'][Math.floor(Math.random() * 6)],
      user_id: `USER${Math.floor(Math.random() * 100000)}`,
    });
  }

  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 生成数据
    const allData = generateMockData(200);

    // 按时间范围过滤
    let filteredData = allData;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filteredData = allData.filter(item => {
        const itemDate = new Date(item.create_time);
        return itemDate >= start && itemDate <= end;
      });
    }

    // 分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    return NextResponse.json({
      code: 0,
      data: {
        list: paginatedData,
        total: filteredData.length,
        page,
        pageSize,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { code: -1, msg: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
