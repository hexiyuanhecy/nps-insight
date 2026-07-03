/**
 * 流式聊天 Hook
 * 封装 SSE 连接、消息累积、断线重连和中断逻辑
 */

import { useState, useRef, useCallback } from 'react';
import { parseSSEChunk } from '@/lib/llm/stream-utils';

// ============================================
// 类型定义
// ============================================

/** 聊天消息角色 */
export type ChatRole = 'user' | 'assistant';

/** 单条聊天消息 */
export interface ChatMessage {
  /** 消息唯一标识 */
  id: string;
  /** 消息角色 */
  role: ChatRole;
  /** 消息内容 */
  content: string;
}

/** 流式聊天状态 */
export type ChatStatus = 'idle' | 'streaming' | 'reconnecting' | 'cancelled' | 'error';

/** 流式聊天 Hook 返回值 */
export interface UseChatStreamReturn {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 当前状态 */
  status: ChatStatus;
  /** 错误信息 */
  error: string | null;
  /** 发送消息 */
  sendMessage: (content: string) => Promise<void>;
  /** 取消当前流 */
  cancel: () => void;
}

// ============================================
// 常量配置
// ============================================

/** 最大重连次数 */
const MAX_RETRIES = 3;

/** 初始重连延迟（毫秒） */
const INITIAL_RETRY_DELAY = 1000;

/** 最大重连延迟（毫秒） */
const MAX_RETRY_DELAY = 30000;

/** SSE 消息分隔符 */
const SSE_SUFFIX = '\n\n';

// ============================================
// 工具函数
// ============================================

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 计算当前重连延迟 */
function getRetryDelay(attempt: number): number {
  if (attempt <= 0) return 0;
  return Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
}

/** 休眠指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Hook 实现
// ============================================

/**
 * 流式聊天 Hook
 */
export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 发送消息并启动 SSE 流式接收
   */
  const sendMessage = useCallback(async (content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    // 保存当前消息列表作为历史上下文（不包含本次用户消息）
    const history = [...messages];

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmedContent,
    };
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
    };

    // 添加用户消息与空的助手占位消息
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setStatus('streaming');
    setError(null);

    // 创建 AbortController 用于停止生成
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    /**
     * 执行单次流式请求
     */
    const attemptStream = async (attempt: number): Promise<void> => {
      try {
        // 重连时重置助手消息内容并显示重连状态
        if (attempt > 0) {
          setStatus('reconnecting');
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: '' } : msg
            )
          );
          const delay = getRetryDelay(attempt);
          await sleep(delay);
        }

        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmedContent,
            history,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: '请求失败' }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('响应流为空');
        }

        setStatus('streaming');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 解析已完整的 SSE 消息
            const parsedMessages = parseSSEChunk(buffer);

            // 保留未完整消息到下一次读取
            const lastSplitIndex = buffer.lastIndexOf(SSE_SUFFIX);
            if (lastSplitIndex !== -1) {
              buffer = buffer.slice(lastSplitIndex + SSE_SUFFIX.length);
            }

            for (const msg of parsedMessages) {
              let data: { content?: string; done?: boolean };
              try {
                data = JSON.parse(msg.data);
              } catch {
                // 忽略无法解析的数据行
                continue;
              }

              if (data.done) {
                break;
              }

              if (typeof data.content === 'string') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: m.content + data.content }
                      : m
                  )
                );
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        setStatus('idle');
      } catch (err) {
        // 用户主动取消，不视为错误
        if (abortController.signal.aborted) {
          setStatus('cancelled');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '未知错误';

        // 网络错误时进行有限次数的指数退避重连
        if (attempt < MAX_RETRIES) {
          console.warn(`[useChatStream] 第 ${attempt + 1} 次请求失败，准备重连: ${errorMessage}`);
          return attemptStream(attempt + 1);
        }

        // 超过最大重连次数，标记为错误
        console.error('[useChatStream] 流式请求失败', err);
        setError(errorMessage);
        setStatus('error');
      }
    };

    await attemptStream(0);
    abortControllerRef.current = null;
  }, [messages]);

  /**
   * 取消当前流式生成
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { messages, status, error, sendMessage, cancel };
}
