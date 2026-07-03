/**
 * SSE 流式工具函数单元测试
 * 覆盖编码、字符串流包装与数据块解析
 */

import { describe, it, expect } from 'vitest';
import { encodeSSE, createSSEStream, parseSSEChunk } from '../stream-utils';

/** 将 ReadableStream 完整读取为 UTF-8 字符串 */
async function readStreamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

describe('encodeSSE', () => {
  it('应将对象编码为 SSE 格式字节流', () => {
    const bytes = encodeSSE({ content: '你好' });
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe('data: {"content":"你好"}\n\n');
  });

  it('应支持 done 结束标记编码', () => {
    const bytes = encodeSSE({ done: true });
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe('data: {"done":true}\n\n');
  });
});

describe('createSSEStream', () => {
  it('应将字符串异步迭代器包装为 SSE 流并自动追加结束标记', async () => {
    async function* generateText(): AsyncGenerator<string> {
      yield '你';
      yield '好';
    }

    const stream = createSSEStream(generateText());
    const text = await readStreamToText(stream);

    expect(text).toContain('data: {"content":"你"}\n\n');
    expect(text).toContain('data: {"content":"好"}\n\n');
    expect(text).toContain('data: {"done":true}\n\n');
  });

  it('空字符串流也应正常输出结束标记', async () => {
    async function* generateNothing(): AsyncGenerator<string> {
      return;
    }

    const stream = createSSEStream(generateNothing());
    const text = await readStreamToText(stream);

    expect(text).toBe('data: {"done":true}\n\n');
  });
});

describe('parseSSEChunk', () => {
  it('应解析包含多条完整 SSE 消息的数据块', () => {
    const chunk = 'data: {"content":"a"}\n\ndata: {"content":"b"}\n\n';
    const messages = parseSSEChunk(chunk);

    expect(messages).toEqual([
      { data: '{"content":"a"}' },
      { data: '{"content":"b"}' },
    ]);
  });

  it('应忽略不含 data 字段的行', () => {
    const chunk = 'event: message\ndata: {"content":"x"}\n\n';
    const messages = parseSSEChunk(chunk);

    expect(messages).toEqual([{ data: '{"content":"x"}' }]);
  });

  it('空数据块应返回空数组', () => {
    expect(parseSSEChunk('')).toEqual([]);
    expect(parseSSEChunk('\n\n')).toEqual([]);
  });
});
