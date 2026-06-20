#!/usr/bin/env python3
"""
测试 NPS Insight 问答引擎
直接调用 AgnesAI API 模拟意图识别和回答生成
"""

import json
import subprocess
import os

AGNES_API_KEY = os.environ.get('LLM_API_KEY', '')
AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1"
MODEL = "agnes-2.0-flash"

def agnes_chat(messages, temperature=0.3, max_tokens=2048, json_mode=False):
    """调用 AgnesAI API"""
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    cmd = [
        "curl", "-s", "-X", "POST",
        f"{AGNES_BASE_URL}/chat/completions",
        "-H", f"Authorization: Bearer {AGNES_API_KEY}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(result.stdout)
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"API 调用失败: {e}")
        print(f"响应: {result.stdout}")
        return None

def test_intent_recognition(question):
    """测试意图识别"""
    print(f"\n{'='*60}")
    print(f"📝 问题: {question}")
    print(f"{'='*60}")

    system_prompt = """你是 NPS Insight 智能问答系统的意图识别引擎。

你的任务是将用户的自然语言问题解析为结构化的查询意图。

支持的意图类型：
- nps_overview: NPS总体概况（如"NPS多少分"、"总体情况"）
- score_distribution: 评分分布（如"各分数段分布"、"几分的人最多"）
- top_issues: TOP问题（如"最多问题是什么"、"主要抱怨"）
- recent_feedback: 最新反馈（如"最近有什么反馈"、"最新的差评"）
- tag_stats: 标签统计（如"Bug有多少"、"功能优化类反馈"）
- trend_analysis: 趋势分析（如"最近有改善吗"、"趋势如何"）
- specific_feedback: 特定反馈查询（如"关于打卡的反馈"、"定位相关"）
- help: 帮助（如"怎么用"、"能做什么"）
- unknown: 无法识别的意图

时间范围参数(timeRange)：
- today: 今天
- week: 本周/最近7天
- month: 本月/最近30天
- quarter: 本季度
- year: 本年
- all: 全部时间（默认）

评分过滤参数(scoreFilter)：
- low: 1-2分（差评）
- mid: 3分（中评）
- high: 4-5分（好评）

请严格按以下JSON格式输出，不要输出其他内容：
{
  "intent": "意图类型",
  "params": {
    "timeRange": "时间范围",
    "tagFilter": "标签过滤",
    "scoreFilter": "评分过滤",
    "limit": 数量限制,
    "keywords": ["关键词1", "关键词2"]
  },
  "confidence": 0.95
}"""

    response = agnes_chat([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ], temperature=0.1, max_tokens=512, json_mode=True)

    if response:
        try:
            intent = json.loads(response)
            print(f"🔍 意图: {intent.get('intent')}")
            print(f"📋 参数: {json.dumps(intent.get('params', {}), ensure_ascii=False)}")
            print(f"🎯 置信度: {intent.get('confidence')}")
            return intent
        except:
            print(f"⚠️ 解析失败: {response}")
    return None

def test_answer_generation(question, intent_result, mock_data_summary):
    """测试回答生成"""
    system_prompt = """你是 NPS Insight 智能问答助手，专门回答关于 feelgood 用户反馈数据的问题。

回答规则：
1. 用友好、专业的中文回答
2. 数据要准确，不要编造
3. 适当使用emoji增加可读性
4. 如果数据为空，礼貌说明暂无相关数据
5. 回答要简洁，控制在300字以内

当前是5分制NPS评分：
- 4-5分：推荐者
- 3分：被动者
- 1-2分：贬损者"""

    user_prompt = f"""用户问题：{question}

查询意图：{intent_result['intent']}
查询参数：{json.dumps(intent_result['params'], ensure_ascii=False)}

数据概况：
{mock_data_summary}

请生成自然语言回答："""

    response = agnes_chat([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ], temperature=0.5, max_tokens=1024)

    if response:
        print(f"\n🤖 回答:\n{response}")
    return response

def main():
    print("🚀 NPS Insight 问答引擎测试")

    # Mock 数据统计（基于200条模拟数据）
    mock_summary = """
总反馈数：200条
NPS得分：-40（5分制计算：推荐者(4-5分)约40条，被动者(3分)约40条，贬损者(1-2分)约120条）
平均分：约2.2分

评分分布：
- 5分：约20条
- 4分：约20条
- 3分：约40条
- 2分：约60条
- 1分：约60条

TOP问题标签：
1. 疑似Bug：约50条（打卡定位失败、点击没反应、数据丢失等）
2. 功能优化：约40条（希望支持批量打卡、弹性工作时间等）
3. 使用咨询：约30条（不了解打卡规则、不会使用外勤打卡等）
4. 安全问题：约25条（敏感信息未加密、打卡位置可伪造等）
5. 性能问题：约25条（APP耗电、页面卡顿等）
6. 其他：约30条

最近反馈（模拟最近7天）：约30条，主要是Bug反馈和功能建议。
"""

    # 测试问题列表
    test_questions = [
        "NPS总体情况如何？",
        "最近有什么Bug反馈？",
        "评分分布怎么样？",
        "1-2分的差评有哪些？",
        "最多问题是什么？",
        "这个月NPS多少分？",
    ]

    for question in test_questions:
        intent = test_intent_recognition(question)
        if intent and intent.get('confidence', 0) > 0.5:
            test_answer_generation(question, intent, mock_summary)
        print("\n" + "-"*60)

    print("\n✅ 测试完成！")

if __name__ == "__main__":
    main()
