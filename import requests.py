import requests
import json
from typing import Dict, List

# -------------------------- 你的固定配置 --------------------------
FEISHU_APP_ID = "cli_aaa544951ee19bed"
FEISHU_APP_SECRET = "blbmWJYPWgJMgBlkF4YnHft26zWY68SC"
# 你的多维表格app_token
SOURCE_APP_TOKEN = "MIPVbgPfUaq2rwsPX2icCoXwnag"
# 输出的JSON文件路径
OUTPUT_META_FILE = "./docs/nps_bitable_full_meta.json"
# -------------------------------------------------------------------

BASE_API = "https://open.feishu.cn/open-apis"

class BitableMetaFetcher:
    def __init__(self, app_id: str, app_secret: str, app_token: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.app_token = app_token
        self.token = ""
        self.full_meta = {}

    def get_tenant_token(self) -> str:
        """获取鉴权token，自动处理错误"""
        url = f"{BASE_API}/auth/v3/tenant_access_token/internal"
        payload = {"app_id": self.app_id, "app_secret": self.app_secret}
        try:
            resp = requests.post(url, json=payload, timeout=10)
            resp.raise_for_status()
            res = resp.json()
            if res["code"] != 0:
                raise Exception(f"Token获取失败: {res['msg']}")
            self.token = res["tenant_access_token"]
            return self.token
        except Exception as e:
            print(f"❌ 鉴权失败: {str(e)}")
            exit(1)

    def get_all_tables(self) -> List[Dict]:
        """获取多维表格下所有子表，返回table_id+表名"""
        headers = {"Authorization": f"Bearer {self.token}"}
        url = f"{BASE_API}/bitable/v1/apps/{self.app_token}/tables"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            res = resp.json()
            if res["code"] != 0:
                raise Exception(f"获取表列表失败: {res['msg']}")
            return res["data"]["items"]
        except Exception as e:
            print(f"❌ 读取表列表失败: {str(e)}")
            exit(1)

    def get_table_fields(self, table_id: str) -> List[Dict]:
        """获取单表所有字段的完整元数据（核心：公式/关联/查找都在这里）"""
        headers = {"Authorization": f"Bearer {self.token}"}
        url = f"{BASE_API}/bitable/v1/apps/{self.app_token}/tables/{table_id}/fields"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            res = resp.json()
            if res["code"] != 0:
                raise Exception(f"读取表{table_id}字段失败: {res['msg']}")
            return res["data"]["items"]
        except Exception as e:
            print(f"❌ 读取字段失败: {str(e)}")
            exit(1)

    def fetch_full_meta(self):
        """拉取完整元数据，存入self.full_meta"""
        print("🔑 正在获取鉴权Token...")
        self.get_tenant_token()
        print("✅ Token获取成功")

        print("\n📋 正在获取多维表格所有子表...")
        tables = self.get_all_tables()
        print(f"✅ 共找到{len(tables)}张数据表")

        for table in tables:
            tbl_id = table["table_id"]
            tbl_name = table["name"]
            print(f"\n🔍 正在读取表：{tbl_name} (table_id={tbl_id})")
            fields = self.get_table_fields(tbl_id)
            print(f"✅ 读取到{len(fields)}个字段")
            self.full_meta[tbl_id] = {
                "table_name": tbl_name,
                "table_id": tbl_id,
                "fields": fields
            }

    def save_to_file(self, file_path: str):
        """将完整元数据保存为JSON文件"""
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(self.full_meta, f, ensure_ascii=False, indent=2)
        print(f"\n💾 完整元数据已保存到: {file_path}")

if __name__ == "__main__":
    fetcher = BitableMetaFetcher(
        app_id=FEISHU_APP_ID,
        app_secret=FEISHU_APP_SECRET,
        app_token=SOURCE_APP_TOKEN
    )
    fetcher.fetch_full_meta()
    fetcher.save_to_file(OUTPUT_META_FILE)

    # 打印核心字段统计，方便你快速查看
    print("\n📊 核心字段类型统计：")
    type_count = {}
    for tbl in fetcher.full_meta.values():
        for field in tbl["fields"]:
            f_type = field["type"]
            type_count[f_type] = type_count.get(f_type, 0) + 1
    print(f"字段类型分布: {type_count}")
    print("type=18: 单向关联 | type=19: 查找LOOKUP | type=20: 公式 | type=21: 双向关联")
