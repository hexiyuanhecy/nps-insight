#!/usr/bin/env python3
"""
将 Mock 数据写入飞书多维表格
先查看表格字段结构，再批量写入 100 条数据
"""

import json
import subprocess
import random
import re
import os
import time
import sys

# ============================================
# 配置
# ============================================
APP_ID = os.environ['FEISHU_APP_ID']
APP_SECRET = os.environ['FEISHU_APP_SECRET']
APP_TOKEN = 'CQEJbYvUza2jRVs644QcOcsSnIk'
TABLE_ID = 'tblgC4ZK0nXXH0JZ'

LLM_API_KEY = os.environ.get('LLM_API_KEY', '')
LLM_BASE_URL = 'https://apihub.agnes-ai.com/v1'
LLM_MODEL = 'agnes-2.0-flash'

BATCH_SIZE = 25

# ============================================
# 飞书 API 辅助函数
# ============================================

def get_tenant_access_token():
    """获取 tenant_access_token"""
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'app_id': APP_ID, 'app_secret': APP_SECRET})
    ], capture_output=True, text=True)
    data = json.loads(result.stdout)
    if data.get('code') == 0:
        return data['tenant_access_token']
    else:
        print(f"Token 获取失败: {data}")
        return None


def api_call(method, url, token, data=None):
    """通用飞书 API 调用"""
    cmd = ['curl', '-s', '-X', method, url, '-H', f'Authorization: Bearer {token}', '-H', 'Content-Type: application/json']
    if data:
        cmd.extend(['-d', json.dumps(data, ensure_ascii=False).encode('utf-8')])
    result = subprocess.run(cmd, capture_output=True)
    stdout = result.stdout.decode('utf-8')
    try:
        return json.loads(stdout)
    except:
        return {"raw": stdout, "code": -1}


def list_fields(token):
    """获取表格字段列表"""
    url = f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/fields'
    resp = api_call('GET', url, token)
    if resp.get('code') == 0:
        fields = resp.get('data', {}).get('fields', [])
        print(f"  当前表格有 {len(fields)} 个字段:")
        for f in fields:
            print(f"    - [{f['field_id']}] {f['field_name']} (类型: {f['type']})")
        return fields
    else:
        print(f"  获取字段失败: {resp}")
        return []


def create_field_if_missing(token, field_name, field_type):
    """如果字段不存在则创建"""
    url = f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/fields'
    resp = api_call('POST', url, token, {
        "field_name": field_name,
        "type": field_type
    })
    if resp.get('code') == 0:
        field_id = resp.get('data', {}).get('field', {}).get('field_id', '')
        print(f"  + 创建字段: {field_name} ({field_id})")
        return field_id
    elif resp.get('code') == 10001:
        # 字段已存在
        print(f"  = 字段已存在: {field_name}")
        return None
    else:
        print(f"  ! 创建字段 {field_name} 失败: code={resp.get('code')}, msg={resp.get('msg', '')}")
        return None


def batch_create_records(token, records):
    """批量写入记录（每次最多 500 条）"""
    url = f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records/batch_create'
    
    # 飞书 batch_create 最多 500 条
    batch_size = 500
    total_created = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        resp = api_call('POST', url, token, {
            "records": [{"fields": r} for r in batch]
        })
        
        if resp.get('code') == 0:
            created = resp.get('data', {}).get('records', [])
            total_created += len(created)
            print(f"  批次 {i//batch_size + 1}: 写入 {len(created)} 条")
        else:
            print(f"  批次 {i//batch_size + 1} 写入失败: code={resp.get('code')}, msg={resp.get('msg', '')}")
            # 如果失败，尝试逐条写入
            for r in batch:
                single_resp = api_call('POST',
                    f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records',
                    token, {"fields": r})
                if single_resp.get('code') == 0:
                    total_created += 1
                else:
                    print(f"    单条写入失败: {single_resp.get('msg', '')[:100]}")
    
    return total_created


# ============================================
# Mock 数据生成
# ============================================

