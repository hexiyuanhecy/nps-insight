/**
 * AgnesAI API 能力测试脚本
 * 
 * 测试项：
 * 1. response_format: json_object - 基础 JSON 模式
 * 2. response_format: json_schema - 严格结构化输出
 * 3. tools + tool_choice - 工具调用
 * 4. 流式输出（确认兼容性）
 */

import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.AGNESAI_API_KEY;
const BASE_URL = process.env.AGNESAI_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const MODEL = process.env.AGNESAI_MODEL || 'agnes-2.0-flash';

if (!API_KEY) {
  console.error('❌ 未设置 AGNESAI_API_KEY 环境变量');
  process.exit(1);
}

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

async function runTest(testName: string, fn: () => Promise<void>) {
  console.log(`\n=== 测试: ${testName} ===`);
  try {
    await fn();
    console.log(`✅ ${testName} 通过`);
  } catch (error) {
    console.log(`❌ ${testName} 失败:`, error instanceof Error ? error.message : error);
  }
}

async function test1BasicChat() {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: '你好，简单介绍一下自己' }],
    temperature: 0.7,
  });
  console.log('响应:', response.choices[0]?.message?.content?.substring(0, 100) + '...');
}

async function test2JsonObjectMode() {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ 
      role: 'user', 
      content: '分析这条用户反馈："这个功能太复杂了，我用了半天都没搞懂怎么用"。请返回 JSON 格式：{"tag1": "一级标签", "tag2": ["二级标签"], "tag3": ["三级标签"], "confidence": 0-1}' 
    }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });
  
  const content = response.choices[0]?.message?.content;
  console.log('原始响应:', content);
  
  try {
    const parsed = JSON.parse(content || '');
    console.log('JSON 解析成功:', parsed);
  } catch (e) {
    throw new Error('JSON 解析失败');
  }
}

async function test3JsonSchemaMode() {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ 
      role: 'user', 
      content: '分析这条用户反馈："这个功能太复杂了，我用了半天都没搞懂怎么用"。' 
    }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'feedback_analysis',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            tag1: { type: 'string', enum: ['疑似Bug', '功能优化', '界面改进', '性能提升', '用户教育', '安全合规', '无效反馈'] },
            tag2: { type: 'array', items: { type: 'string' } },
            tag3: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['tag1', 'tag2', 'tag3', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    temperature: 0,
  });
  
  const content = response.choices[0]?.message?.content;
  console.log('原始响应:', content);
  
  try {
    const parsed = JSON.parse(content || '');
    console.log('JSON 解析成功:', parsed);
  } catch (e) {
    throw new Error('JSON 解析失败');
  }
}

async function test4FunctionCalling() {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ 
      role: 'user', 
      content: '我想查询一下最近的标签统计数据。' 
    }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_tag_statistics',
          description: '获取标签统计数据',
          parameters: {
            type: 'object',
            properties: {
              tagType: { type: 'string', enum: ['tag1', 'tag2', 'tag3'], description: '标签类型' },
              dateRange: { type: 'string', enum: ['week', 'month'], description: '时间范围' },
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
              tagName: { type: 'string', description: '标签名称' },
              tagLevel: { type: 'integer', enum: [1, 2, 3], description: '标签层级' },
              parentTag: { type: 'string', description: '父标签名称（可选）' },
            },
            required: ['tagName', 'tagLevel'],
          },
        },
      },
    ],
    tool_choice: 'auto',
    temperature: 0.3,
  });
  
  const message = response.choices[0]?.message;
  console.log('响应消息:', JSON.stringify(message, null, 2));
  
  if (message?.tool_calls?.length) {
    console.log('工具调用:', message.tool_calls);
  } else {
    console.log('未触发工具调用，直接回答:', message?.content);
  }
}

async function test5Streaming() {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: '请用简短的话介绍一下 NPS 指标' }],
    stream: true,
    temperature: 0.7,
  });
  
  console.log('流式输出:');
  let fullContent = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;
    process.stdout.write(content);
  }
  console.log('\n');
}

async function main() {
  console.log('AgnesAI API 能力测试');
  console.log('模型:', MODEL);
  console.log('Base URL:', BASE_URL);
  
  await runTest('1. 基础聊天', test1BasicChat);
  await runTest('2. JSON Object 模式', test2JsonObjectMode);
  await runTest('3. JSON Schema 模式（严格结构化输出）', test3JsonSchemaMode);
  await runTest('4. 工具调用 (Function Calling)', test4FunctionCalling);
  await runTest('5. 流式输出', test5Streaming);
  
  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);