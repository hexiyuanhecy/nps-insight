'use client';

import { useMemo } from 'react';
import type { TabConfig } from '@/components/admin/config-center/types';

/**
 * 判断任务是否可以运行的 hook
 * 
 * 检查所有必要配置是否齐全，全部满足才能运行任务
 * 
 * @param config - 配置中心的配置对象
 * @returns {{ canRun: boolean; missingItems: string[] }}
 *   - canRun: 是否可以运行任务
 *   - missingItems: 缺失的配置项列表（中文描述）
 */
export function useCanRunTasks(config: TabConfig | null): {
  canRun: boolean;
  missingItems: string[];
} {
  return useMemo(() => {
    if (!config) {
      return { canRun: false, missingItems: ['配置加载中'] };
    }

    const missingItems: string[] = [];

    // 1. 飞书应用已绑定
    if (!config.feishu?.appId || !config.feishu?.appSecret) {
      missingItems.push('飞书应用未绑定');
    }

    // 2. 用户已授权
    if (!config.userResource?.userOpenId) {
      missingItems.push('用户未授权');
    }

    // 3. 云资源已初始化
    if (
      !config.userResource?.rootFolderToken ||
      !config.userResource?.reportFolderToken ||
      !config.userResource?.monthFolderToken
    ) {
      missingItems.push('云资源未初始化');
    }

    // 4. 多维表格已绑定
    if (!config.bitable?.appToken) {
      missingItems.push('多维表格未绑定');
    }

    // 5. 数据源已配置（反馈API地址）
    if (!config.dataSource?.apiUrl) {
      missingItems.push('数据源未配置');
    }

    // 6. AI 模型已配置
    if (!config.ai?.apiKey || !config.ai?.model) {
      missingItems.push('AI 模型未配置');
    }

    return {
      canRun: missingItems.length === 0,
      missingItems,
    };
  }, [config]);
}
