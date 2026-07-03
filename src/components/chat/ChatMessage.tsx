/**
 * 单条聊天消息组件
 * 区分用户消息与 AI 消息气泡，支持简单 Markdown 渲染
 */

import React from 'react';
import { User, Bot } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from './useChatStream';

// ============================================
// 类型定义
// ============================================

/** ChatMessage 组件属性 */
export interface ChatMessageProps {
  /** 消息数据 */
  message: ChatMessageType;
}

// ============================================
// 简单 Markdown 渲染
// ============================================

/**
 * 解析行内格式：粗体 **text**、斜体 *text*、行内代码 `code`
 */
function parseInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  // 匹配 **粗体**、*斜体*、`行内代码`
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      result.push(<strong key={lastIndex}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      result.push(
        <code
          key={lastIndex}
          className="rounded bg-slate-100 px-1 py-0.5 text-sm text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      result.push(<em key={lastIndex}>{token.slice(1, -1)}</em>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result;
}

/**
 * 简单 Markdown 渲染组件
 * 支持段落、无序列表、有序列表、粗体、斜体、行内代码
 */
function SimpleMarkdown({ content }: { content: string }): React.ReactElement {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  const listItems: string[] = [];
  let isOrdered = false;

  /** 刷出当前累积的列表 */
  const flushList = () => {
    if (listItems.length === 0) return;

    const ListTag = isOrdered ? 'ol' : 'ul';
    const listClass = isOrdered ? 'list-decimal' : 'list-disc';
    elements.push(
      <ListTag
        key={elements.length}
        className={`${listClass} my-2 ml-5 space-y-1 text-slate-800`}
      >
        {listItems.map((item, index) => (
          <li key={index}>{parseInline(item)}</li>
        ))}
      </ListTag>
    );
    listItems.length = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushList();
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushList();
      isOrdered = false;
      listItems.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      isOrdered = true;
      listItems.push(trimmed.replace(/^\d+\.\s/, ''));
    } else {
      flushList();
      elements.push(
        <p key={elements.length} className="my-1 text-slate-800">
          {parseInline(trimmed)}
        </p>
      );
    }
  }

  flushList();

  return <>{elements}</>;
}

// ============================================
// 组件主体
// ============================================

/**
 * 单条聊天消息组件
 */
export function ChatMessage({ message }: ChatMessageProps): React.ReactElement {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      data-role={message.role}
    >
      <div
        className={`flex max-w-[85%] items-start gap-3 sm:max-w-[75%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* 头像 */}
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
            isUser ? 'bg-blue-600' : 'bg-slate-200'
          }`}
        >
          {isUser ? (
            <User className="h-4 w-4 text-white" />
          ) : (
            <Bot className="h-4 w-4 text-slate-600" />
          )}
        </div>

        {/* 气泡 */}
        <div
          className={`relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'rounded-tr-none bg-blue-600 text-white'
              : 'rounded-tl-none border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none">
              <SimpleMarkdown content={message.content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
