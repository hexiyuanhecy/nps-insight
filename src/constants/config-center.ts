import type { PopularModel, TabConfig } from '@/components/admin/config-center/types';

export const DEFAULT_TAG1: TabConfig['tag1'] = [
  { name: '疑似Bug', definition: '功能异常、报错、崩溃、无法使用', enabled: true },
  { name: '功能优化', definition: '功能改进建议、新功能诉求', enabled: true },
  { name: '界面改进', definition: 'UI 问题、交互体验优化', enabled: true },
  { name: '性能提升', definition: '加载慢、卡顿、响应延迟、耗电', enabled: true },
  { name: '用户教育', definition: '不知道如何使用、使用指引不清', enabled: true },
  { name: '安全合规', definition: '安全漏洞、隐私问题、合规要求', enabled: true },
  { name: '无效反馈', definition: 'SPAM、广告、乱码、无法理解的内容', enabled: true },
];

export const DEFAULT_TAG2_PRESET = `极速打卡
休假申请
加班审批
移动审批
工资条
公告
报表
通讯录
系统异常
登录注册
数据同步
权限管理`;

/** 热门模型定义 */
export const POPULAR_MODELS: PopularModel[] = [
  {
    key: 'agnesai',
    name: 'AgnesAI',
    needsBaseUrl: false,
    needsModelName: false,
    placeholderToken: 'AgnesAI API Key（当前用的是你自己的，请妥善保管）',
    defaultVersion: 'agnes-2.0-flash',
    versions: [
      { value: 'agnes-2.0-flash', label: 'agnes-2.0-flash（推荐，快速）' },
      { value: 'agnes-2.0-pro', label: 'agnes-2.0-pro（深度思考）' },
    ],
  },
  {
    key: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: 'SiliconFlow API Key',
    defaultVersion: 'Qwen/Qwen2.5-7B-Instruct',
    versions: [
      { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen/Qwen2.5-7B-Instruct' },
      { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen/Qwen2.5-32B-Instruct' },
      { value: 'deepseek-ai/DeepSeek-V3', label: 'deepseek-ai/DeepSeek-V3' },
      { value: 'deepseek-ai/DeepSeek-R1', label: 'deepseek-ai/DeepSeek-R1' },
    ],
  },
  {
    key: 'dashscope',
    name: '阿里云百炼',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: 'DashScope API Key',
    defaultVersion: 'qwen-turbo',
    versions: [
      { value: 'qwen-turbo', label: 'qwen-turbo（快速）' },
      { value: 'qwen-plus', label: 'qwen-plus（均衡）' },
      { value: 'qwen-max', label: 'qwen-max（最强）' },
    ],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek 官方',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: 'DeepSeek API Key',
    defaultVersion: 'deepseek-chat',
    versions: [
      { value: 'deepseek-chat', label: 'deepseek-chat（通用对话）' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner（R1 推理）' },
    ],
  },
  {
    key: 'zhipu',
    name: '智谱 GLM',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: '智谱 API Key',
    defaultVersion: 'glm-4-flash',
    versions: [
      { value: 'glm-4-flash', label: 'glm-4-flash（快速）' },
      { value: 'glm-4', label: 'glm-4（通用）' },
      { value: 'glm-4-long', label: 'glm-4-long（长文本）' },
    ],
  },
  {
    key: 'openai',
    name: 'OpenAI（GPT）',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: 'OpenAI API Key',
    defaultVersion: 'gpt-4o-mini',
    versions: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    ],
  },
  {
    key: 'custom',
    name: '自定义模型（OpenAI 兼容）',
    needsBaseUrl: true,
    needsModelName: true,
    placeholderToken: '自定义 API Key',
    defaultVersion: 'custom-model',
    versions: [],
  },
];

export const WEEK_DAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

export const TENANT_LEVELS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] as const;

// Mock 反馈数据 API 地址
export const MOCK_FEEDBACK_URL = '/api/mock/feedbacks';

// Mock 日志平台链接模板（支持 {{userId}} / {{start}} / {{end}} 占位符）
export const MOCK_LOG_URL = '/log-viewer?userId={{userId}}&start={{start}}&end={{end}}';

export const CONFIG_TAB_META = [
  { key: 'feishu' as const, name: '飞书配置', desc: '飞书应用 / 通知群 / 多维表格 / 大租户' },
  { key: 'datasource' as const, name: '数据源', desc: '反馈来源 / API / Excel / 日志平台' },
  { key: 'tagging' as const, name: '打标与分析配置', desc: 'AI 模型 / 标签体系 / 置信度 / 定时任务' },
  { key: 'profile' as const, name: '用户画像', desc: '反馈特征签名 / AI 洞察 / 人工调整' },
];

export function createDefaultConfig(): TabConfig {
  return {
    feishu: { appId: '', appSecret: '' },
    bitable: { mode: 'idle', appToken: '', url: '', status: 'unset' },
    dataSource: { apiUrl: '', apiKey: '', queryParams: '', timeRule: 'lastWeek' },
    tenantSource: { apiUrl: '', apiKey: '', queryParams: '' },
    webhook: { url: '' },
    ai: { provider: 'agnesai', apiKey: '', baseUrl: '', model: 'agnes-2.0-flash', modelVersion: 'agnes-2.0-flash' },
    tag1: DEFAULT_TAG1,
    tag2Init: DEFAULT_TAG2_PRESET,
    tagging: { confidenceThreshold: 0.8, largeTenantLevels: ['A4', 'A5', 'A6'] },
    schedule: {
      syncUnit: 'week',
      syncEvery: 1,
      syncTime: '09:00',
      syncWeekDay: 1,
      syncMonthDay: 1,
      analysisUnit: 'month',
      analysisEvery: 1,
      analysisTime: '09:00',
      analysisWeekDay: 1,
      analysisMonthDay: 1,
      syncCron: '0 9 * * 1',
      analysisCron: '0 9 1 * *',
      devMode: false,
    },
    logPlatform: { urlTemplate: '' },
    notification: { chatIds: '', adminUserIds: '' },
  };
}
