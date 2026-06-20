/**
 * 配置中心组件 v4
 * 三个 Tab：飞书与集成 / AI 模型与标签 / 任务与运营
 */

'use client';

import { Bot, Clock, Loader2, Settings } from 'lucide-react';
import { AiTagsTab } from '@/components/admin/config-center/AiTagsTab';
import { IntegrationTab } from '@/components/admin/config-center/IntegrationTab';
import { OpsTab } from '@/components/admin/config-center/OpsTab';
import { useConfigCenter } from '@/components/admin/config-center/use-config-center';
import { ToastStack } from '@/components/admin/config-center/ui';
import type { ConfigTabKey } from '@/components/admin/config-center/types';
import { CONFIG_TAB_META } from '@/constants/config-center';

const TAB_ICONS: Record<ConfigTabKey, React.ReactNode> = {
  integration: <Settings className="h-4 w-4" />,
  ai: <Bot className="h-4 w-4" />,
  ops: <Clock className="h-4 w-4" />,
};

export default function ConfigCenter() {
  const ctrl = useConfigCenter();

  if (!ctrl.config) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载配置中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastStack toasts={ctrl.toasts} onDismiss={ctrl.dismissToast} />

      {/* Tab 导航 */}
      <div className="flex gap-1 border-b border-slate-200 bg-white p-1 rounded-lg overflow-x-auto">
        {CONFIG_TAB_META.map((tab) => (
          <button
            key={tab.key}
            onClick={() => ctrl.setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${ctrl.activeTab === tab.key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {TAB_ICONS[tab.key]}
            {tab.name}
          </button>
        ))}
      </div>

      {ctrl.activeTab === 'integration' && <IntegrationTab ctrl={ctrl} />}
      {ctrl.activeTab === 'ai' && <AiTagsTab ctrl={ctrl} />}
      {ctrl.activeTab === 'ops' && <OpsTab ctrl={ctrl} />}
    </div>
  );
}
