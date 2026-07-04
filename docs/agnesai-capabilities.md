# AgnesAI API 能力文档

## 概述

本文档记录 AgnesAI API 在 NPS Insight 项目中的可用能力，基于实际测试结果。

## 测试环境

- **Base URL**: `https://apihub.agnes-ai.com/v1`
- **模型**: `agnes-2.0-flash`
- **测试日期**: 2026-07-04

## 支持的能力

### 1. 基础聊天

**支持状态**: ✅ 通过

**说明**: 标准文本对话，返回纯文本响应。

**请求示例**:
```typescript
await client.chat.completions.create({
  model: 'agnes-2.0-flash',
  messages: [{ role: 'user', content: '你好' }],
});
```

---

### 2. JSON Object 模式

**支持状态**: ✅ 通过

**说明**: 强制模型返回合法 JSON 对象。

**请求示例**:
```typescript
await client.chat.completions.create({
  model: 'agnes-2.0-flash',
  messages: [{ role: 'user', content: '分析反馈并返回 JSON' }],
  response_format: { type: 'json_object' },
});
```

**响应示例**:
```json
{
  "tag1": "用户体验",
  "tag2": ["易用性", "学习成本"],
  "tag3": ["功能复杂", "操作困难"],
  "confidence": 0.95
}
```

---

### 3. JSON Schema 模式（严格结构化输出）

**支持状态**: ✅ 通过

**说明**: 指定 JSON Schema，模型返回严格符合 schema 的数据，包括枚举约束、类型校验等。

**请求示例**:
```typescript
await client.chat.completions.create({
  model: 'agnes-2.0-flash',
  messages: [{ role: 'user', content: '分析反馈' }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'feedback_analysis',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          tag1: { 
            type: 'string', 
            enum: ['疑似Bug', '功能优化', '界面改进', '性能提升', '用户教育', '安全合规', '无效反馈'] 
          },
          tag2: { type: 'array', items: { type: 'string' } },
          tag3: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['tag1', 'tag2', 'tag3', 'confidence'],
        additionalProperties: false,
      },
    },
  },
});
```

**响应示例**:
```json
{
  "tag1": "功能优化",
  "tag2": ["用户体验", "可用性"],
  "tag3": ["降低学习成本", "简化操作流程", "增加引导提示"],
  "confidence": 0.95
}
```

**优势**:
- 一次调用直接返回符合 schema 的 JSON
- 严格校验字段类型和枚举值
- 不需要重试，减少 token 消耗和延迟
- 替代当前项目中 Zod + 重试的方案

---

### 4. 工具调用（Function Calling）

**支持状态**: ✅ 通过

**说明**: 模型可以调用工具函数，返回 `tool_calls` 数组。

**请求示例**:
```typescript
await client.chat.completions.create({
  model: 'agnes-2.0-flash',
  messages: [{ role: 'user', content: '查询最近的标签统计数据' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_tag_statistics',
        description: '获取标签统计数据',
        parameters: {
          type: 'object',
          properties: {
            tagType: { type: 'string', enum: ['tag1', 'tag2', 'tag3'] },
            dateRange: { type: 'string', enum: ['week', 'month'] },
          },
          required: ['tagType', 'dateRange'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_new_tag',
        description: '创建新标签',
        parameters: {
          type: 'object',
          properties: {
            tagName: { type: 'string' },
            tagLevel: { type: 'integer', enum: [1, 2, 3] },
            parentTag: { type: 'string' },
          },
          required: ['tagName', 'tagLevel'],
        },
      },
    },
  ],
  tool_choice: 'auto',
});
```

**响应示例**:
```json
{
  "role": "assistant",
  "tool_calls": [
    {
      "function": {
        "arguments": "{\"dateRange\": \"week\", \"tagType\": \"tag1\"}",
        "name": "get_tag_statistics"
      },
      "id": "chatcmpl-tool-xxx",
      "type": "function"
    }
  ],
  "content": null
}
```

**优势**:
- 打标时可以查询已有标签库
- 自动创建新标签（Tag2/Tag3）
- 模型根据需求自动选择调用工具还是直接回答
- 替代纯文本 Prompt 方式，提高标签一致性

---

### 5. 流式输出

**支持状态**: ✅ 通过

**说明**: 支持 Server-Sent Events 流式输出。

**请求示例**:
```typescript
const stream = await client.chat.completions.create({
  model: 'agnes-2.0-flash',
  messages: [{ role: 'user', content: '介绍 NPS 指标' }],
  stream: true,
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  // 处理流式内容
}
```

---

## 与 OpenAI API 的兼容性

AgnesAI API 兼容 OpenAI 风格接口：

| 特性 | AgnesAI | OpenAI | 兼容性 |
|------|---------|--------|--------|
| 基础聊天 | ✅ | ✅ | 完全兼容 |
| JSON Object | ✅ | ✅ | 完全兼容 |
| JSON Schema | ✅ | ✅ | 完全兼容 |
| 工具调用 | ✅ | ✅ | 完全兼容 |
| 流式输出 | ✅ | ✅ | 完全兼容 |

## 迁移建议

### 1. 打标流程优化

**当前方案**: Zod 解析 + 重试机制（最多 3 次）
**新方案**: JSON Schema 结构化输出（一次调用）

**收益**:
- 减少 2/3 的 AI 调用次数
- 降低 token 消耗
- 缩短打标延迟
- 提高输出格式稳定性

### 2. 标签管理优化

**当前方案**: 纯文本 Prompt，模型凭空生成标签
**新方案**: 工具调用，模型查询/创建标签

**收益**:
- 标签一致性提高
- 避免重复创建相似标签
- 支持动态扩展标签库

### 3. 用户画像集成

**方案**: 将用户反馈特征签名注入到打标 Prompt 中

**收益**:
- 更精准的打标
- 个性化的处理建议
- 预测性问题预警

## 注意事项

1. **schema 定义**: 使用 JSON Schema 时，`strict: true` 会强制模型严格遵守枚举值
2. **工具调用参数**: `arguments` 字段返回的是 JSON 字符串，需要 `JSON.parse` 解析
3. **模型选择**: 测试使用 `agnes-2.0-flash`，其他模型的能力需要单独验证
4. **token 消耗**: JSON Schema 模式可能比普通对话消耗更多 token，需要监控