'use client';

import { PlayCircle, BarChart3, Edit3, Save, Loader2 } from 'lucide-react';
import { PrimaryButton } from './ui/buttons';

/**
 * 右上角操作按钮组件
 * 包含编辑/保存切换、周打标、月分析按钮
 */
interface TopActionButtonsProps {
  /** 当前是否为编辑模式 */
  isEditing: boolean;
  /** 切换到编辑模式 */
  onEdit: () => void;
  /** 保存所有配置 */
  onSave: () => void;
  /** 手动触发周打标 */
  onWeeklyTagging: () => void;
  /** 手动触发月分析 */
  onMonthlyAnalysis: () => void;
  /** 保存按钮 loading 状态 */
  isSaving: boolean;
  /** 周打标按钮 loading 状态 */
  isWeeklyTagging: boolean;
  /** 月分析按钮 loading 状态 */
  isMonthlyAnalysis: boolean;
}

export function TopActionButtons({
  isEditing,
  onEdit,
  onSave,
  onWeeklyTagging,
  onMonthlyAnalysis,
  isSaving,
  isWeeklyTagging,
  isMonthlyAnalysis,
}: TopActionButtonsProps) {
  return (
    <div className="flex items-center gap-3">
      {/* 周打标按钮 - 始终显示，独立 loading */}
      <PrimaryButton
        onClick={onWeeklyTagging}
        loading={isWeeklyTagging}
        disabled={isSaving || isWeeklyTagging || isMonthlyAnalysis}
        icon={<PlayCircle className="h-4 w-4" />}
        className="bg-blue-600 hover:bg-blue-700"
      >
        开始周打标
      </PrimaryButton>

      {/* 月分析按钮 - 始终显示，独立 loading */}
      <PrimaryButton
        onClick={onMonthlyAnalysis}
        loading={isMonthlyAnalysis}
        disabled={isSaving || isWeeklyTagging || isMonthlyAnalysis}
        icon={<BarChart3 className="h-4 w-4" />}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        开始月分析
      </PrimaryButton>

      {/* 编辑/保存按钮 - 互斥显示 */}
      {isEditing ? (
        <PrimaryButton
          onClick={onSave}
          loading={isSaving}
          disabled={isSaving || isWeeklyTagging || isMonthlyAnalysis}
          icon={isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {isSaving ? '保存中...' : '保存'}
        </PrimaryButton>
      ) : (
        <PrimaryButton
          onClick={onEdit}
          disabled={isSaving || isWeeklyTagging || isMonthlyAnalysis}
          icon={<Edit3 className="h-4 w-4" />}
          className="bg-slate-600 hover:bg-slate-700"
        >
          编辑
        </PrimaryButton>
      )}
    </div>
  );
}
