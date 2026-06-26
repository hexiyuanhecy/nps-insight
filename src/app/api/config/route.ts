/**
 * 配置管理 API v3
 * GET  /api/config - 获取当前配置（从 .env 和配置存储填充）
 * POST /api/config - 更新配置 / 测试连接
 *
 * 配置分三大块：
 *   feishu + bitable + dataSource + webhook      （连接与集成）
 *   ai + tag1 + tag2Init + tagging                （AI 与标签）
 *   schedule + logPlatform + notification          （任务与运营）
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AdapterFactory } from '@/lib/data-sources/adapter-factory';
import { LLMProviderFactory } from '@/lib/llm/provider-factory';
import { bitableClient, initializeBitableConfig } from '@/lib/feishu/bitable';
import { TABLE_NAMES, FEEDBACK_FIELDS } from '@/lib/feishu/constants';
import { tagger } from '@/lib/ai/tagger';
import {
  addBitableAdminMembers,
  createNPSInsightBitable,
  extractAppToken,
  validateAndGetBitableInfo,
  checkRequiredFields,
  addMissingFields,
  initializeTag1Labels,
  saveTag1ToBitable,
} from '@/lib/feishu/bitable-setup';
import { notifyConfigChange } from '@/lib/notification/delay-notifier';
import { setConfig } from '@/lib/storage/kv-storage';

// ============================================
// 默认配置（当环境变量为空时使用）
// ============================================

const DEFAULT_TAG1 = [
  {
    name: '疑似Bug',
    definition: '功能异常、报错、崩溃、无法使用',
    enabled: true
  },
  { name: '功能优化', definition: '功能改进建议、新功能诉求', enabled: true },
  { name: '界面改进', definition: 'UI 问题、交互体验优化', enabled: true },
  {
    name: '性能提升',
    definition: '加载慢、卡顿、响应延迟、耗电',
    enabled: true
  },
  {
    name: '用户教育',
    definition: '不知道如何使用、使用指引不清',
    enabled: true
  },
  {
    name: '安全合规',
    definition: '安全漏洞、隐私问题、合规要求',
    enabled: true
  },
  {
    name: '无效反馈',
    definition: 'SPAM、广告、乱码、无法理解的内容',
    enabled: true
  }
]

// ============================================
// 构建完整的 V3 配置对象（从环境变量读取）
// ============================================

function buildV3Config(): any {
  // 1. 飞书基础集成
  const feishu = {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
  };

  // 2. 多维表格绑定
  const bitable = {
    mode: (process.env.BITABLE_MODE as 'create' | 'link') || 'link',
    appToken: process.env.BITABLE_TOKEN || '',
    url: process.env.BITABLE_URL || '',
    feedbackTableId:
      process.env.BITABLE_FEEDBACK_TABLE_ID ||
      process.env.BITABLE_TABLE_ID ||
      '',
    tagsTableId:
      process.env.BITABLE_TAGS_TABLE_ID ||
      process.env.BITABLE_TABLE_ID_TAGS ||
      '',
    tenantsTableId:
      process.env.BITABLE_TENANTS_TABLE_ID ||
      process.env.BITABLE_TABLE_ID_TENANTS ||
      '',
    analysisTableId:
      process.env.BITABLE_ANALYSIS_TABLE_ID ||
      process.env.BITABLE_TABLE_ID_ANALYSIS ||
      '',
    status: process.env.BITABLE_TOKEN ? 'linked' : 'unset'
  }

  // 3. 数据源
  const dataSource = {
    apiUrl: process.env.DATA_SOURCE_API_URL || '',
    apiKey: process.env.DATA_SOURCE_API_KEY || '',
    queryParams:
      process.env.DATA_SOURCE_QUERY_PARAMS ||
      '{ "start": "{{start_unix}}", "end": "{{end_unix}}" }',
    timeRule: (process.env.DATA_SOURCE_TIME_RULE as 'lastWeek' | 'lastMonth' | 'custom') || 'lastWeek',
  };

  // 4. Webhook
  const webhook = {
    url: '/api/webhook/feelgood',
  };

  // 5. AI 模型
  const ai = {
    provider: (process.env.AGNESAI_PROVIDER as 'agnesai' | 'custom') || 'agnesai',
    apiKey: process.env.AGNESAI_API_KEY || '',
    baseUrl: process.env.AGNESAI_BASE_URL || '',
    model: process.env.AGNESAI_MODEL || 'agnes-2.0-flash',
  };

  // 6. Tag1（默认或从环境变量 JSON 解析）
  let tag1 = DEFAULT_TAG1;
  if (process.env.CONFIG_TAG1) {
    try {
      const parsed = JSON.parse(process.env.CONFIG_TAG1);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tag1 = parsed;
      }
    } catch (_) {
      // 解析失败时使用默认
    }
  }

  // 7. Tag2 初始化预设
  const tag2Init = process.env.CONFIG_TAG2_INIT || '';

  // 8. 打标规则
  const tagging = {
    confidenceThreshold: parseFloat(process.env.CONFIG_CONFIDENCE || '0.8'),
    largeTenantLevels: (process.env.CONFIG_LARGE_TENANTS || 'A4,A5,A6')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  // Parse cron string into human-friendly schedule fields
  function parseCronToSchedule(cron: string) {
    const parts = cron.split(' ');
    const min = parseInt(parts[0], 10);
    const hr = parseInt(parts[1], 10);
    const dom = parts[2];
    const month = parts[3];
    const dow = parts[4];
    if (dow !== undefined && dow !== '*' && dom === '*') {
      // Weekly: "0 10 * * 1" → week, every=1, time=10:00, weekDay=1
      return { unit: 'week' as const, every: 1, time: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`, weekDay: parseInt(dow, 10) || 7, monthDay: 1 };
    }
    if (dom !== undefined && dom !== '*' && month === '*') {
      // Monthly: "0 10 1 * *" → month, every=1, time=10:00, monthDay=1
      return { unit: 'month' as const, every: 1, time: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`, weekDay: 1, monthDay: parseInt(dom, 10) || 1 };
    }
    if (dom === '*' && month === '*' && dow === '*') {
      // Daily: "0 10 * * *" → day, every=1, time=10:00
      return { unit: 'day' as const, every: 1, time: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`, weekDay: 1, monthDay: 1 };
    }
    return { unit: 'week' as const, every: 1, time: '10:00', weekDay: 1, monthDay: 1 };
  }

  // 9. 任务周期
  const syncParts = parseCronToSchedule(
    process.env.CRON_SYNC_SCHEDULE || '0 9 * * 1'
  )
  const analysisParts = parseCronToSchedule(
    process.env.CRON_ANALYSIS_SCHEDULE || '0 9 1 * *'
  )
  const schedule = {
    syncUnit: syncParts.unit,
    syncEvery: syncParts.every,
    syncTime: syncParts.time,
    syncWeekDay: syncParts.weekDay,
    syncMonthDay: syncParts.monthDay,
    analysisUnit: analysisParts.unit,
    analysisEvery: analysisParts.every,
    analysisTime: analysisParts.time,
    analysisWeekDay: analysisParts.weekDay,
    analysisMonthDay: analysisParts.monthDay,
    syncCron: process.env.CRON_SYNC_SCHEDULE || '0 9 * * 1',
    analysisCron: process.env.CRON_ANALYSIS_SCHEDULE || '0 9 1 * *',
    devMode: process.env.CRON_DEV_MODE === 'true'
  }

  // 10. 日志平台
  const logPlatform = {
    urlTemplate: process.env.LOG_PLATFORM_URL_TEMPLATE || '',
  };

  // 11. 通知
  const notification = {
    chatIds: process.env.NOTIFICATION_CHAT_ID || '',
    adminUserIds: process.env.NOTIFICATION_ADMIN_USER_IDS || '',
  };

  return {
    feishu,
    bitable,
    dataSource,
    webhook,
    ai,
    tag1,
    tag2Init,
    tagging,
    schedule,
    logPlatform,
    notification,
  };
}

// ============================================
// GET - 获取当前配置
// ============================================

export async function GET(request: NextRequest) {
  try {
    const config = buildV3Config();

    // 对敏感字段返回 ''（不在明文返回），前端通过 '已配置 / 未配置' 标识
    return NextResponse.json({
      success: true,
      data: {
        ...config,
        // 敏感字段以空字符串或标记返回
        feishu: { ...config.feishu, appSecret: config.feishu.appSecret ? '__SET__' : '' },
        dataSource: { ...config.dataSource, apiKey: config.dataSource.apiKey ? '__SET__' : '' },
        ai: { ...config.ai, apiKey: config.ai.apiKey ? '__SET__' : '' },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /config GET] 错误:', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'saveConfigV3':
        return saveConfigV3(body.config);

      case 'testFeishu':
        return testFeishu(body.config || body.feishu || {});

      case 'testAI':
        return testAI(body.config || body.ai || {});

      case 'testDataSource':
        return testDataSource(body.config || body.dataSource || {});

      case 'testNotify':
        return testNotify(body);

      case 'createBitable':
        return createBitableAction(body);

      case 'linkBitable':
        return linkBitableAction(body);

      case 'runManualSync':
        return runManualSyncAction(body.config);

      case 'retagHistory':
        return retagHistoryAction();

      case 'saveConfig':
        return saveConfigLegacy(body);

      case 'testLLM':
        return testLLMLegacy(body);

      default:
        return NextResponse.json(
          { success: false, error: '未知的操作类型: ' + action },
          { status: 400 }
        );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('[API /config POST] 错误:', error);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// V3 配置保存
// ============================================

async function saveConfigV3(config: any) {
  const changes: { section: string; key: string; value: string }[] = [];

  try {
    // 1. 飞书基础
    if (config.feishu) {
      if (config.feishu.appId) {
        notifyConfigChange('feishu', 'appId', config.feishu.appId);
        changes.push({ section: 'feishu', key: 'FEISHU_APP_ID', value: config.feishu.appId });
      }
      if (config.feishu.appSecret && config.feishu.appSecret !== '__SET__') {
        notifyConfigChange('feishu', 'appSecret', config.feishu.appSecret);
        changes.push({ section: 'feishu', key: 'FEISHU_APP_SECRET', value: '********' });
      }
    }

    // 2. 多维表格
    if (config.bitable) {
      if (config.bitable.appToken) {
        notifyConfigChange('bitable', 'appToken', config.bitable.appToken);
      }
      if (config.bitable.url) {
        notifyConfigChange('bitable', 'url', config.bitable.url);
      }
    }

    // 3. 数据源
    if (config.dataSource) {
      if (config.dataSource.apiUrl) {
        notifyConfigChange('dataSource', 'apiUrl', config.dataSource.apiUrl);
      }
      if (config.dataSource.apiKey && config.dataSource.apiKey !== '__SET__') {
        notifyConfigChange('dataSource', 'apiKey', config.dataSource.apiKey);
      }
      if (config.dataSource.queryParams) {
        notifyConfigChange('dataSource', 'queryParams', config.dataSource.queryParams);
      }
      if (config.dataSource.timeRule) {
        notifyConfigChange('dataSource', 'timeRule', config.dataSource.timeRule);
      }
    }

    // 4. AI
    if (config.ai) {
      notifyConfigChange('ai', 'provider', config.ai.provider || 'agnesai');
      if (config.ai.apiKey && config.ai.apiKey !== '__SET__') {
        notifyConfigChange('ai', 'apiKey', config.ai.apiKey);
      }
      if (config.ai.baseUrl) {
        notifyConfigChange('ai', 'baseUrl', config.ai.baseUrl);
      }
      if (config.ai.model) {
        notifyConfigChange('ai', 'model', config.ai.model);
      }
    }

    // 5. 标签 & 规则
    if (config.tag1) {
      notifyConfigChange('tagging', 'tag1', JSON.stringify(config.tag1));

      // 同步 Tag1 到多维表格
      const bitableAppToken = config.bitable?.appToken || process.env.BITABLE_TOKEN || '';
      const bitableTagsTableId = config.bitable?.tagsTableId || process.env.BITABLE_TAGS_TABLE_ID || '';
      if (bitableAppToken) {
        try {
          console.log('[Tag1同步] 开始同步 Tag1 到多维表格...');
          const syncResult = await saveTag1ToBitable(bitableAppToken, config.tag1, bitableTagsTableId || undefined);
          console.log(`[Tag1同步] 同步结果: 新增 ${syncResult.created}, 更新 ${syncResult.updated}, 删除 ${syncResult.deleted}`);
          if (syncResult.errors.length > 0) {
            console.warn('[Tag1同步] 部分同步失败:', syncResult.errors);
          }

          // Tag1 变更后，安排5分钟延时自动重打标
          // 如果用户想立即重打标，可以点击"立即重新打标历史数据"按钮（会取消这个延时任务）
          console.log('[Tag1同步] 安排5分钟延时自动重打标...');
          await scheduleDelayRetagTask();
        } catch (syncError) {
          console.error('[Tag1同步] 同步失败:', syncError instanceof Error ? syncError.message : '未知错误');
          // 同步失败不影响主流程，只记录日志
        }
      } else {
        console.log('[Tag1同步] 未配置多维表格，跳过同步');
      }
    }
    if (typeof config.tag2Init !== 'undefined') {
      notifyConfigChange('tagging', 'tag2Init', config.tag2Init || '');
    }
    if (config.tagging) {
      notifyConfigChange(
        'tagging',
        'confidenceThreshold',
        String(config.tagging.confidenceThreshold || 0.8)
      );
      notifyConfigChange(
        'tagging',
        'largeTenantLevels',
        (config.tagging.largeTenantLevels || ['A4', 'A5']).join(',')
      );
    }

    // 6. 任务 / 日志 / 通知
    if (config.schedule) {
      if (config.schedule.syncCron) notifyConfigChange('cron', 'syncCron', config.schedule.syncCron);
      if (config.schedule.analysisCron)
        notifyConfigChange('cron', 'analysisCron', config.schedule.analysisCron);
      if (config.schedule.devMode !== undefined)
        notifyConfigChange('cron', 'devMode', String(config.schedule.devMode));
    }
    if (config.logPlatform?.urlTemplate) {
      notifyConfigChange('logPlatform', 'urlTemplate', config.logPlatform.urlTemplate);
    }
    if (config.notification) {
      if (config.notification.chatIds)
        notifyConfigChange('notification', 'chatId', config.notification.chatIds);
      if (config.notification.adminUserIds)
        notifyConfigChange('notification', 'adminUserIds', config.notification.adminUserIds);
    }
  } catch (error) {
    console.error('[Config] 记录配置变更失败:', error);
  }

  // 生成建议的环境变量内容
  const envVars: Record<string, string> = {};
  if (config.feishu?.appId) envVars.FEISHU_APP_ID = config.feishu.appId;
  if (config.feishu?.appSecret && config.feishu.appSecret !== '__SET__')
    envVars.FEISHU_APP_SECRET = config.feishu.appSecret;

  if (config.bitable?.mode) envVars.BITABLE_MODE = config.bitable.mode;
  if (config.bitable?.appToken) envVars.BITABLE_TOKEN = config.bitable.appToken;
  if (config.bitable?.url) envVars.BITABLE_URL = config.bitable.url;
  if (config.bitable?.feedbackTableId)
    envVars.BITABLE_FEEDBACK_TABLE_ID = config.bitable.feedbackTableId;
  if (config.bitable?.tagsTableId) envVars.BITABLE_TAGS_TABLE_ID = config.bitable.tagsTableId;
  if (config.bitable?.tenantsTableId)
    envVars.BITABLE_TENANTS_TABLE_ID = config.bitable.tenantsTableId;
  if (config.bitable?.analysisTableId)
    envVars.BITABLE_ANALYSIS_TABLE_ID = config.bitable.analysisTableId;

  if (config.dataSource?.apiUrl) envVars.DATA_SOURCE_API_URL = config.dataSource.apiUrl;
  if (config.dataSource?.apiKey && config.dataSource.apiKey !== '__SET__')
    envVars.DATA_SOURCE_API_KEY = config.dataSource.apiKey;
  if (config.dataSource?.queryParams) envVars.DATA_SOURCE_QUERY_PARAMS = config.dataSource.queryParams;
  if (config.dataSource?.timeRule) envVars.DATA_SOURCE_TIME_RULE = config.dataSource.timeRule;

  if (config.ai?.provider) envVars.AGNESAI_PROVIDER = config.ai.provider;
  if (config.ai?.apiKey && config.ai.apiKey !== '__SET__') envVars.AGNESAI_API_KEY = config.ai.apiKey;
  if (config.ai?.baseUrl) envVars.AGNESAI_BASE_URL = config.ai.baseUrl;
  if (config.ai?.model) envVars.AGNESAI_MODEL = config.ai.model;

  if (config.tag1) envVars.CONFIG_TAG1 = JSON.stringify(config.tag1);
  if (typeof config.tag2Init !== 'undefined') envVars.CONFIG_TAG2_INIT = config.tag2Init || '';
  if (config.tagging?.confidenceThreshold)
    envVars.CONFIG_CONFIDENCE = String(config.tagging.confidenceThreshold);
  if (config.tagging?.largeTenantLevels)
    envVars.CONFIG_LARGE_TENANTS = (config.tagging.largeTenantLevels || []).join(',');

  if (config.schedule?.syncCron) envVars.CRON_SYNC_SCHEDULE = config.schedule.syncCron;
  if (config.schedule?.analysisCron) envVars.CRON_ANALYSIS_SCHEDULE = config.schedule.analysisCron;

  if (config.logPlatform?.urlTemplate) envVars.LOG_PLATFORM_URL_TEMPLATE = config.logPlatform.urlTemplate;

  if (config.notification?.chatIds) envVars.NOTIFICATION_CHAT_ID = config.notification.chatIds;
  if (config.notification?.adminUserIds) {
    if (!config.notification.adminUserIds.trim()) {
      return NextResponse.json(
        { success: false, error: '表格管理员（飞书用户 ID）为必填项' },
        { status: 400 }
      );
    }
    envVars.NOTIFICATION_ADMIN_USER_IDS = config.notification.adminUserIds;
  }

  if (config.schedule?.devMode !== undefined)
    envVars.CRON_DEV_MODE = String(config.schedule.devMode);

  // Write envVars to .env file on disk
  try {
    const envPath = path.join(process.cwd(), '.env');
    let existing = '';
    try {
      existing = fs.readFileSync(envPath, 'utf-8');
    } catch { /* file doesn't exist yet */ }

    const lines = existing.split('\n');
    const envKeys = new Set(Object.keys(envVars));
    const updatedLines: string[] = [];
    const newEntries: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        updatedLines.push(line);
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        if (envKeys.has(key)) {
          updatedLines.push(`${key}=${envVars[key]}`);
          envKeys.delete(key);
          continue;
        }
      }
      updatedLines.push(line);
    }

    // Append any new keys
    for (const key of Array.from(envKeys)) {
      newEntries.push(`${key}=${envVars[key]}`);
    }

    if (newEntries.length > 0) {
      updatedLines.push('');
      updatedLines.push(...newEntries);
    }

    fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf-8');
    console.log('[Config] .env file updated');
  } catch (error) {
    console.error('[Config] Failed to write .env:', error);
  }

  // 同步到 KV 存储
  try {
    const ownerId = process.env.DEFAULT_OWNER_ID || 'default_owner';
    // 从现有配置构建完整的 KV 配置对象
    const currentConfig = buildV3Config();
    const kvConfig = {
      ...currentConfig,
      // 合并传入的新配置
      feishu: config.feishu ? { ...currentConfig.feishu, ...config.feishu } : currentConfig.feishu,
      bitable: config.bitable ? { ...currentConfig.bitable, ...config.bitable } : currentConfig.bitable,
      dataSource: config.dataSource ? { ...currentConfig.dataSource, ...config.dataSource } : currentConfig.dataSource,
      ai: config.ai ? { ...currentConfig.ai, ...config.ai } : currentConfig.ai,
      tag1: config.tag1 || currentConfig.tag1,
      tag2Init: config.tag2Init !== undefined ? config.tag2Init : currentConfig.tag2Init,
      tagging: config.tagging ? { ...currentConfig.tagging, ...config.tagging } : currentConfig.tagging,
      schedule: config.schedule ? { ...currentConfig.schedule, ...config.schedule } : currentConfig.schedule,
      logPlatform: config.logPlatform ? { ...currentConfig.logPlatform, ...config.logPlatform } : currentConfig.logPlatform,
      notification: config.notification ? { ...currentConfig.notification, ...config.notification } : currentConfig.notification,
    };
    await setConfig(ownerId, kvConfig);
    console.log('[Config] 配置已同步到 KV storage');
  } catch (kvError) {
    console.error('[Config] KV 同步失败:', kvError);
    // KV 同步失败不影响主流程，只记录日志
  }

  // 已绑定表格时，异步调用飞书协作者API，不阻塞主线程
  const hasBitableToken = !!(process.env.BITABLE_TOKEN || config.bitable?.appToken);
  const adminUserIds = config.notification?.adminUserIds;
  if (hasBitableToken && adminUserIds && String(adminUserIds).trim()) {
    const appToken = config.bitable?.appToken || process.env.BITABLE_TOKEN || '';
    // fire-and-forget：异步添加协作者，不等待结果
    addBitableAdminMembers(appToken, adminUserIds).then((result) => {
      if (result.failCount > 0) {
        console.warn('[Config] 部分管理员添加失败:', result.errors);
      } else {
        console.log('[Config] 管理员协作者添加成功:', result.successCount);
      }
    }).catch((err) => {
      console.error('[Config] 添加管理员协作者异常:', err instanceof Error ? err.message : '未知错误');
    });
  }

  return NextResponse.json({
    success: true,
    message:
      changes.length > 0
        ? `配置已保存（${changes.length} 项变更），变更通知将在 2 分钟内发送`
        : '配置已保存',
    data: { changes, envVars },
  });
}

