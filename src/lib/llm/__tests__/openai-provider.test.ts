/**
 * OpenAIProvider 单元测试
 * 覆盖流式调用 chatStream 的 SSE 输出与取消逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 在所有导入之前 mock openai SDK
vi.mock('openai', () => ({
  default: vi.fn(),
}));

import OpenAI from 'openai';
import { OpenAIProvider } from '../openai-provider';

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

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chatStream', () => {
    it('应将 SDK 流式输出转换为 SSE 格式', async () => {
      // 模拟 OpenAI SDK 返回的异步迭代器
      async function* mockStream(): AsyncIterable<{
        choices: Array<{ delta: { content?: string } }>;
      }> {
        yield { choices: [{ delta: { content: '你' } }] };
        yield { choices: [{ delta: { content: '好' } }] };
      }

      const createMock = vi.fn().mockResolvedValue(mockStream());

      vi.mocked(OpenAI).mockImplementation(
        function () {
          return {
            chat: {
              completions: {
                create: createMock,
              },
            },
          } as unknown as OpenAI;
        }
      );

      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const stream = await provider.chatStream([
        { role: 'user', content: 'hello' },
      ]);
      const text = await readStreamToText(stream);

      expect(text).toContain('data: {"content":"你"}\n\n');
      expect(text).toContain('data: {"content":"好"}\n\n');
      expect(text).toContain('data: {"done":true}\n\n');

      // 校验 SDK 调用参数
      expect(createMock).toHaveBeenCalledTimes(1);
      const [body, options] = createMock.mock.calls[0] as [
        Record<string, unknown>,
        { signal?: AbortSignal }
      ];
      expect(body.model).toBe('gpt-4o');
      expect(body.stream).toBe(true);
      expect(body.temperature).toBe(0.3);
      expect(options.signal).toBeUndefined();
    });

    it('应透传 temperature、maxTokens 与 abortSignal', async () => {
      async function* mockStream(): AsyncIterable<{
        choices: Array<{ delta: { content?: string } }>;
      }> {
        yield { choices: [{ delta: { content: 'ok' } }] };
      }

      const createMock = vi.fn().mockResolvedValue(mockStream());

      vi.mocked(OpenAI).mockImplementation(
        function () {
          return {
            chat: {
              completions: {
                create: createMock,
              },
            },
          } as unknown as OpenAI;
        }
      );

      const controller = new AbortController();
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      await provider.chatStream(
        [{ role: 'user', content: 'hi' }],
        { temperature: 0.7, maxTokens: 100, abortSignal: controller.signal }
      );

      const [body, options] = createMock.mock.calls[0] as [
        Record<string, unknown>,
        { signal?: AbortSignal }
      ];
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(100);
      expect(options.signal).toBe(controller.signal);
    });

    it('应忽略内容为空的 delta 块', async () => {
      async function* mockStream(): AsyncIterable<{
        choices: Array<{ delta: { content?: string } }>;
      }> {
        yield { choices: [{ delta: { content: '' } }] };
        yield { choices: [{ delta: { content: '仅这一句' } }] };
      }

      const createMock = vi.fn().mockResolvedValue(mockStream());

      vi.mocked(OpenAI).mockImplementation(
        function () {
          return {
            chat: {
              completions: {
                create: createMock,
              },
            },
          } as unknown as OpenAI;
        }
      );

      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      const stream = await provider.chatStream([
        { role: 'user', content: 'hello' },
      ]);
      const text = await readStreamToText(stream);

      expect(text).not.toContain('data: {"content":""}');
      expect(text).toContain('data: {"content":"仅这一句"}');
      expect(text).toContain('data: {"done":true}');
    });
  });
});
