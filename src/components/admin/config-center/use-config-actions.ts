'use client';

import { useCallback } from 'react';
import {
  createBitable,
  linkBitable,
  retagHistory as retagHistoryApi,
  runManualSync as runManualSyncApi,
  runWeeklyTagging as runWeeklyTaggingApi,
  runMonthlyAnalysis as runMonthlyAnalysisApi,
  saveConfigV3,
  testAiConnection,
  testFeishuConnection,
  testNotifyConnection,
  uploadExcel as uploadExcelApi,
  getUserResource as getUserResourceApi,
  initUserResource as initUserResourceApi,
  getAuthStatus as getAuthStatusApi,
  getAuthUrl as getAuthUrlApi,
  authCallback as authCallbackApi,
  authLogout as authLogoutApi,
} from '@/apis/config-api';
import { buildCronFromSchedule } from '@/components/admin/config-center/schedule-utils';
import type { AiProviderCache, TabConfig, ToastType, ConfigTabKey } from '@/components/admin/config-center/types';
import { POPULAR_MODELS } from '@/constants/config-center';
import type { Dispatch, SetStateAction } from 'react';

interface UseConfigActionsOptions {
  config: TabConfig | null;
  setConfig: Dispatch<SetStateAction<TabConfig | null>>;
  setTabLoading: (tab: ConfigTabKey, loading: boolean) => void;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsWeeklyTagging: Dispatch<SetStateAction<boolean>>;
  setIsMonthlyAnalysis: Dispatch<SetStateAction<boolean>>;
  pushToast: (text: string, type?: ToastType) => void;
  loadConfig: () => Promise<void>;
  setBitableCreateOpen: (open: boolean) => void;
  setBitableLinkOpen: (open: boolean) => void;
  aiCache: Record<string, AiProviderCache>;
  setAiCache: Dispatch<SetStateAction<Record<string, AiProviderCache>>>;
}