MODULES = [
    "极速打卡", "审批流程", "考勤统计", "薪资查询", "请假管理",
    "出差申请", "公告通知", "绩效管理", "招聘管理", "培训管理"
]

FEEDBACK_TEMPLATES = {
    5: [
        "功能非常好用，解决了实际问题，团队效率提升了很多",
        "界面设计很清晰，操作起来很方便，体验感非常好",
        "这个功能太棒了，我们整个团队都在用，强烈推荐",
        "更新后体验大幅提升，特别是新加的批量操作功能很实用",
        "非常满意，功能完善，响应速度快，值得信赖",
        "从用户角度出发设计的功能，用起来很顺手，给产品团队点赞",
        "自从用了这个功能，我们部门的工作效率提升了不少",
        "界面美观，交互流畅，是我们日常工作中离不开的工具",
        "功能强大且易于使用，极大地简化了我们的工作流程",
        "非常出色的功能设计，后续希望能持续优化，越来越好",
    ],
    4: [
        "整体不错，一些小细节如果能改进就更好了",
        "功能挺实用的，但是偶尔会遇到一些小问题",
        "挺好用的，不过在部分场景下反应有点慢",
        "大部分功能都很满意，希望继续保持更新",
        "使用体验不错，还有一些可以优化的空间",
        "功能比较完善，移动端和PC端体验不太一致",
        "整体满意，部分功能入口不够明显，需要适应",
        "比以前好用了很多，但还是有些操作步骤偏多",
        "功能层面很棒，在部分老旧设备上会卡顿",
        "满足日常需求，在数据分析方面可以再加强",
    ],
    3: [
        "一般般吧，能用的水平，没有太多惊喜",
        "功能基本满足要求，但体验还有很大的提升空间",
        "中规中矩，和竞争对手的产品比没有明显优势",
        "有时候会找不到想要的功能，菜单层级有点深",
        "还行，但感觉新版本越更新越复杂了",
        "基本功能都有了，但高级功能不够完善",
        "用起来感觉有点卡顿，加载时间偏长",
        "功能没问题，但界面设计风格可以再优化",
        "满足基本需求，但操作引导不够清晰",
        "偶尔会出现数据不同步的情况，需要手动刷新",
    ],
    2: [
        "最近经常崩溃，严重影响使用，希望能尽快修复",
        "功能设计不够人性化，有些操作逻辑让人困惑",
        "响应速度太慢了，每次加载都要等很久",
        "数据经常出错，导致我需要反复核对，浪费时间",
        "界面太复杂了，找个功能要找半天，学习成本高",
        "自从更新后反而更难用了，想把旧版本换回来",
        "移动端适配很差，手机上看全是乱的",
        "功能经常出bug，提交的数据莫名丢失",
        "操作流程太繁琐了，简单的审批要走好几步",
        "系统兼容性差，换了浏览器就不正常了",
    ],
    1: [
        "太难用了，简直是在浪费时间，建议回炉重造",
        "全是bug，根本没法正常使用，太失望了",
        "界面丑，功能差，响应慢，没有一个优点",
        "自从上线这个功能，我们部门怨声载道，太难用了",
        "数据安全问题堪忧，不敢把重要数据放上去",
        "完全不符合用户习惯，感觉设计者根本没做过调研",
        "频繁的报错和闪退，已经影响到正常工作",
        "新版本是一次灾难，所有功能都变差了",
        "体验极差，每次操作都要加载半天，不如用Excel",
        "这个功能有严重问题，已经导致几次数据丢失了",
    ]
}


def generate_mock_data(count=100):
    """生成模拟反馈数据"""
    score_weights = [15, 20, 30, 20, 15]
    scores = random.choices([1, 2, 3, 4, 5], weights=score_weights, k=count)
    records = []
    for i in range(count):
        score = scores[i]
        module = random.choice(MODULES)
        content = random.choice(FEEDBACK_TEMPLATES[score])
        day = random.randint(1, 15)
        hour = random.randint(8, 20)
        minute = random.randint(0, 59)
        second = random.randint(0, 59)
        records.append({
            "content": content,
            "module": module,
            "score": score,
            "created_at": f"2026-06-{day:02d} {hour:02d}:{minute:02d}:{second:02d}"
        })
    return records


