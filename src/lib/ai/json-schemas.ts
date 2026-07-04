/**
 * AI 输出结构 JSON Schema 定义
 * 用于 AgnesAI 的原生 JSON Schema 结构化输出
 * 替代 Zod + 重试方案，一次调用直接返回符合 schema 的 JSON
 */

export const TAG1_ENUM = [
  '疑似Bug',
  '功能优化',
  '界面改进',
  '性能提升',
  '用户教育',
  '安全合规',
  '无效反馈',
] as const;

export interface TaggingItem {
  id?: string;
  tag1: string[];
  tag2: string[];
  tag3: string[];
  confidence: number;
  needLogCheck: boolean;
  translatedContent: string;
}

export interface BatchTaggingResult {
  results: TaggingItem[];
}

/**
 * 单条反馈打标 JSON Schema
 * 用于 AgnesAI 的 response_format: json_schema
 */
export const TaggingItemJsonSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    tag1: {
      type: 'array',
      items: { type: 'string', enum: TAG1_ENUM },
      minItems: 1,
      maxItems: 3,
    },
    tag2: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 5,
    },
    tag3: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 5,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    needLogCheck: { type: 'boolean' },
    translatedContent: { type: 'string' },
  },
  required: ['tag1', 'tag2', 'tag3', 'confidence', 'needLogCheck', 'translatedContent'],
  additionalProperties: false,
};

/**
 * 批量反馈打标 JSON Schema
 */
export const BatchTaggingJsonSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: TaggingItemJsonSchema,
      minItems: 1,
    },
  },
  required: ['results'],
  additionalProperties: false,
};

/**
 * 标签进化 JSON Schema
 */
export const TagEvolutionJsonSchema = {
  type: 'object',
  properties: {
    tag3_opt_result: {
      type: 'object',
      properties: {
        merge_tag3: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              merge_group: { type: 'array', items: { type: 'string' } },
              retain_tag_id: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['merge_group', 'retain_tag_id', 'reason'],
          },
        },
        split_tag3_to_new_tag2: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              origin_tag2_id: { type: 'string' },
              new_tag2_list: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    new_tag2_name: { type: 'string' },
                    bind_tag3_ids: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['new_tag2_name', 'bind_tag3_ids'],
                },
              },
            },
            required: ['origin_tag2_id', 'new_tag2_list'],
          },
        },
      },
      required: ['merge_tag3', 'split_tag3_to_new_tag2'],
    },
    tag2_opt_result: {
      type: 'object',
      properties: {
        merge_tag2: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              merge_group: { type: 'array', items: { type: 'string' } },
              retain_tag_id: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['merge_group', 'retain_tag_id', 'reason'],
          },
        },
      },
      required: ['merge_tag2'],
    },
    manual_review: { type: 'array', items: { type: 'string' } },
  },
  required: ['tag3_opt_result', 'tag2_opt_result', 'manual_review'],
  additionalProperties: false,
};

/**
 * 用户画像特征签名 JSON Schema
 */
export const UserProfileJsonSchema = {
  type: 'object',
  properties: {
    ownerId: { type: 'string' },
    version: { type: 'integer' },
    createdAt: { type: 'integer' },
    lastUpdatedAt: { type: 'integer' },
    basic: {
      type: 'object',
      properties: {
        tenantScale: { type: 'string', enum: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] },
        dataSource: { type: 'string' },
        usageDays: { type: 'integer' },
        syncFrequency: { type: 'string', enum: ['day', 'week', 'month'] },
      },
      required: ['tenantScale'],
    },
    feedbackSignature: {
      type: 'object',
      properties: {
        totalFeedbacks: { type: 'integer' },
        weeklyAverage: { type: 'number' },
        scoreDistribution: {
          type: 'object',
          properties: {
            '1': { type: 'integer' },
            '2': { type: 'integer' },
            '3': { type: 'integer' },
            '4': { type: 'integer' },
            '5': { type: 'integer' },
          },
        },
        tag1Distribution: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string' },
              count: { type: 'integer' },
              percentage: { type: 'number' },
            },
            required: ['tag', 'count', 'percentage'],
          },
        },
        topTag2: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string' },
              count: { type: 'integer' },
            },
            required: ['tag', 'count'],
          },
          maxItems: 10,
        },
        topTag3: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tag: { type: 'string' },
              count: { type: 'integer' },
            },
            required: ['tag', 'count'],
          },
          maxItems: 15,
        },
      },
      required: ['totalFeedbacks', 'tag1Distribution'],
    },
    tagModelSignature: {
      type: 'object',
      properties: {
        totalTag1: { type: 'integer' },
        totalTag2: { type: 'integer' },
        totalTag3: { type: 'integer' },
        customTagRatio: { type: 'number' },
        evolutionHistory: { type: 'array', items: { type: 'integer' } },
      },
      required: ['totalTag1', 'totalTag2', 'totalTag3'],
    },
    behaviorSignature: {
      type: 'object',
      properties: {
        manualTriggerCount: { type: 'integer' },
        reviewRate: { type: 'number' },
        reportDownloadCount: { type: 'integer' },
        averageResponseTimeHours: { type: 'number' },
      },
    },
    insights: {
      type: 'object',
      properties: {
        dominantIssueType: { type: 'string' },
        improvementOpportunities: { type: 'array', items: { type: 'string' } },
        riskSignals: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['ownerId', 'version', 'createdAt', 'lastUpdatedAt', 'basic', 'feedbackSignature', 'tagModelSignature'],
  additionalProperties: false,
};