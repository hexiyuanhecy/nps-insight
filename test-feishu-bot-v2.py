#!/usr/bin/env python3
"""
测试飞书 Bot 消息发送（新应用配置）
"""

import json
import subprocess

APP_ID = os.environ['FEISHU_APP_ID']
APP_SECRET = os.environ['FEISHU_APP_SECRET']
CHAT_ID = 'oc_29d0d49f829145b53f32dbebba1b3c40'

def get_tenant_access_token():
    """获取飞书 Tenant Access Token"""
    print("【步骤 1】获取 Tenant Access Token...")
    
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
            print(f"✓ Token 获取成功: {token[:20]}...")
            return token
        else:
            print(f"✗ 获取失败: {data}")
            return None
    except Exception as e:
        print(f"✗ 解析失败: {e}")
        return None

def send_bot_message(token):
    """发送 Bot 消息到群"""
    print("\n【步骤 2】发送消息到飞书群...")
    
    card = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📊 NPS Insight - 测试消息"},
            "template": "green"
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": "**NPS Insight 测试消息**\n\n这是来自 AI 测试的消息，验证 Bot 配置是否正确。\n\n✓ 数据源：200 条模拟反馈\n✓ AI 打标：成功率 90%\n✓ 飞书通知：测试中"
                }
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "查看项目"},
                        "type": "primary",
                        "url": "http://localhost:3001/admin"
                    }
                ]
            }
        ]
    }
    
    result = subprocess.run([
        'curl', '-s', '-X', 'POST',
        'https://open.feishu.cn/open-apis/im/v1/messages',
        '-H', f'Authorization: Bearer {token}',
        '-H', 'Content-Type: application/json',
        '--data-urlencode', f'receive_id={CHAT_ID}',
        '--data-urlencode', 'msg_type=interactive',
        '--data-urlencode', f'content={json.dumps(card)}'
    ], capture_output=True, text=True)
    
    try:
        data = json.loads(result.stdout)
        if data.get('code') == 0:
            print("✓ 消息发送成功！")
            print(f"  消息 ID: {data['data']['message_id']}")
            return True
        else:
            print(f"✗ 发送失败: {data}")
            return False
    except Exception as e:
        print(f"✗ 解析失败: {e}")
        print(f"  原始响应: {result.stdout[:200]}")
        return False

def get_chat_info(token):
    """获取群信息"""
    print("\n【步骤 3】获取群信息...")
    
    result = subprocess.run([
        'curl', '-s',
        f'https://open.feishu.cn/open-apis/im/v1/chats/{CHAT_ID}',
        '-H', f'Authorization: Bearer {token}'
    ], capture_output=True, text=True)
    
    try:
        data = json.loads(result.stdout)
        if data.get('code') == 0:
            chat_name = data['data'].get('name', '未知')
            print(f"✓ 群信息获取成功: {chat_name}")
            return True
        else:
            print(f"✗ 获取失败: {data}")
            return False
    except Exception as e:
        print(f"✗ 解析失败: {e}")
        return False

def main():
    print("========================================")
    print("飞书 Bot 消息发送测试（新应用）")
    print("========================================\n")
    
    print(f"App ID: {APP_ID}")
    print(f"Chat ID: {CHAT_ID}\n")
    
    # 获取 Token
    token = get_tenant_access_token()
    if not token:
        print("\n✗ 测试终止：无法获取 Token")
        return
    
    # 获取群信息
    get_chat_info(token)
    
    # 发送消息
    success = send_bot_message(token)
    
    print("\n========================================")
    if success:
        print("✓ 测试完成！消息已发送到飞书群")
    else:
        print("✗ 测试失败，请检查配置")
        print("\n可能原因：")
        print("1. 应用未开启 Bot 能力")
        print("2. 应用未发布")
        print("3. Bot 未添加到群聊")
    print("========================================")

if __name__ == "__main__":
    main()