// ============================================
// 测试飞书应用
// ============================================

async function testFeishu(feishuConfig: any) {
  // 将 __SET__ 占位符视为未填写，回退到环境变量
  const appId =
    feishuConfig.appId && feishuConfig.appId !== '__SET__'
      ? feishuConfig.appId
      : process.env.FEISHU_APP_ID
  const appSecret =
    feishuConfig.appSecret && feishuConfig.appSecret !== '__SET__'
      ? feishuConfig.appSecret
      : process.env.FEISHU_APP_SECRET

  if (!appId || !appSecret) {
    return NextResponse.json(
      { success: false, error: '请先填写 App ID 和 App Secret' },
      { status: 400 }
    )
  }

  try {
    // 尝试获取 tenant_access_token
    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      }
    )
    const data = await res.json()
    if (data.code === 0 && data.tenant_access_token) {
      return NextResponse.json({
        success: true,
        message: '飞书应用连接正常（已获取 access_token）'
      })
    }
    return NextResponse.json(
      {
        success: false,
        error: '飞书返回错误: ' + (data.msg || data.error || '未知')
      },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: '网络异常: ' + (error instanceof Error ? error.message : '未知')
      },
      { status: 500 }
    )
  }
}

// ============================================
// 测试 AI 模型
// ============================================

