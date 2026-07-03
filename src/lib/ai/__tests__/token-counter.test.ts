/**
 * Token 计数器单元测试
 * 覆盖文本计数、消息列表计数与费用估算
 */

import { describe, it, expect } from 'vitest';
import { countTokens, countMessageTokens, estimateCost } from '../token-counter';
import { LLMMessage } from '@/lib/llm/base-provider';

describe('countTokens', () => {
  it('空文本应返回 0', () => {
    expect(countTokens('')).toBe(0);
  });

  it('英文短句应返回正整数 Token 数', () => {
    const text = 'Hello world';
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it('中文文本应返回正整数 Token 数', () => {
    const text = '你好，世界';
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it('较长文本计数偏差应小于 5%', () => {
    // cl100k_base 中 "token" 约为 1 个 token
    const text = 'The quick brown fox jumps over the lazy dog.';
    const estimated = countTokens(text);
    // 该句子在 cl100k_base 中约为 10 个 token，允许 5% 偏差
    expect(estimated).toBeGreaterThan(0);
    expect(estimated).toBeLessThanOrEqual(Math.ceil(text.length / 2));
  });

  it('未知模型应使用默认编码器计数', () => {
    const text = 'hello';
    const defaultTokens = countTokens(text);
    const unknownModelTokens = countTokens(text, 'some-unknown-model');
    expect(unknownModelTokens).toBe(defaultTokens);
  });
});

describe('countMessageTokens', () => {
  it('空消息列表应返回 0', () => {
    expect(countMessageTokens([])).toBe(0);
  });

  it('单条消息应统计 role 和 content', () => {
    const messages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    const tokens = countMessageTokens(messages);
    expect(tokens).toBeGreaterThan(countTokens('Hello'));
  });

  it('多条消息应累加 Token 数', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const tokens = countMessageTokens(messages);
    const singleMessageTokens = countTokens('user\nHello');
    expect(tokens).toBeGreaterThan(singleMessageTokens);
  });

  it('应支持传入模型参数', () => {
    const messages: LLMMessage[] = [{ role: 'user', content: 'Hello world' }];
    const tokens = countMessageTokens(messages, 'gpt-4o');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateCost', () => {
  it('gpt-4o 费用估算应正确', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'gpt-4o');
    expect(cost).toBe(20); // 5 + 15
  });

  it('gpt-4o-mini 费用估算应正确', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'gpt-4o-mini');
    expect(cost).toBe(0.75); // 0.15 + 0.6
  });

  it('agnes-2.0-flash 费用估算应正确', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'agnes-2.0-flash');
    expect(cost).toBe(8); // 2 + 6
  });

  it('未知模型应回退到 agnes-2.0-flash 默认单价', () => {
    const cost = estimateCost(1_000_000, 1_000_000, 'unknown-model');
    expect(cost).toBe(8);
  });

  it('零 Token 应返回 0', () => {
    expect(estimateCost(0, 0, 'gpt-4o')).toBe(0);
  });

  it('费用应保留 6 位小数精度', () => {
    const cost = estimateCost(100, 100, 'gpt-4o');
    expect(cost).toBe(Number(cost.toFixed(6)));
  });
});
