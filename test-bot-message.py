#!/usr/bin/env python3
"""
测试飞书 Bot 消息发送
模拟完整的通知流程
"""

import json
import subprocess
import sys

# 模拟统计数据
test_data = {
    "periodName": "2026-W24（模拟数据测试）",
    "totalFeedbacks": 200,
    "npsScore": 2.35,
    "promoterCount": 40,
    "passiveCount": 60,
    "detractorCount": 100,
    "topIssues": [
        "用户教育类反馈占比最高（33%）",
        "疑似Bug和功能优化各占22%",
        "极速打卡和审批流程问题集中"
    ]
}

def create_card_content(data):
    """创建飞书消息卡片内容"""
    issues_text = "\n".join([f"• {issue}" for issue in data['topIssues']])
    
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📊 NPS Insight - 本周反馈已打标完成"},
            "template": "green"
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**周期：** {data['periodName']}\n**新增反馈：** {data['totalFeedbacks']} 条\n**平均评分：** {data['npsScore']:.2f} 分"
                }
            },
            {"tag": "hr"},
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**评分分布：**\n😊 推荐者(4-5分)：{data['promoterCount']} 条\n😐 被动者(3分)：{data['passiveCount']} 条\n😞 贬损者(1-2分)：{data['detractorCount']} 条"
                }
            },
            {"tag": "hr"},
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**TOP 问题：**\n{issues_text}"
                }
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "查看多维表格"},
                        "type": "primary",
                        "url": "https://my.feishu.cn/bitable/"
                    }
                ]
            }
        ]
    }
    return card

def main():
    print("========================================")
    print("飞书 Bot 消息测试")
    print("========================================\n")
    
    # 显示消息卡片内容
    print("【消息卡片内容】")
    card = create_card_content(test_data)
    print(json.dumps(card, ensure_ascii=False, indent=2))
    
    print("\n========================================")
    print("说明：")
    print("- 实际发送需要配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET")
    print("- 需要创建飞书自建应用并开通 Bot 权限")
    print("- 需要将 Bot 添加到目标群聊")
    print("- 消息卡片将发送到配置的 NOTIFICATION_CHAT_ID")
    print("========================================")
    
    print("\n【模拟发送成功】")
    print(f"✓ 周期：{test_data['periodName']}")
    print(f"✓ 反馈数：{test_data['totalFeedbacks']} 条")
    print(f"✓ 平均评分：{test_data['npsScore']:.2f} 分")
    print(f"✓ 消息卡片已生成")
    print("\n（实际环境中，此消息将发送到飞书群）")

if __name__ == "__main__":
    main()
