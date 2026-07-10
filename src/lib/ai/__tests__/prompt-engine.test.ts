/**
 * Prompt 模板引擎测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 先 mock index.ts 中的 AI 调用，避免真实调用和路径解析问题
vi.mock('../index', () => ({
  chatCompletion: vi.fn(),
  chatCompletionJSONSafe: vi.fn(),
}));

import {
  renderPrompt,
  renderSecurePrompt,
  getTemplateVersion,
  clearTemplateCache,
  TEMPLATE_NAMES,
} from '../prompt-engine';
import { generateBatchTaggingPrompt } from '../prompts';
import { CONSTITUTIONAL_REFUSAL } from '../security';

describe('Prompt 模板引擎', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  describe('批量打标模板', () => {
    it('应该正确渲染反馈和标签列表', () => {
      const prompt = renderPrompt(TEMPLATE_NAMES.BATCH_TAGGING, {
        feedbackCount: 2,
        feedbacks: [
          { id: '1', source: 'app', score: 1, content: '打卡失败' },
          { id: '2', source: 'web', score: 3, content: '页面加载慢' },
        ],
        tag1List: ['Bug', '体验优化'],
        tag2List: ['打卡模块', '性能问题'],
        tag3List: ['定位失败', '加载超时'],
        confidenceThreshold: 0.8,
      });

      expect(prompt).toContain('批量分析2条用户反馈');
      expect(prompt).toContain('#1 [app] [1分] 打卡失败');
      expect(prompt).toContain('#2 [web] [3分] 页面加载慢');
      expect(prompt).toContain('Bug, 体验优化');
      expect(prompt).toContain('打卡模块, 性能问题');
      expect(prompt).toContain('定位失败, 加载超时');
    });

    it('应该自动转义 HTML/JS 特殊字符', () => {
      const prompt = renderPrompt(TEMPLATE_NAMES.BATCH_TAGGING, {
        feedbackCount: 1,
        feedbacks: [
          { id: '1', source: 'app', score: 1, content: '<script>alert("xss")</script>' },
        ],
        tag1List: ['Bug'],
        tag2List: ['安全'],
        tag3List: ['XSS'],
        confidenceThreshold: 0.8,
      });

      expect(prompt).not.toContain('<script>');
      expect(prompt).toContain('&lt;script&gt;');
      expect(prompt).toContain('alert(&quot;xss&quot;)');
    });
  });

  describe('标签进化模板', () => {
    it('应该正确渲染业务数据 JSON', () => {
      const context = {
        mode: '全量分析模式',
        globalTagReference: {
          tag1: [{ tagId: 't1', name: 'Bug', definition: '缺陷' }],
          tag2: [{ tagId: 't2', name: '打卡', definition: '打卡功能' }],
          tag3: [{ tagId: 't3', name: '定位失败', definition: '定位问题' }],
        },
        analysisData: {
          tag3List: [
            { tagId: 't3', name: '定位失败', definition: '', parentTag2: 't2', usageCount: 5, samples: ['定位不准'] },
          ],
          tag2List: [
            { tagId: 't2', name: '打卡', definition: '', usageCount: 10, tag3Ids: ['t3'], totalFeedbacks: 10 },
          ],
        },
      };

      const prompt = renderPrompt(TEMPLATE_NAMES.TAG_EVOLUTION, context);

      expect(prompt).toContain('全量分析模式');
      expect(prompt).toContain('"tagId": "t1"');
      expect(prompt).toContain('"name": "打卡"');
      expect(prompt).toContain('定位不准');
    });
  });

  describe('意图识别模板', () => {
    it('应该正确渲染用户问题', () => {
      const prompt = renderPrompt(TEMPLATE_NAMES.INTENT_RECOGNITION, {
        question: 'NPS总体情况如何？',
      });

      expect(prompt).toContain('NPS总体情况如何？');
      expect(prompt).toContain('nps_overview');
    });
  });

  describe('回答生成模板', () => {
    it('应该正确渲染查询结果', () => {
      const prompt = renderPrompt(TEMPLATE_NAMES.ANSWER_GENERATION, {
        question: 'NPS多少分？',
        summary: '共100条反馈，NPS得分50',
        dataJson: '{"total":100,"npsScore":50}',
      });

      expect(prompt).toContain('NPS多少分？');
      expect(prompt).toContain('共100条反馈，NPS得分50');
      expect(prompt).toContain('{"total":100,"npsScore":50}');
    });
  });

  describe('安全包装', () => {
    it('应该在 Prompt 后追加拒绝声明', () => {
      const prompt = renderSecurePrompt(
        TEMPLATE_NAMES.INTENT_RECOGNITION,
        { question: '测试' },
        CONSTITUTIONAL_REFUSAL
      );

      expect(prompt).toContain(CONSTITUTIONAL_REFUSAL);
    });
  });

  describe('版本号', () => {
    it('应该从模板注释中提取版本号', () => {
      const version = getTemplateVersion(TEMPLATE_NAMES.BATCH_TAGGING);
      expect(version).toBe('2.0.0');
    });
  });

  describe('与旧 Prompt 接口兼容', () => {
    it('generateBatchTaggingPrompt 输出应包含核心字段和结构', () => {
      const prompt = generateBatchTaggingPrompt(
        [{ id: '1', content: '打卡失败', score: 1, source: 'app', unsatisfactoryReason: '' }],
        ['Bug'],
        ['打卡模块'],
        ['定位失败'],
        0.8
      );

      expect(prompt).toContain('批量分析1条用户反馈');
      expect(prompt).toContain('打卡失败');
      expect(prompt).toContain('Bug');
      expect(prompt).toContain('"results"');
    });
  });
});
