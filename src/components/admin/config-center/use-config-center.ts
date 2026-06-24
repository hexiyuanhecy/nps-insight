'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchConfig } from '@/apis/config-api';
import { createConfigUpdaters } from '@/components/admin/config-center/config-updaters';
import { useConfigActions } from '@/components/admin/config-center/use-config-actions';
import type {
  AiProviderCache,
  ConfigTabKey,
  TabConfig,
  ToastItem,
  ToastType,
} from '@/components/admin/config-center/types';
import { DEFAULT_TAG1, POPULAR_MODELS, createDefaultConfig } from '@/constants/config-center';

export function useConfigCenter() {
  const [activeTab, setActiveTab] = useState<ConfigTabKey>('feishu');
  const [isLoading, setIsLoading] = useState(false);
  const [bitableCreateOpen, setBitableCreateOpen] = useState(false);
  const [bitableLinkOpen, setBitableLinkOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [config, setConfig] = useState<TabConfig | null>(null);
  const [aiCache, setAiCache] = useState<Record<string, AiProviderCache>>({});

  const pushToast = useCallback((text: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((ts) => [...ts, { id, text, type }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchConfig();
      if (result.success && result.data) {
        const data = result.data;
        const processedConfig: TabConfig = {
          ...data,
          feishu: {
            ...data.feishu,
            appSecret: data.feishu.appSecret === '__SET__' ? '__SET__' : data.feishu.appSecret,
          },
          dataSource: {
            ...data.dataSource,
            apiKey: data.dataSource.apiKey === '__SET__' ? '__SET__' : data.dataSource.apiKey,
          },
          ai: {
            ...data.ai,
            apiKey: data.ai.apiKey === '__SET__' ? '__SET__' : data.ai.apiKey,
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
      } else {
        setConfig(createDefaultConfig());
      }
    } catch (error) {
      pushToast('加载配置失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updaters = useMemo(() => createConfigUpdaters(config, setConfig), [config]);
  const actions = useConfigActions({
    config,
    setConfig,
    setIsLoading,
    pushToast,
    loadConfig,
    setBitableCreateOpen,
    setBitableLinkOpen,
    aiCache,
    setAiCache,
  });

  const tag1Changed = config ? JSON.stringify(config.tag1) !== JSON.stringify(DEFAULT_TAG1) : false;
  const activeAI = config
    ? POPULAR_MODELS.find((m) => m.key === config.ai.provider) || POPULAR_MODELS[POPULAR_MODELS.length - 1]
    : POPULAR_MODELS[0];

  return {
    activeTab,
    setActiveTab,
    isLoading,
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
    ...updaters,
    ...actions,
  };
}

export type ConfigCenterController = ReturnType<typeof useConfigCenter>;
