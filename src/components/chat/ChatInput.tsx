/**
 * 聊天输入框组件
 * 包含多行文本框、Token 计数、发送与停止按钮
 */

import React, { useState, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { countTokens } from '@/lib/ai/token-counter';
import type { ChatStatus } from './useChatStream';

// ============================================
// 类型定义
// ============================================

/** ChatInput 组件属性 */
export interface ChatInputProps {
  /** 当前状态 */
  status: ChatStatus;
  /** 发送消息回调 */
  onSend: (content: string) => void;
  /** 停止生成回调 */
  onCancel: () => void;
}

// ============================================
// 常量配置
// ============================================

/** Token 数警告阈值 */
const TOKEN_WARNING_THRESHOLD = 8192;

/** 文本域最大行数 */
const TEXTAREA_ROWS = 3;

// ============================================
// 组件主体
// ============================================

/**
 * 聊天输入框组件
 */
export function ChatInput({ status, onSend, onCancel }: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');
  const isStreaming = status === 'streaming' || status === 'reconnecting';
  const tokenCount = countTokens(value);
  const isOverLimit = tokenCount > TOKEN_WARNING_THRESHOLD;
  const canSend = value.trim().length > 0 && !isStreaming && !isOverLimit;

  /**
   * 处理发送
   */
  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(value);
    setValue('');
  }, [canSend, onSend, value]);

  /**
   * 处理键盘事件：Enter 发送，Shift+Enter 换行
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t bg-white p-4">
      <div className="mx-auto max-w-4xl">
        <div
          className={`flex items-end gap-3 rounded-2xl border bg-white p-3 shadow-sm transition-colors ${
            isOverLimit ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200'
          }`}
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，按 Enter 发送，Shift+Enter 换行..."
            rows={TEXTAREA_ROWS}
            disabled={isStreaming}
            className="max-h-40 min-h-[80px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:bg-slate-50"
          />

          <div className="flex flex-col items-end gap-2">
            {/* Token 计数 */}
            <span
              className={`text-xs font-medium ${
                isOverLimit ? 'text-red-600' : 'text-slate-400'
              }`}
            >
              {tokenCount} tokens
            </span>

            {/* 发送 / 停止按钮 */}
            {isStreaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                停止
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Send className="h-3.5 w-3.5" />
                发送
              </button>
            )}
          </div>
        </div>

        {/* 超限提示 */}
        {isOverLimit && (
          <p className="mt-2 text-xs text-red-600">
            输入内容过长（超过 {TOKEN_WARNING_THRESHOLD} tokens），请精简后发送
          </p>
        )}
      </div>
    </div>
  );
}
