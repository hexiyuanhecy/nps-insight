#!/bin/bash
# 测试 AgnesAI 批量打标

API_KEY="$API_KEY"
API_URL="https://apihub.agnes-ai.com/v1/chat/completions"

# 获取 10 条模拟数据
echo "【步骤 1】获取模拟数据..."
DATA=$(curl -s "http://localhost:3001/api/mock/feedbacks?page=1&pageSize=10")

echo ""
echo "【步骤 2】AI 批量打标（前 10 条）..."
echo "========================================"

# 提取前 10 条数据并打标
echo "$DATA" | python3 -c "
import json, sys
import subprocess

data = json.load(sys.stdin)
items = data['data']['list']

system_prompt = '''你是一个专业的用户反馈分析助手。请根据反馈内容提取Tag1/Tag2/Tag3标签。

Tag1必须从以下7类中选择：疑似Bug、功能优化、界面改进、性能提升、用户教育、安全、无效。
Tag2是功能模块，Tag3是具体问题。

输出严格JSON格式：{\"tag1\":\"\",\"tag2\":\"\",\"tag3\":\"\"}'''

for i, item in enumerate(items[:10]):
    content = item['content']
    module = item['module']
    score = item['score']
    
    user_prompt = f\"功能模块：{module}\\n评分：{score}分\\n反馈内容：{content}\\n\\n请只输出JSON格式结果。\"
    
    # 调用 AgnesAI
    result = subprocess.run([
        'curl', '-s', '-X', 'POST', '$API_URL',
        '-H', 'Content-Type: application/json',
        '-H', 'Authorization: Bearer $API_KEY',
        '-d', json.dumps({
            'model': 'agnes-2.0-flash',
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt}
            ],
            'temperature': 0.3,
            'max_tokens': 200
        })
    ], capture_output=True, text=True)
    
    try:
        response = json.loads(result.stdout)
        ai_content = response['choices'][0]['message']['content']
        # 提取 JSON
        import re
        json_match = re.search(r'\{[^}]+\}', ai_content)
        if json_match:
            tags = json.loads(json_match.group())
            print(f\"{i+1}. [{score}分] {content[:20]}... → Tag1: {tags.get('tag1','')} | Tag2: {tags.get('tag2','')} | Tag3: {tags.get('tag3','')}\")
        else:
            print(f\"{i+1}. [{score}分] {content[:20]}... → [解析失败] {ai_content[:50]}\")
    except Exception as e:
        print(f\"{i+1}. [{score}分] {content[:20]}... → [错误] {str(e)[:50]}\")
"

echo "========================================"
echo "批量打标测试完成！"
