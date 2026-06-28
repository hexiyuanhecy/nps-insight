'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchConfig, getUserResource } from '@/apis/config-api';
import { createConfigUpdaters } from '@/components/admin/config-center/config-updaters';
import { useConfigActions } from '@/components/admin/config-center/use-config-actions';
import type {
  AiProviderCache,
  ConfigTabKey,
  TabConfig,
  ToastItem,
  ToastType,
  UserResource,
} from '@/components/admin/config-center/types';
import { DEFAULT_TAG1, POPULAR_MODELS, createDefaultConfig } from '@/constants/config-center';

export function useConfigCenter() {
  const [activeTab, setActiveTab] = useState<ConfigTabKey>('feishu');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [tabLoading, setTabLoadingState] = useState<Record<ConfigTabKey, boolean>>({
    feishu: false,
    datasource: false,
    tagging: false,
  });
  const [bitableCreateOpen, setBitableCreateOpen] = useState(false);
  const [bitableLinkOpen, setBitableLinkOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [config, setConfig] = useState<TabConfig | null>(null);
  const [aiCache, setAiCache] = useState<Record<string, AiProviderCache>>({});
  const [isSaving, setIsSaving] = useState(false); // 全局保存 loading 状态
  const [isWeeklyTagging, setIsWeeklyTagging] = useState(false); // 周打标独立 loading
  const [isMonthlyAnalysis, setIsMonthlyAnalysis] = useState(false); // 月分析独立 loading

  const pushToast = useCallback((text: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((ts) => [...ts, { id, text, type }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const setTabLoading = useCallback((tab: ConfigTabKey, loading: boolean) => {
    setTabLoadingState((prev) => ({ ...prev, [tab]: loading }));
  }, []);

  /**
   * 加载用户资源状态并合并到 config 中
   */
  const loadUserResourceToConfig = useCallback(async () => {
    try {
      const result = await getUserResource();
      if (result.success && result.data?.exists && result.data.resource) {
        const userResource = result.data.resource as UserResource;
        setConfig((prev) => {
          if (!prev) return prev;
          return { ...prev, userResource };
        });
      }
    } catch (error) {
      console.warn('[UserResource] 加载用户资源失败:', error);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setIsInitialLoading(true);
      const result = await fetchConfig();
      if (result.success && result.data) {
        const data = result.data;
        const defaultConfig = createDefaultConfig();
        const processedConfig: TabConfig = {
          ...defaultConfig,
          ...data,
          feishu: {
            ...defaultConfig.feishu,
            ...data.feishu,
            appSecret: data.feishu?.appSecret === '__SET__' ? '__SET__' : (data.feishu?.appSecret || ''),
          },
          dataSource: {
            ...defaultConfig.dataSource,
            ...data.dataSource,
            apiKey: data.dataSource?.apiKey === '__SET__' ? '__SET__' : (data.dataSource?.apiKey || ''),
          },
          ai: {
            ...defaultConfig.ai,
            ...data.ai,
            apiKey: data.ai?.apiKey === '__SET__' ? '__SET__' : (data.ai?.apiKey || ''),
          },
          bitable: {
            ...defaultConfig.bitable,
            ...data.bitable,
          },
          tagging: {
            ...defaultConfig.tagging,
            ...data.tagging,
          },
          schedule: {
            ...defaultConfig.schedule,
            ...data.schedule,
          },
          notification: {
            ...defaultConfig.notification,
            ...data.notification,
          },
          logPlatform: {
            ...defaultConfig.logPlatform,
            ...data.logPlatform,
          },
          tenantSource: {
            ...defaultConfig.tenantSource,
            ...data.tenantSource,
          },
          webhook: {
            ...defaultConfig.webhook,
            ...data.webhook,
          },
        };
        setConfig(processedConfig);

        if (data.ai?.provider) {
          setAiCache({
            [data.ai.provider]: {
              apiKey: data.ai.apiKey || '',
              baseUrl: data.ai.baseUrl || '',
              model: data.ai.model || '',
              modelVersion: data.ai.modelVersion || '',
            },
          });
        }

        // 配置加载完成后，异步加载用户资源
        loadUserResourceToConfig();
      } else {
        setConfig(createDefaultConfig());
      }
    } catch (error) {
      pushToast('加载配置失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsInitialLoading(false);
    }
  }, [pushToast, loadUserResourceToConfig]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updaters = useMemo(() => createConfigUpdaters(config, setConfig), [config]);
  const actions = useConfigActions({
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
  });

  const tag1Changed = config ? JSON.stringify(config.tag1) !== JSON.stringify(DEFAULT_TAG1) : false;
  const activeAI = config && config.ai
    ? POPULAR_MODELS.find((m) => m.key === config.ai.provider) || POPULAR_MODELS[0]
    : POPULAR_MODELS[0];

  return {
    activeTab,
    setActiveTab,
    isInitialLoading,
    tabLoading,
    setTabLoading,
    isSaving,
    isWeeklyTagging,
    isMonthlyAnalysis,
    bitableCreateOpen,
    setBitableCreateOpen,
    bitableLinkOpen,
    setBitableLinkOpen,
    toasts,
    dismissToast,
    config,
    aiCache,
    tag1Changed,
    activeAI,
    setConfig,
    pushToast,
    /** 刷新用户资源状态到 config 中 */
    refreshUserResource: loadUserResourceToConfig,
    ...updaters,
    ...actions,
  };
}

export type ConfigCenterController = ReturnType<typeof useConfigCenter>;
