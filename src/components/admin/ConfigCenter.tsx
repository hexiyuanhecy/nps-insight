/**
 * 配置中心组件 v6
 * 三个 Tab：飞书配置 / 数据源 / 打标与分析配置
 * 右上角有编辑/保存按钮和周打标/月分析按钮
 */

'use client';

import { Database, Loader2, Settings, Sparkles, User } from 'lucide-react';
import { DatasourceTab } from '@/components/admin/config-center/DatasourceTab';
import { FeishuTab } from '@/components/admin/config-center/FeishuTab';
import { TaggingTab } from '@/components/admin/config-center/TaggingTab';
import { ProfileTab } from '@/components/admin/config-center/ProfileTab';
import { TopActionButtons } from '@/components/admin/config-center/TopActionButtons';
import { useConfigCenter } from '@/components/admin/config-center/use-config-center';
import { ToastStack } from '@/components/admin/config-center/ui';
import type { ConfigTabKey } from '@/components/admin/config-center/types';
import { CONFIG_TAB_META } from '@/constants/config-center';

const TAB_ICONS: Record<ConfigTabKey, React.ReactNode> = {
  feishu: <Settings className="h-4 w-4" />,
  datasource: <Database className="h-4 w-4" />,
  tagging: <Sparkles className="h-4 w-4" />,
  profile: <User className="h-4 w-4" />,
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

      {/* 页面标题栏 + 右上角操作按钮 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">配置中心</h1>
        <TopActionButtons
          config={ctrl.config}
          onWeeklyTagging={ctrl.runWeeklyTagging}
          onMonthlyAnalysis={ctrl.runMonthlyAnalysis}
          isWeeklyTagging={ctrl.isWeeklyTagging}
          isMonthlyAnalysis={ctrl.isMonthlyAnalysis}
        />
      </div>

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

      {ctrl.activeTab === 'feishu' && <FeishuTab ctrl={ctrl} />}
      {ctrl.activeTab === 'datasource' && <DatasourceTab ctrl={ctrl} />}
      {ctrl.activeTab === 'tagging' && <TaggingTab ctrl={ctrl} />}
      {ctrl.activeTab === 'profile' && <ProfileTab ctrl={ctrl} />}
    </div>
  );
}