# ============================================
# AI 打标
# ============================================

SYSTEM_PROMPT = """你是一个专业的用户反馈分析助手。请为每一条用户反馈提取 Tag1/Tag2/Tag3 标签。

Tag1 必须从以下 7 类中选择：疑似Bug、功能优化、界面改进、性能提升、用户教育、安全、无效
Tag2 是功能模块名称（如极速打卡、审批流程等）
Tag3 是具体问题描述（10字以内）

请按以下 JSON 数组格式输出，不要加任何额外文字：
[
  {"tag1":"疑似Bug","tag2":"审批流程","tag3":"审批卡顿"},
  {"tag1":"功能优化","tag2":"极速打卡","tag3":"打卡定位不准"}
]

注意：
- 数组长度必须与输入条目数一致
- 每条必须包含 tag1, tag2, tag3 三个字段
- tag1 只能从 7 类中选择
- tag3 要具体准确，10字以内"""


def batch_call_agnesai(batch_records):
    """调用 AgnesAI 批量打标"""
    user_prompt = "请为以下反馈数据打标：\n\n"
    for i, r in enumerate(batch_records):
        user_prompt += f"{i+1}. 模块: {r['module']} | 评分: {r['score']}分 | 内容: {r['content']}\n"
    user_prompt += "\n请输出JSON数组，数组长度必须等于条目数。"

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 4096
    }

    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'{LLM_BASE_URL}/chat/completions',
        '-H', 'Content-Type: application/json',
        '-H', f'Authorization: Bearer {LLM_API_KEY}',
        '-d', json.dumps(payload)
    ], capture_output=True, text=True)

    try:
        response = json.loads(result.stdout)
        if 'error' in response:
            return None
        ai_content = response['choices'][0]['message']['content'].strip()
        json_match = re.search(r'\[[\s\S]*\]', ai_content)
        if json_match:
            tags_list = json.loads(json_match.group())
            if isinstance(tags_list, list) and len(tags_list) == len(batch_records):
                return tags_list
    except:
        pass
    return None


def rule_based_tag(record):
    """备用规则打标"""
    content = record["content"]
    module = record["module"]
    score = record["score"]
    if score <= 2:
        tag1 = "疑似Bug"
    elif score == 3:
        tag1 = "功能优化"
    else:
        tag1 = "功能优化"
    for kw in ["bug", "崩溃", "闪退", "出错", "丢失", "报错"]:
        if kw in content:
            tag1 = "疑似Bug"; break
    for kw in ["卡顿", "慢", "响应", "加载", "兼容"]:
        if kw in content:
            tag1 = "性能提升"; break
    for kw in ["界面", "设计", "布局", "菜单"]:
        if kw in content:
            tag1 = "界面改进"; break
    return {"tag1": tag1, "tag2": module, "tag3": content[:8] + "..."}


def ai_tagging(records):
    """对所有反馈数据进行 AI 打标"""
    batches = [records[i:i + BATCH_SIZE] for i in range(0, len(records), BATCH_SIZE)]
    all_tags = []
    for batch_idx, batch in enumerate(batches):
        print(f"  批次 {batch_idx + 1}/{len(batches)} ({len(batch)} 条)...")
        tags = batch_call_agnesai(batch)
        if tags:
            all_tags.extend(tags)
            print(f"    [OK] {len(tags)} 条打标成功")
        else:
            print(f"    [备用] 使用规则打标")
            for r in batch:
                all_tags.append(rule_based_tag(r))
        if batch_idx < len(batches) - 1:
            time.sleep(1)

    for i, r in enumerate(records):
        if i < len(all_tags):
            t = all_tags[i]
            r["tag1"] = t.get("tag1", "无效")
            r["tag2"] = t.get("tag2", r["module"])
            r["tag3"] = t.get("tag3", "一般问题")
        else:
            r["tag1"] = "无效"
            r["tag2"] = r["module"]
            r["tag3"] = "未知"
    return records


