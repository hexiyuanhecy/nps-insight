#!/usr/bin/env python3
"""
批量 AI 打标测试脚本
测试 AgnesAI 对 10 条模拟数据的打标效果
"""

import json
import subprocess
import re
import time

API_KEY = os.environ.get('LLM_API_KEY', '')
API_URL = "https://apihub.agnes-ai.com/v1/chat/completions"

SYSTEM_PROMPT = """你是一个专业的用户反馈分析助手。请根据反馈内容提取Tag1/Tag2/Tag3标签。

Tag1必须从以下7类中选择：疑似Bug、功能优化、界面改进、性能提升、用户教育、安全、无效。
Tag2是功能模块，Tag3是具体问题。

输出严格JSON格式：{"tag1":"","tag2":"","tag3":""}"""

def call_agnesai(module, score, content):
    """调用 AgnesAI API"""
    user_prompt = f"功能模块：{module}\n评分：{score}分\n反馈内容：{content}\n\n请只输出JSON格式结果。"
    
    payload = {
        "model": "agnes-2.0-flash",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 200
    }
    
    result = subprocess.run([
        'curl', '-s', '-X', 'POST', API_URL,
        '-H', 'Content-Type: application/json',
        '-H', f'Authorization: Bearer {API_KEY}',
        '-d', json.dumps(payload)
    ], capture_output=True, text=True)
    
    try:
        response = json.loads(result.stdout)
        ai_content = response['choices'][0]['message']['content']
        # 提取 JSON
        json_match = re.search(r'\{[^}]+\}', ai_content)
        if json_match:
            return json.loads(json_match.group())
        return None
    except Exception as e:
        print(f"  API 错误: {str(e)[:50]}")
        return None

def main():
    print("========================================")
    print("NPS Insight - AgnesAI 批量打标测试")
    print("========================================\n")
    
    # 步骤 1：获取模拟数据
    print("【步骤 1】获取 10 条模拟数据...")
    result = subprocess.run([
        'curl', '-s', 'http://localhost:3001/api/mock/feedbacks?page=1&pageSize=10'
    ], capture_output=True, text=True)
    
    try:
        data = json.loads(result.stdout)
        items = data['data']['list']
        print(f"✓ 成功获取 {len(items)} 条数据\n")
    except Exception as e:
        print(f"✗ 获取数据失败: {e}")
        return
    
    # 步骤 2：批量打标
    print("【步骤 2】AI 批量打标...")
    print("-" * 80)
    
    success_count = 0
    tag1_distribution = {}
    
    for i, item in enumerate(items):
        content = item['content']
        module = item['module']
        score = item['score']
        
        print(f"\n{i+1}. [{score}分] {content}")
        print(f"   模块: {module}")
        
        tags = call_agnesai(module, score, content)
        
        if tags:
            tag1 = tags.get('tag1', '')
            tag2 = tags.get('tag2', '')
            tag3 = tags.get('tag3', '')
            print(f"   → Tag1: {tag1}")
            print(f"   → Tag2: {tag2}")
            print(f"   → Tag3: {tag3}")
            success_count += 1
            tag1_distribution[tag1] = tag1_distribution.get(tag1, 0) + 1
        else:
            print(f"   → [打标失败]")
        
        # 避免请求过快
        time.sleep(0.5)
    
    # 步骤 3：统计结果
    print("\n" + "=" * 80)
    print("【步骤 3】统计结果")
    print("-" * 80)
    print(f"总数据: {len(items)} 条")
    print(f"成功打标: {success_count} 条")
    print(f"成功率: {success_count/len(items)*100:.1f}%")
    
    print("\nTag1 分布:")
    for tag, count in sorted(tag1_distribution.items(), key=lambda x: -x[1]):
        percentage = count / success_count * 100
        bar = "█" * int(percentage / 5)
        print(f"  {tag:12s} {count:3d}条 ({percentage:5.1f}%) {bar}")
    
    print("\n========================================")
    print("测试完成！")
    print("========================================")

if __name__ == "__main__":
    main()
