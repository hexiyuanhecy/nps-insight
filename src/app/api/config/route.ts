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
import {
  createNPSInsightBitable,
  extractAppToken,
  validateAndGetBitableInfo,
  checkRequiredFields,
  addMissingFields,
} from '@/lib/feishu/bitable-setup';
import { notifyConfigChange } from '@/lib/notification/delay-notifier';

// ============================================
// 默认配置（当环境变量为空时使用）
// ============================================

const DEFAULT_TAG1 = [
  { name: '疑似Bug', definition: '功能异常、报错、崩溃', enabled: true },
  { name: '功能优化', definition: '功能改进建议、体验优化', enabled: true },
  { name: '界面改进', definition: 'UI/UX 改进建议', enabled: true },
  { name: '性能提升', definition: '卡顿、慢、性能问题', enabled: true },
  { name: '用户教育', definition: '使用指引、文档问题、理解成本', enabled: true },
  { name: '安全合规', definition: '安全相关问题', enabled: true },
  { name: '无效反馈', definition: '非有效反馈、SPAM、重复', enabled: true },
];

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
    feedbackTableId: process.env.BITABLE_FEEDBACK_TABLE_ID || '',
    tagsTableId: process.env.BITABLE_TAGS_TABLE_ID || '',
    tenantsTableId: process.env.BITABLE_TENANTS_TABLE_ID || '',
    analysisTableId: process.env.BITABLE_ANALYSIS_TABLE_ID || '',
    status: process.env.BITABLE_TOKEN ? 'linked' : 'unset',
  };

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
    largeTenantLevels: (process.env.CONFIG_LARGE_TENANTS || 'A4,A5')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };

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
  const syncParts = parseCronToSchedule(process.env.CRON_SYNC_SCHEDULE || '0 0 * * 1');
  const analysisParts = parseCronToSchedule(process.env.CRON_ANALYSIS_SCHEDULE || '0 0 1 * *');
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
    syncCron: process.env.CRON_SYNC_SCHEDULE || '0 0 * * 1',
    analysisCron: process.env.CRON_ANALYSIS_SCHEDULE || '0 0 1 * *',
    devMode: process.env.CRON_DEV_MODE === 'true',
  };

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
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// ============================================
// POST - 更新配置 / 测试连接
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
  const appId = feishuConfig.appId || process.env.FEISHU_APP_ID;
  const appSecret = feishuConfig.appSecret || process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { success: false, error: '请先填写 App ID 和 App Secret' },
      { status: 400 }
    );
  }

  try {
    // 尝试获取 tenant_access_token
    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      }
    );
    const data = await res.json();
    if (data.code === 0 && data.tenant_access_token) {
      return NextResponse.json({
        success: true,
        message: '飞书应用连接正常（已获取 access_token）',
      });
    }
    return NextResponse.json(
      { success: false, error: '飞书返回错误: ' + (data.msg || data.error || '未知') },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: '网络异常: ' + (error instanceof Error ? error.message : '未知') },
      { status: 500 }
    );
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

    notifyConfigChange('bitable', 'appToken', result.appToken);
    notifyConfigChange(
      'bitable',
      'url',
      data.url || `https://www.feishu.cn/base/${result.appToken}`
    );

    // 映射 tables → tableId
    const tables: any = {};
    (result.tables || []).forEach((t: any) => {
      const key = t.key || t.tableId || '';
      if (key.includes('feedback')) tables.feedbackTableId = t.tableId;
      else if (key.includes('tag')) tables.tagsTableId = t.tableId;
      else if (key.includes('tenant')) tables.tenantsTableId = t.tableId;
      else if (key.includes('analysis') || key.includes('top')) tables.analysisTableId = t.tableId;
    });
    if (result.tables && result.tables[0]) tables.feedbackTableId = tables.feedbackTableId || result.tables[0].tableId;
    if (result.tables && result.tables[1]) tables.tagsTableId = tables.tagsTableId || result.tables[1].tableId;
    if (result.tables && result.tables[2]) tables.tenantsTableId = tables.tenantsTableId || result.tables[2].tableId;
    if (result.tables && result.tables[3]) tables.analysisTableId = tables.analysisTableId || result.tables[3].tableId;

    return NextResponse.json({
      success: true,
      message: '多维表格创建成功',
      data: {
        appToken: result.appToken,
        url: `https://www.feishu.cn/base/${result.appToken}`,
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

    if (fieldCheck.missingFields.length > 0 && fieldCheck.feedbackTableId) {
      await addMissingFields(appToken, fieldCheck.feedbackTableId, fieldCheck.missingFields);
    }

    notifyConfigChange('bitable', 'appToken', appToken);
    notifyConfigChange('bitable', 'url', data.url || `https://www.feishu.cn/base/${appToken}`);

    const tables: any = {
      feedbackTableId: fieldCheck.feedbackTableId || '',
      tagsTableId: fieldCheck.tagsTableId || '',
      tenantsTableId: fieldCheck.tenantsTableId || '',
      analysisTableId: fieldCheck.analysisTableId || '',
    };

    return NextResponse.json({
      success: true,
      message:
        fieldCheck.missingFields.length > 0
          ? `关联成功，已补充 ${fieldCheck.missingFields.length} 个缺失字段`
          : '关联成功',
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