# ============================================
# 主流程
# ============================================

def main():
    print("=" * 60)
    print("  将 Mock 数据写入飞书多维表格")
    print("=" * 60)
    print(f"  App Token: {APP_TOKEN}")
    print(f"  Table ID:  {TABLE_ID}")
    print()

    # 1. 获取 Token
    print("【步骤 1】获取飞书 Token...")
    token = get_tenant_access_token()
    if not token:
        print("  ✗ Token 获取失败，终止")
        return
    print(f"  ✓ Token: {token[:20]}...")

    # 2. 查看现有字段
    print("\n【步骤 2】查看表格字段结构...")
    fields = list_fields(token)
    field_names = [f['field_name'] for f in fields]
    field_map = {f['field_name']: f['field_id'] for f in fields}

    # 3. 确保必要字段存在
    print("\n【步骤 3】检查并创建必要字段...")
    required_fields = {
        "反馈内容": 1,       # text
        "功能模块": 1,       # text
        "NPS评分": 2,        # number
        "创建时间": 5,       # date
        "Tag1": 1,           # text
        "Tag2": 1,           # text
        "Tag3": 1,           # text
        "摘要": 1,           # text
    }
    for fname, ftype in required_fields.items():
        if fname not in field_names:
            create_field_if_missing(token, fname, ftype)

    # 4. 生成 Mock 数据
    print("\n【步骤 4】生成 100 条 Mock 数据...")
    records = generate_mock_data(100)
    print(f"  ✓ 生成 {len(records)} 条")

    # 5. AI 打标
    print("\n【步骤 5】AI 批量打标...")
    records = ai_tagging(records)
    tag1_dist = {}
    for r in records:
        t = r["tag1"]
        tag1_dist[t] = tag1_dist.get(t, 0) + 1
    print(f"\n  标签分布:")
    for tag, cnt in sorted(tag1_dist.items(), key=lambda x: -x[1]):
        print(f"    {tag}: {cnt}条 ({cnt}%)")

    # 6. 转换为飞书表格格式并写入
    print("\n【步骤 6】写入多维表格...")
    bitable_records = []
    for r in records:
        # 生成摘要（取内容前30字）
        summary = r["content"][:30] + "..." if len(r["content"]) > 30 else r["content"]
        
        record = {
            "反馈内容": r["content"],
            "功能模块": r["module"],
            "NPS评分": r["score"],
            "创建时间": r["created_at"],
            "Tag1": r["tag1"],
            "Tag2": r["tag2"],
            "Tag3": r["tag3"],
            "摘要": summary,
        }
        bitable_records.append(record)

    total = batch_create_records(token, bitable_records)
    print(f"\n  ✓ 总共写入 {total} 条记录")

    # 7. 验证
    print("\n【步骤 7】验证写入结果...")
    resp = api_call('GET',
        f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records?page_size=3',
        token)
    if resp.get('code') == 0:
        items = resp.get('data', {}).get('items', [])
        print(f"  ✓ 表格中现有 {resp.get('data', {}).get('total', '?')} 条记录")
        for item in items[:3]:
            fields = item.get('fields', {})
            print(f"    - [{fields.get('NPS评分', '?')}分] {fields.get('Tag1', '?')} | {fields.get('功能模块', '?')} | {str(fields.get('反馈内容', ''))[:30]}...")
    else:
        print(f"  验证失败: {resp}")

    print("\n" + "=" * 60)
    print(f"  ✓ 完成! 共写入 {total} 条反馈数据到多维表格")
    print(f"  表格链接: https://my.feishu.cn/bitable/{APP_TOKEN}/{TABLE_ID}")
    print("=" * 60)


if __name__ == "__main__":
    main()
