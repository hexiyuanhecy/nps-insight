/**
 * SSE（Server-Sent Events）流式工具函数
 * 统一封装 SSE 编码、字符串流包装和数据块解析
 */

/** SSE 消息前缀 */
const SSE_PREFIX = 'data: ';

/** SSE 消息结束符 */
const SSE_SUFFIX = '\n\n';

/** 全局 TextEncoder 实例，避免重复创建 */
const ENCODER = new TextEncoder();

/**
 * 将任意数据编码为单条 SSE 消息字节流
 * @param data 待编码的数据，会被 JSON 序列化
 * @returns SSE 格式对应的 Uint8Array
 */
export function encodeSSE(data: unknown): Uint8Array {
  return ENCODER.encode(`${SSE_PREFIX}${JSON.stringify(data)}${SSE_SUFFIX}`);
}

/**
 * 将字符串异步迭代器包装为 SSE 字节流
 * 每个字符串会作为 { content: string } 发出，迭代结束后发送 { done: true }
 * @param textStream 字符串异步迭代器
 * @returns SSE 格式的 ReadableStream
 */
export function createSSEStream(textStream: AsyncIterable<string>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        // 遍历字符串流，逐个包装为 SSE 消息
        for await (const text of textStream) {
          controller.enqueue(encodeSSE({ content: text }));
        }
        // 发送结束标记后关闭流
        controller.enqueue(encodeSSE({ done: true }));
        controller.close();
      } catch (error) {
        // 将迭代过程中的错误传递给 ReadableStream
        controller.error(error);
      }
    },
  });
}

/**
 * 解析 SSE 数据块，提取其中的 data 字段
 * @param chunk SSE 原始文本块，可能包含多条完整消息
 * @returns 解析出的 data 字符串数组
 */
export function parseSSEChunk(chunk: string): Array<{ data: string }> {
  const messages: Array<{ data: string }> = [];

  // SSE 消息以 \n\n 分隔，先按分隔符拆分成独立消息
  const rawMessages = chunk.split(SSE_SUFFIX);

  for (const raw of rawMessages) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }

    // 在单条消息中查找以 "data: " 开头的行
    const dataLine = trimmed.split('\n').find((line) => line.startsWith(SSE_PREFIX));
    if (dataLine) {
      messages.push({ data: dataLine.slice(SSE_PREFIX.length) });
    }
  }

  return messages;
}
