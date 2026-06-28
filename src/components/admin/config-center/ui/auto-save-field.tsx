'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// 自动保存字段组件的属性定义
interface AutoSaveFieldProps {
  // 字段路径，用于构建增量配置对象，例如 'feishu.appId'
  fieldPath: string;
  // 当前字段值
  value: unknown;
  // 保存函数，传入增量配置对象
  onSave: (partialConfig: Record<string, unknown>) => Promise<void>;
  // 被包装的输入框子元素
  children: ReactNode;
  // 延迟保存时间（毫秒），默认 1000ms
  delay?: number;
}

// 保存状态类型
type SaveStatus = 'idle' | 'saving' | 'error';

/**
 * AutoSaveField 自动保存组件
 *
 * 功能：
 * - 包装现有输入框（通过 children 传入）
 * - 失焦（onBlur）后延迟 1000ms 自动调用 onSave
 * - 3种状态：idle（无显示）、saving（右侧显示loading图标）、error（右侧显示红色重试按钮）
 * - 保存成功无toast，loading消失
 * - 保存失败显示重试按钮，点击重新调用onSave
 * - 支持debounce：1s内多次修改合并为一次请求
 */
export function AutoSaveField({
  fieldPath,
  value,
  onSave,
  children,
  delay = 1000,
}: AutoSaveFieldProps) {
  // 保存状态
  const [status, setStatus] = useState<SaveStatus>('idle');
  // debounce 定时器引用
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新值引用（用于在定时器触发时获取最新值）
  const latestValueRef = useRef(value);
  // 上一次已保存的值引用（用于比较是否有变更）
  const lastSavedValueRef = useRef(value);

  // 同步最新值到 ref
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  /**
   * 根据 fieldPath 构建嵌套的增量配置对象
   * 例如 fieldPath='feishu.appId'，value='xxx' -> { feishu: { appId: 'xxx' } }
   */
  const buildPartialConfig = useCallback((fieldPath: string, val: unknown): Record<string, unknown> => {
    const keys = fieldPath.split('.');
    const result: Record<string, unknown> = {};
    let current = result;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (i === keys.length - 1) {
        current[key] = val;
      } else {
        current[key] = {};
        current = current[key] as Record<string, unknown>;
      }
    }
    return result;
  }, []);

  /**
   * 执行保存操作
   */
  const doSave = useCallback(async () => {
    const currentValue = latestValueRef.current;
    // ponytail: 简单值比较，复杂对象可能需要深比较，但对于配置场景够用
    if (JSON.stringify(currentValue) === JSON.stringify(lastSavedValueRef.current)) {
      return;
    }

    setStatus('saving');
    try {
      const partialConfig = buildPartialConfig(fieldPath, currentValue);
      await onSave(partialConfig);
      lastSavedValueRef.current = currentValue;
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      console.error('[AutoSaveField] 保存失败:', err);
    }
  }, [fieldPath, onSave, buildPartialConfig]);

  /**
   * 处理失焦事件，触发延迟保存
   */
  const handleBlur = useCallback(() => {
    console.log('[AutoSaveField] 失焦事件触发, fieldPath:', fieldPath, 'value:', latestValueRef.current);
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // 设置新的定时器
    debounceTimerRef.current = setTimeout(() => {
      void doSave();
    }, delay);
  }, [delay, doSave, fieldPath]);

  /**
   * 重试保存
   */
  const handleRetry = useCallback(() => {
    void doSave();
  }, [doSave]);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* 被包装的输入框区域 */}
      {/* ponytail: 用 onBlurCapture（事件捕获阶段）替代 onBlur，因为 React 合成事件中 onFocus/onBlur 不冒泡 */}
      <div className="flex-1" onBlurCapture={handleBlur}>
        {children}
      </div>
      {/* 右侧状态指示器 */}
      <div className="inline-flex items-center gap-2">
        {status === 'saving' && (
          <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
        )}
        {status === 'error' && (
          <button
            onClick={handleRetry}
            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition-colors"
            title="保存失败，点击重试"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
