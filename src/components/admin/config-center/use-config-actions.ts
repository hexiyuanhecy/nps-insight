'use client';

import { useCallback } from 'react';
import {
  createBitable,
  linkBitable,
  retagHistory as retagHistoryApi,
  runManualSync as runManualSyncApi,
  saveConfigV3,
  testAiConnection,
  testFeishuConnection,
  testNotifyConnection,
  uploadExcel as uploadExcelApi,
} from '@/apis/config-api';
import { buildCronFromSchedule } from '@/components/admin/config-center/schedule-utils';
import type { AiProviderCache, TabConfig, ToastType } from '@/components/admin/config-center/types';
import { POPULAR_MODELS } from '@/constants/config-center';
import type { Dispatch, SetStateAction } from 'react';

interface UseConfigActionsOptions {
  config: TabConfig | null;
  setConfig: Dispatch<SetStateAction<TabConfig | null>>;
  setIsLoading: (loading: boolean) => void;
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
  setIsLoading,
  pushToast,
  loadConfig,
  setBitableCreateOpen,
  setBitableLinkOpen,
  aiCache,
  setAiCache,
}: UseConfigActionsOptions) {
  const saveSectionConfig = useCallback(
    async (section: string) => {
      if (!config) return;
      try {
        setIsLoading(true);
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
        setIsLoading(false);
      }
    },
    [config, loadConfig, pushToast, setIsLoading],
  );

  const testFeishu = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await testFeishuConnection(config.feishu);
      pushToast(result.success ? '飞书连接正常' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [config, pushToast, setIsLoading]);

  const testAI = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await testAiConnection(config.ai);
      pushToast(result.success ? 'AI 连接正常' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [config, pushToast, setIsLoading]);

  const testNotify = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await testNotifyConnection(config.notification);
      pushToast(result.success ? '消息已发送' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('测试失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [config, pushToast, setIsLoading]);

  const runManualSync = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await runManualSyncApi(config);
      pushToast(result.success ? '同步已启动' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('同步失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [config, pushToast, setIsLoading]);

  const createTable = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await createBitable(config.feishu);
      if (result.success) {
        const newAppToken = result.appToken || '';
        const newConfig = {
          ...config,
          bitable: {
            ...config.bitable,
            mode: 'link',
            appToken: newAppToken,
            url: newAppToken ? `https://bytedance.feishu.cn/base/${newAppToken}` : '',
            status: 'linked',
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
      setIsLoading(false);
    }
  }, [config, loadConfig, pushToast, setBitableCreateOpen, setConfig, setIsLoading, saveConfigV3]);

  const linkTable = useCallback(async () => {
    if (!config) return;
    if (!config.bitable.appToken) {
      pushToast('请输入表格 App Token', 'error');
      return;
    }
    try {
      setIsLoading(true);
      const result = await linkBitable(config.feishu, config.bitable.appToken);
      if (result.success) {
        const newConfig = {
          ...config,
          bitable: {
            ...config.bitable,
            mode: 'link',
            url: `https://bytedance.feishu.cn/base/${config.bitable.appToken}`,
            status: 'linked',
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
      setIsLoading(false);
    }
  }, [config, pushToast, setBitableLinkOpen, setConfig, setIsLoading, saveConfigV3]);

  const retagHistory = useCallback(async () => {
    if (!config) return;
    try {
      setIsLoading(true);
      const result = await retagHistoryApi(config);
      pushToast(result.success ? '已启动重新打标' : '失败: ' + result.error, result.success ? 'success' : 'error');
    } catch (error) {
      pushToast('重新打标失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [config, pushToast, setIsLoading]);

  const persistScheduleAndSave = useCallback(async () => {
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
      setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [config, loadConfig, pushToast, setIsLoading]);

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

  const importExcel = useCallback(async (file: File) => {
    try {
      setIsLoading(true);
      const result = await uploadExcelApi(file);
      if (result.success && result.data) {
        pushToast(`Excel 导入成功：共 ${result.data.total} 条，写入 ${result.data.written} 条，跳过 ${result.data.skipped} 条`, 'success');
      } else {
        pushToast('导入失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      pushToast('导入失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast, setIsLoading]);

  return {
    saveSectionConfig,
    testFeishu,
    testAI,
    testNotify,
    runManualSync,
    createTable,
    linkTable,
    retagHistory,
    persistScheduleAndSave,
    handleProviderChange,
    importExcel,
  };
}

export type ConfigActions = ReturnType<typeof useConfigActions>;
