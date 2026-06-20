import type { TabConfig } from '@/components/admin/config-center/types';
import type { Dispatch, SetStateAction } from 'react';

type SetConfig = Dispatch<SetStateAction<TabConfig | null>>;

export function createConfigUpdaters(config: TabConfig | null, setConfig: SetConfig) {
  const updateFeishu = (field: keyof TabConfig['feishu'], value: string) => {
    if (!config) return;
    setConfig({ ...config, feishu: { ...config.feishu, [field]: value } });
  };

  const updateBitable = <K extends keyof TabConfig['bitable']>(
    field: K,
    value: TabConfig['bitable'][K],
  ) => {
    if (!config) return;
    setConfig({ ...config, bitable: { ...config.bitable, [field]: value } });
  };

  const updateDataSource = <K extends keyof TabConfig['dataSource']>(
    field: K,
    value: TabConfig['dataSource'][K],
  ) => {
    if (!config) return;
    setConfig({ ...config, dataSource: { ...config.dataSource, [field]: value } });
  };

  const updateWebhook = (url: string) => {
    if (!config) return;
    setConfig({ ...config, webhook: { url } });
  };

  const updateAI = <K extends keyof TabConfig['ai']>(field: K, value: TabConfig['ai'][K]) => {
    if (!config) return;
    setConfig({ ...config, ai: { ...config.ai, [field]: value } });
  };

  const updateTag1 = (
    index: number,
    field: 'name' | 'definition' | 'enabled',
    value: string | boolean,
  ) => {
    if (!config) return;
    const newTags = [...config.tag1];
    newTags[index] = { ...newTags[index], [field]: value };
    setConfig({ ...config, tag1: newTags });
  };

  const addTag1 = () => {
    if (!config) return;
    setConfig({ ...config, tag1: [...config.tag1, { name: '', definition: '', enabled: true }] });
  };

  const removeTag1 = (index: number) => {
    if (!config) return;
    if (!window.confirm('确定删除此标签？')) return;
    setConfig({ ...config, tag1: config.tag1.filter((_, i) => i !== index) });
  };

  const updateTag2Init = (value: string) => {
    if (!config) return;
    setConfig({ ...config, tag2Init: value });
  };

  const updateTagging = <K extends keyof TabConfig['tagging']>(
    field: K,
    value: TabConfig['tagging'][K],
  ) => {
    if (!config) return;
    setConfig({ ...config, tagging: { ...config.tagging, [field]: value } });
  };

  const updateSchedule = <K extends keyof TabConfig['schedule']>(
    field: K,
    value: TabConfig['schedule'][K],
  ) => {
    if (!config) return;
    setConfig({ ...config, schedule: { ...config.schedule, [field]: value } });
  };

  const updateLogPlatform = (urlTemplate: string) => {
    if (!config) return;
    setConfig({ ...config, logPlatform: { urlTemplate } });
  };

  const updateNotification = <K extends keyof TabConfig['notification']>(
    field: K,
    value: TabConfig['notification'][K],
  ) => {
    if (!config) return;
    setConfig({ ...config, notification: { ...config.notification, [field]: value } });
  };

  return {
    updateFeishu,
    updateBitable,
    updateDataSource,
    updateWebhook,
    updateAI,
    updateTag1,
    addTag1,
    removeTag1,
    updateTag2Init,
    updateTagging,
    updateSchedule,
    updateLogPlatform,
    updateNotification,
  };
}

export type ConfigUpdaters = ReturnType<typeof createConfigUpdaters>;
