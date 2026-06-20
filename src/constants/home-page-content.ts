/** 首页文案与静态内容常量 */

export const TECH_STACK_ITEMS = [
  'Next.js 14',
  'TypeScript',
  'Tailwind CSS',
  'AgnesAI',
  '飞书SDK',
  'Vercel',
] as const;

export interface HomeRoleItem {
  role: string;
  frequency: string;
  duties: string;
  icon: string;
}

export const HOME_ROLE_ITEMS: HomeRoleItem[] = [
  {
    role: '产品经理 / 运营',
    frequency: '每日',
    duties: '查看仪表盘，参加月度 Top 问题会议，推进需求落地',
    icon: '📊',
  },
  {
    role: 'CSM / 技术支持',
    frequency: '每周',
    duties: '查看大租户反馈，对用户进行产品使用指导',
    icon: '🎧',
  },
  {
    role: '研发',
    frequency: '每周 2-3 次',
    duties: '查看「疑似Bug」和「性能问题」，按 Top 问题优先级处理',
    icon: '💻',
  },
  {
    role: '管理员',
    frequency: '按需',
    duties: '配置数据源、维护标签库、设置任务周期、管理 Tag1',
    icon: '⚙️',
  },
];