async function testAI(aiConfig: any) {
  const provider = aiConfig.provider || 'agnesai';
  try {
    const mapped: any = {
      provider,
      apiKey: aiConfig.apiKey && aiConfig.apiKey !== '__SET__' ? aiConfig.apiKey : process.env.AGNESAI_API_KEY || '',
      baseUrl: aiConfig.baseUrl || process.env.AGNESAI_BASE_URL || '',
      model: aiConfig.model || process.env.AGNESAI_MODEL || 'agnes-2.0-flash',
    };
    const llm = LLMProviderFactory.create(mapped);
    const result = await llm.testConnection();
    return NextResponse.json({ success: result.success, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 测试数据源连接
// ============================================

async function testDataSource(dsConfig: any) {
  try {
    const mapped: any = {
      type: 'api',
      apiUrl: dsConfig.apiUrl || process.env.DATA_SOURCE_API_URL || '',
      apiKey:
        dsConfig.apiKey && dsConfig.apiKey !== '__SET__'
          ? dsConfig.apiKey
          : process.env.DATA_SOURCE_API_KEY || '',
      queryParams: dsConfig.queryParams || process.env.DATA_SOURCE_QUERY_PARAMS || '{}',
      timeRule: dsConfig.timeRule || 'lastWeek',
    };
    if (!mapped.apiUrl) {
      return NextResponse.json(
        { success: false, error: '请先填写数据源 API 地址' },
        { status: 400 }
      );
    }
    const adapter = AdapterFactory.create(mapped);
    const result = await adapter.testConnection();
    return NextResponse.json({ success: result.success, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 测试发送通知消息
// ============================================

async function testNotify(body: any) {
  const config = body.config || body.notification || {};
  const feishu = body.feishu || {};
  const chatIdsRaw = config.chatIds || process.env.NOTIFICATION_CHAT_ID || '';
  const chatIds = String(chatIdsRaw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (chatIds.length === 0) {
    return NextResponse.json(
      { success: false, error: '请先填写通知群 ID' },
      { status: 400 }
    );
  }

  const appId = feishu.appId || process.env.FEISHU_APP_ID || '';
  const appSecret = feishu.appSecret && feishu.appSecret !== '__SET__'
    ? feishu.appSecret
    : process.env.FEISHU_APP_SECRET || '';

  try {
    // 简单发送一条测试文本消息
    let successCount = 0;
    let firstError = '';

    for (const chatId of chatIds) {
      const tokenRes = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        }
      );
      const tokenData = await tokenRes.json();
      if (tokenData.code !== 0) {
        firstError = firstError || tokenData.msg || '无法获取 access_token';
        continue;
      }
      const token = tokenData.tenant_access_token;

      const msgRes = await fetch(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({
              text: '[NPS Insight] 这是一条来自配置中心的测试消息。配置保存成功！',
            }),
          }),
        }
      );
      const msgData = await msgRes.json();
      if (msgData.code === 0) {
        successCount += 1;
      } else {
        firstError = firstError || msgData.msg || '发送失败';
      }
    }

    if (successCount > 0) {
      return NextResponse.json({
        success: true,
        message: `已成功发送到 ${successCount}/${chatIds.length} 个群`,
      });
    }
    return NextResponse.json(
      { success: false, error: '发送失败: ' + (firstError || '未知错误') },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 创建多维表格
// ============================================

async function createBitableAction(data: any) {
  try {
    const result = await createNPSInsightBitable(data.name || 'NPS Insight 反馈中心');

    const newUrl = `https://www.feishu.cn/base/${result.appToken}`;
    notifyConfigChange('bitable', 'appToken', result.appToken);
    notifyConfigChange('bitable', 'url', newUrl);

    const appToken = result.appToken;
    const tables: any = {
      feedbackTableId: result.tables?.feedbackTableId || '',
      tagsTableId: result.tables?.tag1TableId || result.tables?.tag2TableId || result.tables?.tag3TableId || '',
      tenantsTableId: result.tables?.tenantTableId || '',
      analysisTableId: result.tables?.periodTableId || '',
    };

    // 获取管理员用户 ID
    const adminUserIds = data.config?.notification?.adminUserIds ||
      data.notification?.adminUserIds ||
      process.env.NOTIFICATION_ADMIN_USER_IDS ||
      '';

    // 启动并行异步任务组（fire-and-forget）
    // 异步1：校验并补充全表字段完整性
    // 异步2：异步API添加表格协作者
    Promise.allSettled([
      // 异步任务1：校验/补充字段
      (async () => {
        try {
          console.log('[创建表格-异步] 开始校验字段完整性...');
          const validation = await validateAndGetBitableInfo(appToken);
          if (validation.valid && validation.tables) {
            const fieldCheck = checkRequiredFields(validation.tables);
            if (fieldCheck.missingFields.length > 0 && fieldCheck.feedbackTableId) {
              await addMissingFields(appToken, fieldCheck.feedbackTableId, fieldCheck.missingFields);
              console.log(`[创建表格-异步] 已补充 ${fieldCheck.missingFields.length} 个缺失字段`);
            } else {
              console.log('[创建表格-异步] 字段完整性校验通过');
            }
          }
        } catch (err) {
          console.error('[创建表格-异步] 字段校验失败:', err instanceof Error ? err.message : '未知错误');
        }
      })(),
      // 异步任务2：添加管理员协作者
      (async () => {
        try {
          if (adminUserIds && String(adminUserIds).trim()) {
            console.log('[创建表格-异步] 开始添加管理员协作者...');
            const adminResult = await addBitableAdminMembers(appToken, adminUserIds);
            if (adminResult.failCount > 0) {
              console.warn('[创建表格-异步] 部分管理员添加失败:', adminResult.errors);
            } else {
              console.log(`[创建表格-异步] 管理员协作者添加成功: ${adminResult.successCount} 位`);
            }
          }
        } catch (err) {
          console.error('[创建表格-异步] 添加管理员协作者异常:', err instanceof Error ? err.message : '未知错误');
        }
      })(),
    ]).catch((err) => {
      console.error('[创建表格-异步] 并行任务异常:', err instanceof Error ? err.message : '未知错误');
    });

    // 保存配置到 .env 和 KV（异步，不阻塞主线程）
    const baseConfig = buildV3Config();
    const updatedConfig = {
      ...baseConfig,
      bitable: {
        ...baseConfig.bitable,
        mode: 'link',
        appToken: appToken,
        url: newUrl,
        status: 'linked',
      },
    };
    saveConfigV3(updatedConfig).catch((err) => {
      console.error('[创建表格] 配置持久化失败:', err instanceof Error ? err.message : '未知错误');
    });

    console.log('[创建表格] 主流程完成，appToken:', appToken);

    return NextResponse.json({
      success: true,
      message: '多维表格创建成功，正在后台完成字段校验和权限配置',
      data: {
        appToken,
        url: newUrl,
        tables,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 关联已有表格
// ============================================

async function linkBitableAction(data: any) {
  try {
    const input = data.appToken || data.input || '';
    if (!input) {
      return NextResponse.json(
        { success: false, error: '请先填写多维表格 App Token' },
        { status: 400 }
      );
    }
    const appToken = extractAppToken(input);
    if (!appToken) {
      return NextResponse.json(
        { success: false, error: '无法从输入中提取 App Token' },
        { status: 400 }
      );
    }

    const validation = await validateAndGetBitableInfo(appToken);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.message || '表格验证失败' },
        { status: 400 }
      );
    }

    const fieldCheck = checkRequiredFields(validation.tables || []);
    if (!fieldCheck.hasFeedbackTable) {
      return NextResponse.json(
        { success: false, error: '未找到反馈列表表' },
        { status: 400 }
      );
    }

    // 获取管理员用户 ID
    const adminUserIds = data.config?.notification?.adminUserIds ||
      data.notification?.adminUserIds ||
      process.env.NOTIFICATION_ADMIN_USER_IDS ||
      '';

    const tables: any = {
      feedbackTableId: fieldCheck.feedbackTableId || '',
      tagsTableId: fieldCheck.tagsTableId || '',
      tenantsTableId: fieldCheck.tenantsTableId || '',
      analysisTableId: fieldCheck.analysisTableId || '',
    };

    // 如果有缺失字段，先补充（同步执行，因为绑定前必须确保字段完整）
    if (fieldCheck.missingFields.length > 0 && fieldCheck.feedbackTableId) {
      await addMissingFields(appToken, fieldCheck.feedbackTableId, fieldCheck.missingFields);
    }

    // 启动并行异步任务组（fire-and-forget）
    // 异步1：二次校验全表字段完整性
    // 异步2：异步API添加配置管理员协作者
    Promise.allSettled([
      // 异步任务1：二次校验字段完整性
      (async () => {
        try {
          console.log('[绑定表格-异步] 开始二次校验字段完整性...');
          const reValidation = await validateAndGetBitableInfo(appToken);
          if (reValidation.valid && reValidation.tables) {
            const reCheck = checkRequiredFields(reValidation.tables);
            if (reCheck.missingFields.length > 0 && reCheck.feedbackTableId) {
              await addMissingFields(appToken, reCheck.feedbackTableId, reCheck.missingFields);
              console.log(`[绑定表格-异步] 已补充 ${reCheck.missingFields.length} 个缺失字段`);
            } else {
              console.log('[绑定表格-异步] 字段完整性校验通过');
            }
          }
        } catch (err) {
          console.error('[绑定表格-异步] 二次字段校验失败:', err instanceof Error ? err.message : '未知错误');
        }
      })(),
      // 异步任务2：添加管理员协作者
      (async () => {
        try {
          if (adminUserIds && String(adminUserIds).trim()) {
            console.log('[绑定表格-异步] 开始添加管理员协作者...');
            const adminResult = await addBitableAdminMembers(appToken, adminUserIds);
            if (adminResult.failCount > 0) {
              console.warn('[绑定表格-异步] 部分管理员添加失败:', adminResult.errors);
            } else {
              console.log(`[绑定表格-异步] 管理员协作者添加成功: ${adminResult.successCount} 位`);
            }
          }
        } catch (err) {
          console.error('[绑定表格-异步] 添加管理员协作者异常:', err instanceof Error ? err.message : '未知错误');
        }
      })(),
    ]).catch((err) => {
      console.error('[绑定表格-异步] 并行任务异常:', err instanceof Error ? err.message : '未知错误');
    });

    notifyConfigChange('bitable', 'appToken', appToken);
    notifyConfigChange('bitable', 'url', data.url || `https://www.feishu.cn/base/${appToken}`);

    // 保存配置到 .env 和 KV（异步，不阻塞主线程）
    saveConfigV3({
      bitable: {
        mode: 'link',
        appToken,
        url: data.url || `https://www.feishu.cn/base/${appToken}`,
        feedbackTableId: tables.feedbackTableId,
        tagsTableId: tables.tagsTableId,
        tenantsTableId: tables.tenantsTableId,
        analysisTableId: tables.analysisTableId,
      },
    }).catch((err) => {
      console.error('[绑定表格] 配置持久化失败:', err instanceof Error ? err.message : '未知错误');
    });

    console.log('[绑定表格] 主流程完成，appToken:', appToken);

    // 构建成功消息（基于主流程结果）
    const successMessage = fieldCheck.missingFields.length > 0
      ? `关联成功，已补充 ${fieldCheck.missingFields.length} 个缺失字段，正在后台完成权限配置`
      : '关联成功，正在后台完成权限配置';

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: {
        appToken,
        url: `https://www.feishu.cn/base/${appToken}`,
        tables,
        missingFields: fieldCheck.missingFields,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 兼容旧版：saveConfig & testLLM
// ============================================

async function saveConfigLegacy(data: any) {
  const mapped: any = {
    feishu: { appId: '', appSecret: '' },
    dataSource: data.dataSource || {},
    ai: data.llm || {},
    bitable: data.bitable || {},
    notification: data.notification || {},
  };
  return saveConfigV3(mapped);
}

async function testLLMLegacy(data: any) {
  return testAI(data.config || data.llm || {});
}

// ============================================
// 手动触发同步任务
// ============================================

async function runManualSyncAction(config: any) {
  try {
    // Proxy to the sync cron endpoint
    const port = process.env.PORT || '3000';
    const cronSecret = process.env.CRON_SECRET;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;
    const res = await fetch(`http://localhost:${port}/api/cron/sync`, {
      method: 'POST',
      headers,
    });
    const data = await res.json();
    return NextResponse.json({
      success: res.ok && data.success,
      message: res.ok && data.success ? '同步任务已执行' : '同步任务执行失败: ' + data.error,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 重新打标历史数据
// ============================================

/**
 * 获取置信度阈值（从环境变量或配置）
 */
async function getRetagConfidenceThreshold(): Promise<number> {
  // 优先从环境变量读取
  const envThreshold = parseFloat(process.env.CONFIG_CONFIDENCE || '');
  if (!isNaN(envThreshold) && envThreshold >= 0 && envThreshold <= 1) {
    return envThreshold;
  }
  // 默认值
  return 0.8;
}

/**
 * 重新打标历史数据 - 获取所有已打标的反馈并重新进行AI打标
 */
async function retagHistoryAction() {
  const startTime = Date.now();
  let totalRecords = 0;
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  try {
    console.log('[Retag] 开始重新打标历史数据...');

    // 取消待执行的延时重打标任务（用户选择了立即重打标）
    await cancelDelayRetagTask();

    // 1. 初始化飞书配置
    await initializeBitableConfig();

    // 2. 获取置信度阈值
    const confidenceThreshold = await getRetagConfidenceThreshold();
    console.log(`[Retag] 使用置信度阈值: ${confidenceThreshold}`);

    // 3. 获取所有反馈记录（不分页，一次性获取）
    const allRecords = await bitableClient.listRecords(TABLE_NAMES.FEEDBACK, {
      pageSize: 500,
    });

    if (allRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到反馈记录',
        data: { totalRecords: 0, successCount: 0, failCount: 0, skippedCount: 0 },
      });
    }

    // 4. 过滤出有内容的记录（有内容的才需要打标）
    const recordsWithContent = allRecords.filter(r => {
      const content = String(r.fields[FEEDBACK_FIELDS.CONTENT] || '');
      return content.trim().length > 0;
    });

    totalRecords = recordsWithContent.length;
    console.log(`[Retag] 找到 ${totalRecords} 条有内容的反馈记录`);

    if (totalRecords === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到有内容的反馈记录',
        data: { totalRecords: 0, successCount: 0, failCount: 0, skippedCount: 0 },
      });
    }

    // 5. 预加载标签（缓存 5 分钟）
    const existingTags = await tagger.getCachedTags();
    const tag1List = existingTags.filter(t => t.tag1Name).map(t => t.tag1Name);
    const tag2List = existingTags.filter(t => t.tag2Name).map(t => t.tag2Name);
    const tag3List = existingTags.filter(t => t.tag3Name).map(t => t.tag3Name);
    console.log(`[Retag] 标签体系: Tag1=${tag1List.length}, Tag2=${tag2List.length}, Tag3=${tag3List.length}`);

    // 6. 批量处理（每批50条）
    const batchSize = 50;
    for (let i = 0; i < recordsWithContent.length; i += batchSize) {
      const batch = recordsWithContent.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(recordsWithContent.length / batchSize);
      console.log(`[Retag] 处理批次 ${batchNum}/${totalBatches}（${batch.length} 条）`);

      const t0 = Date.now();

      // 构建批量输入
      const feedbacks = batch.map((record) => ({
        record_id: record.record_id,
        content: String(record.fields[FEEDBACK_FIELDS.CONTENT] || ''),
        score: Number(record.fields[FEEDBACK_FIELDS.NPS_SCORE] || 0),
        source: String(record.fields[FEEDBACK_FIELDS.SOURCE] || ''),
        unsatReason: String(record.fields[FEEDBACK_FIELDS.UNSATISFACTION_REASON] || ''),
      }));

      // 调用 AI 批量打标
      const results = await tagger.batchAnalyzeFeedbacks(feedbacks, existingTags, confidenceThreshold);

      const elapsed = Date.now() - t0;
      const batchSuccess = results.filter(r => r.success).length;
      console.log(`[Retag] 批次 ${batchNum} AI分析完成 (${elapsed}ms, 成功 ${batchSuccess}/${results.length})`);

      // 第一步：收集本批次所有标签名，确保存在并获取 record_id 映射
      const tag1RecordIdMap = new Map<string, string>();
      const tag2RecordIdMap = new Map<string, string>();
      const tag3RecordIdMap = new Map<string, string>();

      const allTag1Names = new Set<string>();
      const allTag2Names = new Set<string>();
      const allTag3Names = new Set<string>();

      for (const result of results) {
        if (!result.success || !result.result) continue;
        result.result.tag1.forEach(t => t && allTag1Names.add(t));
        result.result.tag2.forEach(t => t && allTag2Names.add(t));
        result.result.tag3.forEach(t => t && allTag3Names.add(t));
      }

      // 批量确保标签存在并获取 record_id
      console.log(`[Retag] 批次 ${batchNum} 确保标签存在: Tag1=${allTag1Names.size}, Tag2=${allTag2Names.size}, Tag3=${allTag3Names.size}`);
      for (const name of Array.from(allTag1Names)) {
        try {
          const recordId = await tagger.ensureTagExists(name, 'tag1');
          tag1RecordIdMap.set(name, recordId);
        } catch (e) {
          console.error(`[Retag] 确保Tag1存在失败 ${name}:`, e);
        }
      }
      for (const name of Array.from(allTag2Names)) {
        try {
          const recordId = await tagger.ensureTagExists(name, 'tag2');
          tag2RecordIdMap.set(name, recordId);
        } catch (e) {
          console.error(`[Retag] 确保Tag2存在失败 ${name}:`, e);
        }
      }
      for (const name of Array.from(allTag3Names)) {
        try {
          const recordId = await tagger.ensureTagExists(name, 'tag3');
          tag3RecordIdMap.set(name, recordId);
        } catch (e) {
          console.error(`[Retag] 确保Tag3存在失败 ${name}:`, e);
        }
      }

      // 第二步：用 record_id 写入反馈表的关联字段
      const updates = results
        .filter(r => r.success && r.result)
        .map(r => {
          const tag1RecordIds = (r.result!.tag1 || [])
            .map(t => tag1RecordIdMap.get(t))
            .filter((id): id is string => !!id);
          const tag2RecordIds = (r.result!.tag2 || [])
            .map(t => tag2RecordIdMap.get(t))
            .filter((id): id is string => !!id);
          const tag3RecordIds = (r.result!.tag3 || [])
            .map(t => tag3RecordIdMap.get(t))
            .filter((id): id is string => !!id);

          return {
            record_id: r.recordId,
            fields: {
              [FEEDBACK_FIELDS.TAG1]: tag1RecordIds,
              [FEEDBACK_FIELDS.TAG2]: tag2RecordIds,
              [FEEDBACK_FIELDS.TAG3]: tag3RecordIds,
              [FEEDBACK_FIELDS.CONFIDENCE]: r.result!.confidence,
              [FEEDBACK_FIELDS.NEED_LOG_CHECK]: r.result!.needLogCheck ? '是' : '否',
              [FEEDBACK_FIELDS.REVIEW_NEEDED]: r.result!.reviewNeeded ? '是' : '否',
              [FEEDBACK_FIELDS.TRANSLATED_CONTENT]: r.result!.translatedContent || '',
              [FEEDBACK_FIELDS.STATUS]: '已打标',
            },
          };
        });

      if (updates.length > 0) {
        try {
          await bitableClient.batchUpdateRecords(TABLE_NAMES.FEEDBACK, updates);
          successCount += updates.length;
        } catch (updateErr) {
          console.error(`[Retag] 批量更新失败，逐条更新:`, updateErr);
          for (const update of updates) {
            try {
              await bitableClient.updateRecord(TABLE_NAMES.FEEDBACK, update.record_id, update.fields);
              successCount++;
            } catch {
              failCount++;
            }
          }
        }
      }

      failCount += results.filter(r => !r.success).length;
      skippedCount += results.filter(r => !r.success).length;
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Retag] 重打标完成，总计成功 ${successCount}/${totalRecords}，失败 ${failCount}，耗时 ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      message: `重新打标完成：成功 ${successCount} 条，失败 ${failCount} 条`,
      data: {
        totalRecords,
        successCount,
        failCount,
        skippedCount,
        elapsedMs: totalTime,
      },
    });
  } catch (error) {
    console.error('[Retag] 重新打标失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

// ============================================
// 5分钟延时自动重打标
// ============================================

/**
 * 延时重打标任务管理器
 * 使用全局变量存储待执行的延时任务
 * 注意：在 Vercel serverless 环境下，setTimeout 在函数结束后不会执行
 *       此功能仅在持久化服务器环境（如传统 Node.js 服务器）下有效
 */
interface DelayRetagTask {
  timeoutId: NodeJS.Timeout;
  scheduledAt: number;
}

// 全局变量存储延时任务（仅在服务端进程生命周期内有效）
let globalDelayRetagTask: DelayRetagTask | null = null;

// 延时5分钟
const DELAY_RETAG_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 安排延时重打标任务（5分钟后执行）
 * 如果已存在延时任务，先取消旧的
 */
async function scheduleDelayRetagTask(): Promise<void> {
  console.log('[DelayRetag] 安排5分钟后自动重打标...');

  // 取消已存在的延时任务
  if (globalDelayRetagTask) {
    clearTimeout(globalDelayRetagTask.timeoutId);
    globalDelayRetagTask = null;
    console.log('[DelayRetag] 已取消旧的重打标任务');
  }

  // 创建新的延时任务
  const timeoutId = setTimeout(async () => {
    console.log('[DelayRetag] 5分钟延时到达，开始执行自动重打标...');
    globalDelayRetagTask = null;

    try {
      // 执行重打标
      const result = await retagHistoryAction();
      console.log('[DelayRetag] 自动重打标执行结果:', result);
    } catch (error) {
      console.error('[DelayRetag] 自动重打标执行失败:', error);
    }
  }, DELAY_RETAG_TIMEOUT_MS);

  globalDelayRetagTask = {
    timeoutId,
    scheduledAt: Date.now(),
  };

  console.log(`[DelayRetag] 已安排 ${new Date(Date.now() + DELAY_RETAG_TIMEOUT_MS).toISOString()} 执行重打标`);
}

/**
 * 取消待执行的延时重打标任务
 */
async function cancelDelayRetagTask(): Promise<void> {
  if (globalDelayRetagTask) {
    clearTimeout(globalDelayRetagTask.timeoutId);
    globalDelayRetagTask = null;
    console.log('[DelayRetag] 已取消延时重打标任务');
  }
}

/**
 * 检查是否存在待执行的延时重打标任务
 */
async function hasDelayRetagTask(): Promise<boolean> {
  return globalDelayRetagTask !== null;
}