export function useConfigActions({
  config,
  setConfig,
  setTabLoading,
  setIsSaving,
  setIsWeeklyTagging,
  setIsMonthlyAnalysis,
  pushToast,
  loadConfig,
  setBitableCreateOpen,
  setBitableLinkOpen,
  aiCache,
  setAiCache,
}: UseConfigActionsOptions) {
  /** 保存所有配置（全局保存） */
  const saveAll = useCallback(async () => {
    if (!config) return;
    try {
      setIsSaving(true);
      const result = await saveConfigV3(config);
      if (result.success) {
        pushToast('配置已保存', 'success');
        await loadConfig();
      } else {
        pushToast('保存失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('保存失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [config, loadConfig, pushToast, setIsSaving]);

  const saveSectionConfig = useCallback(
    async (section: string, tabKey: ConfigTabKey) => {
      if (!config) return;
      try {
        setTabLoading(tabKey, true);
        const result = await saveConfigV3(config);
        if (result.success) {
          pushToast(`${section}配置已保存`, 'success');
          await loadConfig();
        } else {
          pushToast('保存失败: ' + (result.error || '未知错误'), 'error');
        }
      } catch (error) {
        pushToast('保存失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      } finally {
        setTabLoading(tabKey, false);
      }
    },
    [config, loadConfig, pushToast, setTabLoading],
  );

  const testFeishu = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      const result = await testFeishuConnection(config.feishu);
      pushToast(result.success ? '飞书连接正常' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setTabLoading]);

  const testAI = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      const result = await testAiConnection(config.ai);
      pushToast(result.success ? 'AI 连接正常' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setTabLoading]);

  const testNotify = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      const result = await testNotifyConnection(config.notification);
      pushToast(result.success ? '消息已发送' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setTabLoading]);

  const runManualSync = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      const result = await runManualSyncApi(config);
      pushToast(result.success ? '同步已启动' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('同步失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setTabLoading]);

  const createTable = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      const result = await createBitable(config);
      if (result.success) {
        const newAppToken = result.appToken || '';
        const newConfig = {
          ...config,
          bitable: {
            ...config.bitable,
            mode: 'link' as const,
            appToken: newAppToken,
            url: newAppToken ? `https://www.feishu.cn/base/${newAppToken}` : '',
            status: 'linked' as const,
          },
        };
        setConfig(newConfig);
        const saveResult = await saveConfigV3(newConfig);
        if (saveResult.success) {
          await loadConfig();
        }
        pushToast('多维表格创建成功', 'success');
        setBitableCreateOpen(false);
      } else {
        pushToast('创建失败: ' + result.error, 'error');
      }
    } catch (error) {
      pushToast('创建失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, loadConfig, pushToast, setBitableCreateOpen, setConfig, setTabLoading]);

  const linkTable = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    if (!config.bitable.appToken) {
      pushToast('请输入表格 App Token', 'error');
      return;
    }
    try {
      setTabLoading(tabKey, true);
      const result = await linkBitable(config, config.bitable.appToken);
      if (result.success) {
        const newConfig = {
          ...config,
          bitable: {
            ...config.bitable,
            mode: 'link' as const,
            url: `https://www.feishu.cn/base/${config.bitable.appToken}`,
            status: 'linked' as const,
          },
        };
        setConfig(newConfig);
        await saveConfigV3(newConfig);
        pushToast('表格绑定成功', 'success');
        setBitableLinkOpen(false);
      } else {
        pushToast('绑定失败: ' + result.error, 'error');
      }
    } catch (error) {
      pushToast('绑定失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setBitableLinkOpen, setConfig, setTabLoading]);

  const retagHistory = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    try {
      setTabLoading(tabKey, true);
      console.log('==============================>hxy22222 == ', 22222);
      const result = await retagHistoryApi(config);
      pushToast(result.success ? '已启动重新打标' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('重新打标失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, pushToast, setTabLoading]);

  // 手动触发周打标流程 - 独立 loading 状态
  const runWeeklyTagging = useCallback(async () => {
    try {
      setIsWeeklyTagging(true);
      console.log('【周打标】手动触发，开始执行...');
      const result = await runWeeklyTaggingApi(config ?? undefined);
      if (result.success) {
        pushToast('周打标已开始，请及时查看多维表格', 'success');
      } else {
        pushToast('周打标启动失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('周打标失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsWeeklyTagging(false);
    }
  }, [config, pushToast, setIsWeeklyTagging]);

  // 手动触发月分析流程 - 独立 loading 状态
  const runMonthlyAnalysis = useCallback(async () => {
    try {
      setIsMonthlyAnalysis(true);
      console.log('【月分析】手动触发，开始执行...');
      const result = await runMonthlyAnalysisApi(config ?? undefined);
      if (result.success) {
        pushToast('月分析已开始，请及时查看多维表格', 'success');
      } else {
        pushToast('月分析启动失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('月分析失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsMonthlyAnalysis(false);
    }
  }, [config, pushToast, setIsMonthlyAnalysis]);

  const persistScheduleAndSave = useCallback(async (tabKey: ConfigTabKey) => {
    if (!config) return;
    const syncCron = buildCronFromSchedule(
      config.schedule.syncUnit,
      config.schedule.syncEvery,
      config.schedule.syncTime,
      config.schedule.syncWeekDay,
      config.schedule.syncMonthDay,
    );
    const analysisCron = buildCronFromSchedule(
      config.schedule.analysisUnit,
      config.schedule.analysisEvery,
      config.schedule.analysisTime,
      config.schedule.analysisWeekDay,
      config.schedule.analysisMonthDay,
    );
    try {
      setTabLoading(tabKey, true);
      const result = await saveConfigV3({
        ...config,
        schedule: { ...config.schedule, syncCron, analysisCron },
      });
      if (result.success) {
        pushToast('配置已保存', 'success');
        await loadConfig();
      } else {
        pushToast('保存失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('保存失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [config, loadConfig, pushToast, setTabLoading]);

  const handleProviderChange = useCallback(
    (newProvider: string) => {
      if (!config) return;
      const model = POPULAR_MODELS.find((x) => x.key === newProvider);

      setAiCache((prev) => ({
        ...prev,
        [config.ai.provider]: {
          apiKey: config.ai.apiKey,
          baseUrl: config.ai.baseUrl,
          model: config.ai.model,
          modelVersion: config.ai.modelVersion,
        },
      }));

      const cachedConfig = aiCache[newProvider];
      setConfig({
        ...config,
        ai: {
          ...config.ai,
          provider: newProvider,
          model: cachedConfig?.model || (model ? model.defaultVersion : config.ai.model),
          modelVersion: cachedConfig?.modelVersion || (model ? model.defaultVersion : config.ai.modelVersion),
          baseUrl: cachedConfig?.baseUrl || (model?.needsBaseUrl ? config.ai.baseUrl : ''),
          apiKey: cachedConfig?.apiKey || '',
        },
      });
    },
    [aiCache, config, setAiCache, setConfig],
  );

  const importExcel = useCallback(async (file: File, tabKey: ConfigTabKey) => {
    try {
      setTabLoading(tabKey, true);
      const result = await uploadExcelApi(file);
      if (result.success && result.data) {
        pushToast(`Excel 导入成功：共 ${result.data.total} 条，写入 ${result.data.written} 条，跳过 ${result.data.skipped} 条`, 'success');
      } else {
        pushToast('导入失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('导入失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [pushToast, setTabLoading]);

  // 获取用户资源状态
  const loadUserResource = useCallback(async () => {
    try {
      const result = await getUserResourceApi();
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('[UserResource] 获取失败:', error);
      return null;
    }
  }, []);

  // 初始化用户资源
  const initializeUserResource = useCallback(async (tabKey: ConfigTabKey, userName?: string, userOpenId?: string) => {
    try {
      setTabLoading(tabKey, true);
      console.log('【用户资源】开始初始化...');
      console.log('【用户资源】详细日志请查看控制台');

      const result = await initUserResourceApi(userName, userOpenId);

      if (result.success && result.data) {
        if (result.data.isNew) {
          pushToast('用户资源初始化成功！', 'success');
        } else {
          pushToast('用户资源已存在', 'info');
        }
        return result.data;
      } else {
        pushToast('初始化失败: ' + (result.error || '未知错误'), 'error');
        return null;
      }
    } catch (error) {
      pushToast('初始化失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      return null;
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [pushToast, setTabLoading]);

  // 获取用户授权状态
  const loadAuthStatus = useCallback(async () => {
    try {
      const result = await getAuthStatusApi();
      if (result.success && result.data) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('[Auth] 获取状态失败:', error);
      return null;
    }
  }, []);

  // 获取授权URL
  const getAuthUrl = useCallback(async () => {
    try {
      const result = await getAuthUrlApi();
      if (result.success && result.data) {
        return result.data.authUrl;
      }
      return null;
    } catch (error) {
      console.error('[Auth] 获取授权URL失败:', error);
      return null;
    }
  }, []);

  // 处理授权回调
  const handleAuthCallback = useCallback(async (tabKey: ConfigTabKey, code: string) => {
    try {
      setTabLoading(tabKey, true);
      const result = await authCallbackApi(code);
      if (result.success && result.data) {
        pushToast(`授权成功：${result.data.userInfo?.name || '用户'}`, 'success');
        return result.data;
      } else {
        pushToast('授权失败: ' + (result.error || '未知错误'), 'error');
        return null;
      }
    } catch (error) {
      pushToast('授权失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      return null;
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [pushToast, setTabLoading]);

  // 退出授权
  const logoutAuth = useCallback(async (tabKey: ConfigTabKey) => {
    try {
      setTabLoading(tabKey, true);
      const result = await authLogoutApi();
      if (result.success) {
        pushToast('已退出授权', 'info');
        return true;
      } else {
        pushToast('退出失败: ' + (result.error || '未知错误'), 'error');
        return false;
      }
    } catch (error) {
      pushToast('退出失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
      return false;
    } finally {
      setTabLoading(tabKey, false);
    }
  }, [pushToast, setTabLoading]);

  return {
    saveAll,
    saveSectionConfig,
    testFeishu,
    testAI,
    testNotify,
    runManualSync,
    runWeeklyTagging,
    runMonthlyAnalysis,
    createTable,
    linkTable,
    retagHistory,
    persistScheduleAndSave,
    handleProviderChange,
    importExcel,
    loadUserResource,
    initializeUserResource,
    loadAuthStatus,
    getAuthUrl,
    handleAuthCallback,
    logoutAuth,
  };
}

export type ConfigActions = ReturnType<typeof useConfigActions>;
