---
name: weekly
description: "执行周任务：拉取数据、AI打标、写入表格、发送Bot通知、生成周报文档"
---

# 生成周报

## 执行条件

- 确保飞书配置已正确填写 (.env 中的 FEISHU_APP_ID、FEISHU_APP_SECRET、BITABLE_URL)
- 确保 Bot 已添加到目标群

## 执行步骤

1. 读取 `.env` 获取飞书配置
2. 从 Feelgood API 拉取本周反馈数据，按 feedbackId 去重
3. 补充租户信息，执行 AI 打标 (Tag1/Tag2/Tag3)
4. 计算置信度，标记 reviewNeeded / needLogCheck
5. 批量写入飞书多维表格
6. 统计本周 Top 问题和各类别分布
7. 发送周报卡片消息到指定群 (含 Top3、待审核数、多维表格链接)
8. 追加周报到飞书文档顶部

## 输出格式

```
## 周报生成完成 ✅

**周期**: YYYY-MM-DD ~ YYYY-MM-DD
**新增反馈**: XX 条
**去重后**: XX 条
**待审核**: XX 条
**待日志分析**: XX 条

### Top 3 问题
1. [Tag1/Tag2/Tag3] - XX 条
2. [Tag1/Tag2/Tag3] - XX 条
3. [Tag1/Tag2/Tag3] - XX 条
```

## 注意事项

- 如执行中途失败，记录失败步骤
- Bot 通知必须包含多维表格跳转链接
- 周报文档必须追加到文档顶部
