'use client';

import { PlayCircle, BarChart3, Loader2 } from 'lucide-react';
import { PrimaryButton } from './ui/buttons';
import { useCanRunTasks } from '@/components/admin/config-center/use-can-run-tasks';
import type { TabConfig } from '@/components/admin/config-center/types';

/**
 * 右上角操作按钮组件
 * 包含周打标、月分析按钮
 */
interface TopActionButtonsProps {
  /** 当前配置 */
  config: TabConfig | null;
  /** 手动触发周打标 */
  onWeeklyTagging: () => void;
  /** 手动触发月分析 */
  onMonthlyAnalysis: () => void;
  /** 周打标按钮 loading 状态 */
  isWeeklyTagging: boolean;
  /** 月分析按钮 loading 状态 */
  isMonthlyAnalysis: boolean;
}

export function TopActionButtons({
  config,
  onWeeklyTagging,
  onMonthlyAnalysis,
  isWeeklyTagging,
  isMonthlyAnalysis,
}: TopActionButtonsProps) {
  // 判断任务是否可运行
  const { canRun, missingItems } = useCanRunTasks(config);
  // 禁用提示文本
  const disabledTip = missingItems.length > 0 ? `缺少配置：${missingItems.join('、')}` : '';
  // 运行中禁用提示
  const runningTip = isWeeklyTagging ? '周打标进行中...' : isMonthlyAnalysis ? '月分析进行中...' : '';

  return (
    <div className="flex items-center gap-3">
      {/* 周打标按钮 - 配置不完整时禁用 */}
      <PrimaryButton
        onClick={onWeeklyTagging}
        loading={isWeeklyTagging}
        disabled={!canRun || isWeeklyTagging || isMonthlyAnalysis}
        icon={<PlayCircle className="h-4 w-4" />}
        className={`bg-blue-600 hover:bg-blue-700 ${!canRun ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={!canRun ? disabledTip : runningTip || undefined}
      >
        开始周打标
      </PrimaryButton>

      {/* 月分析按钮 - 配置不完整时禁用 */}
      <PrimaryButton
        onClick={onMonthlyAnalysis}
        loading={isMonthlyAnalysis}
        disabled={!canRun || isWeeklyTagging || isMonthlyAnalysis}
        icon={<BarChart3 className="h-4 w-4" />}
        className={`bg-emerald-600 hover:bg-emerald-700 ${!canRun ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={!canRun ? disabledTip : runningTip || undefined}
      >
        开始月分析
      </PrimaryButton>
    </div>
  );
}
