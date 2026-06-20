/** 配置中心 Tab 配置类型 */

export type ConfigTabKey = 'integration' | 'ai' | 'ops';

export type BitableMode = 'create' | 'link' | 'idle';
export type BitableStatus = 'unset' | 'created' | 'linked';
export type DataSourceTimeRule = 'lastWeek' | 'lastMonth' | 'custom';
export type ScheduleUnit = 'day' | 'week' | 'month';

export interface Tag1Item {
  name: string;
  definition: string;
  enabled: boolean;
}

export interface TabConfig {
  // 飞书与集成
  feishu: { appId: string; appSecret: string };
  bitable: {
    mode: BitableMode;
    appToken: string;
    url: string;
    status: BitableStatus;
  };
  dataSource: {
    apiUrl: string;
    apiKey: string;
    queryParams: string;
    timeRule: DataSourceTimeRule;
  };
  webhook: {
    url: string;
  };

  // AI 与标签
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    modelVersion: string;
  };
  tag1: Tag1Item[];
  tag2Init: string;
  tagging: {
    confidenceThreshold: number;
    largeTenantLevels: string[];
  };

  // 任务与运营
  schedule: {
    syncUnit: ScheduleUnit;
    syncEvery: number;
    syncTime: string;
    syncWeekDay: number;
    syncMonthDay: number;
    analysisUnit: ScheduleUnit;
    analysisEvery: number;
    analysisTime: string;
    analysisWeekDay: number;
    analysisMonthDay: number;
    syncCron?: string;
    analysisCron?: string;
  };
  logPlatform: {
    urlTemplate: string;
  };
  notification: {
    chatIds: string;
    adminUserIds: string;
  };
}

export interface AiProviderCache {
  apiKey: string;
  baseUrl: string;
  model: string;
  modelVersion: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

export interface PopularModelVersion {
  value: string;
  label: string;
}

export interface PopularModel {
  key: string;
  name: string;
  needsBaseUrl: boolean;
  needsModelName: boolean;
  placeholderToken: string;
  defaultVersion: string;
  versions: PopularModelVersion[];
}

export interface ConfigTabMeta {
  key: ConfigTabKey;
  name: string;
  desc: string;
}
