/**
 * 智能问答页面
 * 基于 SSE 流式对话的 NPS Insight 聊天界面
 */

'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { BarChart3, MessageSquare, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useChatStream } from '@/components/chat/useChatStream';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ChatInput } from '@/components/chat/ChatInput';

// ============================================
// 状态显示映射
// ============================================

/** 状态标签配置 */
const STATUS_CONFIG: Record<
  ReturnType<typeof useChatStream>['status'],
  { text: string; icon: React.ReactNode; className: string } | null
> = {
  idle: null,
  streaming: {
    text: '生成中...',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-blue-50 text-blue-700',
  },
  reconnecting: {
    text: '连接中...',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-amber-50 text-amber-700',
  },
  cancelled: {
    text: '已取消',
    icon: <span className="h-3.5 w-3.5 rounded-full bg-slate-400" />,
    className: 'bg-slate-100 text-slate-600',
  },
  error: {
    text: '发生错误',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-50 text-red-700',
  },
};

// ============================================
// 页面组件
// ============================================

/**
 * 智能问答页面
 */
export default function ChatPage(): React.ReactElement {
  const { messages, status, error, sendMessage, cancel } = useChatStream();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 消息更新时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* 顶部导航栏 */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">NPS Insight 智能问答</h1>
              <p className="text-xs text-slate-500">基于 feelgood 反馈数据的 AI 助手</p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>
      </header>

      {/* 消息区 */}
      <main
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto max-w-4xl space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                <MessageSquare className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-slate-900">有什么可以帮您？</h2>
              <p className="mb-6 max-w-md text-sm text-slate-500">
                我可以帮您查询 NPS 反馈数据、分析评分分布、识别 TOP 问题等。
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'NPS总体情况如何？',
                  '最近有什么反馈？',
                  '评分分布怎么样？',
                  '最多问题是什么？',
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => sendMessage(example)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* 状态指示器 */}
          {statusConfig && (
            <div className="flex justify-center">
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${statusConfig.className}`}
              >
                {statusConfig.icon}
                {statusConfig.text}
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {status === 'error' && error && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* 输入区 */}
      <ChatInput status={status} onSend={sendMessage} onCancel={cancel} />
    </div>
  );
}
