#!/usr/bin/env python3
"""
NPS Insight - 完整测试流程
1. 生成 100 条模拟反馈数据
2. AgnesAI 批量 AI 打标
3. 统计分析（NPS、评分分布、TOP问题、标签统计）
4. 发送增强版飞书卡片消息到群
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
CHAT_ID = 'oc_29d0d49f829145b53f32dbebba1b3c40'

LLM_API_KEY = os.environ.get('LLM_API_KEY', '')
LLM_BASE_URL = 'https://apihub.agnes-ai.com/v1'
LLM_MODEL = 'agnes-2.0-flash'

BITABLE_TOKEN = 'CQEJbYvUza2jRVs644QcOcsSnIk'
BITABLE_URL = 'https://my.feishu.cn/bitable/CQEJbYvUza2jRVs644QcOcsSnIk'

BATCH_SIZE = 25  # AI 打标批处理大小

# ============================================
# 步骤 1: 生成 100 条 Mock 反馈数据
# ============================================

MODULES = [
    "极速打卡", "审批流程", "考勤统计", "薪资查询", "请假管理",
    "出差申请", "公告通知", "绩效管理", "招聘管理", "培训管理"
]

# 不同评分对应的反馈模板（更真实的用户反馈）
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
    print("=" * 60)
    print("  步骤 1: 生成 Mock 反馈数据")
    print("=" * 60)

    # 配置评分分布权重
    score_weights = [15, 20, 30, 20, 15]  # 1-5分的分布权重
    scores = random.choices([1, 2, 3, 4, 5], weights=score_weights, k=count)

    records = []
    for i in range(count):
        score = scores[i]
        module = random.choice(MODULES)
        content = random.choice(FEEDBACK_TEMPLATES[score])

        record = {
            "id": i + 1,
            "content": content,
            "module": module,
            "score": score,
            "created_at": f"2026-06-{random.randint(1, 15):02d} {random.randint(8, 20):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"
        }
        records.append(record)

    # 输出统计
    score_dist = {s: 0 for s in range(1, 6)}
    for r in records:
        score_dist[r["score"]] += 1

    print(f"  生成 {len(records)} 条模拟反馈数据")
    print(f"  评分分布:")
    for s in range(1, 6):
        bar = "█" * score_dist[s]
        print(f"    {s}分: {bar} {score_dist[s]}条")

    return records


# ============================================
# 步骤 2: AI 批量打标
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

    start_time = time.time()
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'{LLM_BASE_URL}/chat/completions',
        '-H', 'Content-Type: application/json',
        '-H', f'Authorization: Bearer {LLM_API_KEY}',
        '-d', json.dumps(payload)
    ], capture_output=True, text=True)
    elapsed = time.time() - start_time

    try:
        response = json.loads(result.stdout)

        # 检查 API 错误
        if 'error' in response:
            print(f"    [API 错误] {response['error'].get('message', str(response['error']))}")
            return None

        ai_content = response['choices'][0]['message']['content'].strip()

        # 尝试提取 JSON 数组（可能被 markdown 包裹）
        json_match = re.search(r'\[[\s\S]*\]', ai_content)
        if json_match:
            tags_list = json.loads(json_match.group())
            if isinstance(tags_list, list) and len(tags_list) == len(batch_records):
                print(f"    [OK] {len(tags_list)} 条打标成功 (耗时 {elapsed:.1f}s)")
                return tags_list
            else:
                print(f"    [警告] 返回 {len(tags_list) if isinstance(tags_list, list) else '非数组'} 条，期望 {len(batch_records)} 条")
                return None
        else:
            print(f"    [解析失败] 无法从响应中提取 JSON 数组")
            print(f"    响应前200字: {ai_content[:200]}")
            return None
    except json.JSONDecodeError as e:
        print(f"    [JSON解析错误] {e}")
        print(f"    原始响应前200字: {result.stdout[:200]}")
        return None
    except Exception as e:
        print(f"    [未知错误] {e}")
        return None


def ai_tagging(records):
    """对所有反馈数据进行 AI 打标"""
    print("\n" + "=" * 60)
    print("  步骤 2: AI 批量打标")
    print("=" * 60)
    print(f"  模型: {LLM_MODEL}")
    print(f"  总记录: {len(records)} 条，批量大小: {BATCH_SIZE}")
    print()

    # 分批处理
    batches = [records[i:i + BATCH_SIZE] for i in range(0, len(records), BATCH_SIZE)]
    all_tags = []

    for batch_idx, batch in enumerate(batches):
        print(f"  批次 {batch_idx + 1}/{len(batches)} ({len(batch)} 条)...")
        tags = batch_call_agnesai(batch)

        if tags:
            all_tags.extend(tags)
        else:
            # 如果 API 调用失败，使用备用规则打标
            print(f"    [备用] 使用规则打标")
            for r in batch:
                tag = rule_based_tag(r)
                all_tags.append(tag)

        # 批次间隔
        if batch_idx < len(batches) - 1:
            time.sleep(1)

    # 将标签合并到记录中
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

    # 输出统计
    tag1_dist = {}
    for r in records:
        t = r["tag1"]
        tag1_dist[t] = tag1_dist.get(t, 0) + 1

    print(f"\n  打标完成! 标签分布:")
    for tag, count in sorted(tag1_dist.items(), key=lambda x: -x[1]):
        pct = count / len(records) * 100
        bar = "█" * int(pct / 4)
        print(f"    {tag}: {count:3d}条 ({pct:5.1f}%) {bar}")

    return records


def rule_based_tag(record):
    """基于规则的备用打标"""
    content = record["content"]
    module = record["module"]
    score = record["score"]

    # 基于评分的标签
    low_score_tags = ["疑似Bug", "性能提升", "界面改进"]
    mid_score_tags = ["功能优化", "界面改进", "用户教育"]
    high_score_tags = ["用户教育", "功能优化", "无效"]

    if score <= 2:
        tag1 = random.choice(low_score_tags)
    elif score == 3:
        tag1 = random.choice(mid_score_tags)
    else:
        tag1 = random.choice(high_score_tags)

    # 基于关键词的标签
    bug_keywords = ["bug", "崩溃", "闪退", "出错", "丢失", "报错", "问题"]
    perf_keywords = ["卡顿", "慢", "响应", "加载", "兼容"]
    ui_keywords = ["界面", "设计", "丑", "布局", "入口", "菜单"]
    edu_keywords = ["引导", "学习", "不知道", "找不到", "复杂"]

    for kw in bug_keywords:
        if kw in content:
            tag1 = "疑似Bug"
            break
    for kw in perf_keywords:
        if kw in content:
            tag1 = "性能提升"
            break
    for kw in ui_keywords:
        if kw in content:
            tag1 = "界面改进"
            break
    for kw in edu_keywords:
        if kw in content:
            tag1 = "用户教育"
            break

    # tag3 从内容中提取关键短语
    short_desc = content[:8] + "..." if len(content) > 10 else content

    return {"tag1": tag1, "tag2": module, "tag3": short_desc}


# ============================================
# 步骤 3: 统计分析
# ============================================

def calculate_nps(records):
    """计算 NPS 分数"""
    promoters = sum(1 for r in records if r["score"] >= 4)
    detractors = sum(1 for r in records if r["score"] <= 2)
    passives = len(records) - promoters - detractors

    nps = round((promoters - detractors) / len(records) * 100)

    return {
        "total": len(records),
        "promoters": promoters,
        "passives": passives,
        "detractors": detractors,
        "nps": nps,
        "avg_score": round(sum(r["score"] for r in records) / len(records), 2)
    }


def analyze_statistics(records):
    """统计分析"""
    print("\n" + "=" * 60)
    print("  步骤 3: 统计分析")
    print("=" * 60)

    stats = calculate_nps(records)
    print(f"  总反馈: {stats['total']} 条")
    print(f"  NPS 得分: {stats['nps']}")
    print(f"  平均评分: {stats['avg_score']}")
    print(f"  推荐者: {stats['promoters']} | 被动者: {stats['passives']} | 贬损者: {stats['detractors']}")

    # 评分分布
    print(f"\n  评分分布:")
    score_dist = {}
    for r in records:
        s = r["score"]
        score_dist[s] = score_dist.get(s, 0) + 1
    for s in range(1, 6):
        cnt = score_dist.get(s, 0)
        pct = cnt / len(records) * 100
        bar = "█" * int(pct / 2)
        print(f"    {s}分: {bar} {cnt}条 ({pct:.1f}%)")

    # Tag1 分布
    print(f"\n  Tag1 标签分布:")
    tag1_dist = {}
    for r in records:
        t = r["tag1"]
        tag1_dist[t] = tag1_dist.get(t, 0) + 1
    for tag, cnt in sorted(tag1_dist.items(), key=lambda x: -x[1]):
        pct = cnt / len(records) * 100
        bar = "█" * int(pct / 2)
        print(f"    {tag}: {bar} {cnt}条 ({pct:.1f}%)")

    # Tag2 (模块) 分布 - TOP5
    print(f"\n  TOP5 问题模块:")
    tag2_dist = {}
    for r in records:
        m = r["tag2"]
        tag2_dist[m] = tag2_dist.get(m, 0) + 1
    top5_modules = sorted(tag2_dist.items(), key=lambda x: -x[1])[:5]
    for mod, cnt in top5_modules:
        print(f"    {mod}: {cnt}条")

    # Tag3 具体问题 - TOP5
    print(f"\n  TOP5 具体问题:")
    tag3_dist = {}
    for r in records:
        t3 = r["tag3"]
        tag3_dist[t3] = tag3_dist.get(t3, 0) + 1
    top5_issues = sorted(tag3_dist.items(), key=lambda x: -x[1])[:5]
    for issue, cnt in top5_issues:
        print(f"    {issue}: {cnt}条")

    # 按评分和 Tag1 的交叉分析
    cross_analysis = {}
    for r in records:
        t1 = r["tag1"]
        s_group = "1-2分(贬损者)" if r["score"] <= 2 else ("3分(被动者)" if r["score"] == 3 else "4-5分(推荐者)")
        key = f"{s_group} - {t1}"
        cross_analysis[key] = cross_analysis.get(key, 0) + 1

    print(f"\n  评分 vs 标签交叉分析 (TOP5):")
    top_cross = sorted(cross_analysis.items(), key=lambda x: -x[1])[:5]
    for k, cnt in top_cross:
        print(f"    {k}: {cnt}条")

    stats["score_distribution"] = score_dist
    stats["tag1_distribution"] = tag1_dist
    stats["top5_modules"] = top5_modules
    stats["top5_issues"] = top5_issues
    stats["top5_cross"] = top_cross

    return stats


# ============================================
# 步骤 4: 发送飞书卡片消息
# ============================================

def get_tenant_access_token():
    """获取飞书 Tenant Access Token"""
    print("\n" + "=" * 60)
    print("  步骤 4: 获取飞书 Token")
    print("=" * 60)

    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({
            'app_id': APP_ID,
            'app_secret': APP_SECRET
        })
    ], capture_output=True, text=True)

    try:
        data = json.loads(result.stdout)
        if data.get('code') == 0:
            token = data['tenant_access_token']
            print(f"  ✓ Token 获取成功: {token[:20]}...")
            return token
        else:
            print(f"  ✗ 获取失败: {data}")
            return None
    except Exception as e:
        print(f"  ✗ 解析失败: {e}")
        return None


def build_rich_card(stats, records):
    """构建增强版飞书消息卡片"""
    # 始终使用蓝色模板，避免红色警告观感
    header_template = "blue"
    if stats["nps"] >= 30:
        nps_label = "优秀"
    elif stats["nps"] >= 10:
        nps_label = "良好"
    elif stats["nps"] >= 0:
        nps_label = "一般"
    else:
        nps_label = "待改进"

    # ============ 评分分布（纯文本百分比，无黑色方块） ============
    bar_chart_lines = []
    for s in range(1, 6):
        cnt = stats["score_distribution"].get(s, 0)
        pct = cnt / stats["total"] * 100 if stats["total"] > 0 else 0
        bar_chart_lines.append(f"**{s}分**: {cnt}条 ({pct:.1f}%)")
    bar_chart_text = "\n".join(bar_chart_lines)

    # ============ Tag1 分布（纯文本，无黑色方块） ============
    tag1_lines = []
    sorted_tag1 = sorted(stats["tag1_distribution"].items(), key=lambda x: -x[1])
    for tag, cnt in sorted_tag1:
        pct = cnt / stats["total"] * 100 if stats["total"] > 0 else 0
        tag1_lines.append(f"{tag}: {cnt}条 ({pct:.1f}%)")
    tag1_text = "\n".join(tag1_lines)

    # ============ TOP5 问题 ============
    top_issues_text = ""
    if stats["top5_issues"]:
        issue_list = []
        emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]
        for i, (issue, cnt) in enumerate(stats["top5_issues"]):
            if i < len(emojis):
                issue_list.append(f"{emojis[i]} {issue}（{cnt}条）")
        top_issues_text = "\n".join(issue_list)

    # ============ TOP5 模块 ============
    top_modules_text = ""
    if stats["top5_modules"]:
        mod_items = []
        for mod, cnt in stats["top5_modules"]:
            mod_items.append(f"• {mod}: **{cnt}条**")
        top_modules_text = "\n".join(mod_items)

    # ============ 交叉分析 TOP3 ============
    cross_text = ""
    if stats["top5_cross"]:
        cross_items = []
        for k, cnt in stats["top5_cross"][:3]:
            cross_items.append(f"• {k} ({cnt}条)")
        cross_text = "\n".join(cross_items)

    # ============ TOP5 问题按钮（使用 url 跳转，避免卡片回调配置问题） ============
    top_issue_buttons = []
    if stats["top5_issues"]:
        for i, (issue, cnt) in enumerate(stats["top5_issues"][:5]):
            top_issue_buttons.append({
                "tag": "button",
                "text": {"tag": "plain_text", "content": f"{i+1}. {issue[:8]} ({cnt}条)"},
                "type": "primary" if i == 0 else "default",
                "url": BITABLE_URL,
                "value": {"action": "open_bitable", "issue": issue}
            })

    # ============ 构建完整卡片 ============
    card = {
        "config": {
            "wide_screen_mode": True,
            "enable_forward": True
        },
        "header": {
            "title": {"tag": "plain_text", "content": "NPS Insight - 反馈分析报告"},
            "template": header_template
        },
        "elements": [
            # ----- 概览指标 -----
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": (
                        f"**报告周期：** 2026-06-01 ~ 2026-06-15\n"
                        f"**数据来源：** Mock 模拟数据"
                    )
                }
            },
            {"tag": "hr"},
            {
                "tag": "column_set",
                "flex_mode": "bisect",
                "background_style": "default",
                "columns": [
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"**总反馈**\n"
                                        f"**{stats['total']}** 条"
                                    )
                                }
                            }
                        ]
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"**NPS 得分**\n"
                                        f"**{stats['nps']:+d}** {nps_label}"
                                    )
                                }
                            }
                        ]
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"**平均评分**\n"
                                        f"**{stats['avg_score']}** / 5.0"
                                    )
                                }
                            }
                        ]
                    }
                ]
            },
            {"tag": "hr"},
            # ----- 推荐者/被动者/贬损者三列展示 -----
            {
                "tag": "column_set",
                "flex_mode": "bisect",
                "background_style": "grey",
                "columns": [
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"😊 **推荐者**\n"
                                        f"**{stats['promoters']}** 条\n"
                                        f"占比 {stats['promoters']/stats['total']*100:.1f}%\n"
                                        f"(评分 4-5 分)"
                                    )
                                }
                            }
                        ]
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"😐 **被动者**\n"
                                        f"**{stats['passives']}** 条\n"
                                        f"占比 {stats['passives']/stats['total']*100:.1f}%\n"
                                        f"(评分 3 分)"
                                    )
                                }
                            }
                        ]
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "center",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"😞 **贬损者**\n"
                                        f"**{stats['detractors']}** 条\n"
                                        f"占比 {stats['detractors']/stats['total']*100:.1f}%\n"
                                        f"(评分 1-2 分)"
                                    )
                                }
                            }
                        ]
                    }
                ]
            },
            {"tag": "hr"},
            # ----- 评分分布 -----
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**评分分布**\n{bar_chart_text}"
                }
            },
            {"tag": "hr"},
            # ----- TOP 问题 -----
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": (
                        f"**TOP 问题标签**\n"
                        f"{top_issues_text}"
                    )
                }
            },
            # ----- TOP 问题按钮 -----
            {
                "tag": "action",
                "actions": top_issue_buttons[:5]
            } if top_issue_buttons else None,
            {"tag": "hr"},
            # ----- 标签统计 -----
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**标签统计 (Tag1 分布)**\n{tag1_text}"
                }
            },
            {"tag": "hr"},
            # ----- TOP模块 + 交叉分析 -----
            {
                "tag": "column_set",
                "flex_mode": "bisect",
                "background_style": "default",
                "columns": [
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "top",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"**TOP 问题模块**\n"
                                        f"{top_modules_text}"
                                    )
                                }
                            }
                        ]
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "top",
                        "elements": [
                            {
                                "tag": "div",
                                "text": {
                                    "tag": "lark_md",
                                    "content": (
                                        f"**评分 vs 标签交叉**\n"
                                        f"{cross_text}"
                                    )
                                }
                            }
                        ]
                    }
                ]
            },
            {"tag": "hr"},
            # ----- 底部按钮 -----
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "查看多维表格"},
                        "type": "primary",
                        "url": BITABLE_URL,
                        "value": {"action": "open_bitable"}
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "向机器人提问"},
                        "type": "default",
                        "value": {"action": "ask_bot"}
                    },
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "导出报告"},
                        "type": "default",
                        "url": BITABLE_URL,
                        "value": {"action": "open_bitable"}
                    }
                ]
            },
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": f"NPS Insight AI 分析引擎 | 数据生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')} | 模型: {LLM_MODEL}"
                    }
                ]
            }
        ]
    }

    # 移除 None 元素
    card["elements"] = [e for e in card["elements"] if e is not None]

    return card


def send_card_message(token, card):
    """发送卡片消息到飞书群"""
    print("\n" + "=" * 60)
    print("  步骤 5: 发送飞书卡片消息")
    print("=" * 60)

    body = {
        "receive_id": CHAT_ID,
        "msg_type": "interactive",
        "content": json.dumps(card, ensure_ascii=False)
    }

    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        f'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/json; charset=utf-8',
        '-d', json.dumps(body, ensure_ascii=False).encode('utf-8')
    ], capture_output=True)

    stdout = result.stdout.decode('utf-8')

    try:
        data = json.loads(stdout)
        if data.get('code') == 0:
            msg_id = data.get('data', {}).get('message_id', '')
            print(f"  ✓ 消息发送成功!")
            print(f"    消息ID: {msg_id}")
            return True
        else:
            print(f"  ✗ 发送失败: code={data.get('code')}, msg={data.get('msg', '')}")
            print(f"  响应: {stdout[:500]}")
            return False
    except Exception as e:
        print(f"  ✗ 解析失败: {e}")
        print(f"  Raw: {stdout[:500]}")
        return False


# ============================================
# 主流程
# ============================================

def print_summary(stats):
    """打印总结"""
    print("\n" + "=" * 60)
    print("  测试完成 - 总结")
    print("=" * 60)
    print(f"  ✓ 模拟数据: {stats['total']} 条")
    print(f"  ✓ AI 打标完成")
    print(f"  ✓ 飞书消息已发送")
    print()
    print(f"  NPS: {stats['nps']:+d}")
    print(f"  平均分: {stats['avg_score']}")
    print(f"  推荐者: {stats['promoters']} / 被动者: {stats['passives']} / 贬损者: {stats['detractors']}")
    print(f"  群 ID: {CHAT_ID}")
    print(f"  多维表格: {BITABLE_URL}")
    print("=" * 60)


def main():
    print("=" * 60)
    print("  NPS Insight - 完整测试流程")
    print("  100条 Mock数据 + AI打标 + 飞书卡片")
    print("=" * 60)
    print()

    # ---- 步骤 1: 生成 Mock 数据 ----
    records = generate_mock_data(100)

    # ---- 步骤 2: AI 打标 ----
    records = ai_tagging(records)

    # ---- 步骤 3: 统计分析 ----
    stats = analyze_statistics(records)

    # ---- 步骤 4: 获取飞书 Token ----
    token = get_tenant_access_token()
    if not token:
        print("\n✗ 无法获取飞书 Token，跳过发送消息")
        print("但仍可查看本地统计结果")
        print_json_summary(stats, records)
        return

    # ---- 步骤 5: 构建并发送卡片消息 ----
    card = build_rich_card(stats, records)

    # 保存卡片 JSON 到文件（调试用）
    card_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.last-card.json')
    with open(card_file, 'w', encoding='utf-8') as f:
        json.dump(card, f, ensure_ascii=False, indent=2)
    print(f"\n  卡片 JSON 已保存到 {card_file}")

    success = send_card_message(token, card)

    # ---- 总结 ----
    if success:
        print_summary(stats)
    else:
        print("\n! 消息发送失败，请检查 Bot 配置")
        print("  可能原因：应用未发布 / Bot未添加到群聊 / 权限不足")
        print("\n  本地统计结果：")
        print_json_summary(stats, records)


def print_json_summary(stats, records):
    """打印 JSON 格式的总结"""
    summary = {
        "total_feedbacks": stats["total"],
        "nps": stats["nps"],
        "avg_score": stats["avg_score"],
        "promoters": stats["promoters"],
        "passives": stats["passives"],
        "detractors": stats["detractors"],
        "score_distribution": stats["score_distribution"],
        "tag1_distribution": stats["tag1_distribution"],
        "top5_modules": [{"module": m, "count": c} for m, c in stats["top5_modules"]],
        "top5_issues": [{"issue": i, "count": c} for i, c in stats["top5_issues"]]
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()