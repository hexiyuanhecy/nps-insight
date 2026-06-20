/** 首页 Mermaid 图表常量 */

export const MIND_MAP_CHART = `
mindmap
  root((NPS反馈))
    疑似Bug
      打卡模块
        定位失败
        记录丢失
      审批流程
        提交无响应
      假期余额
        数据异常
    功能优化
      统计报表
        导出筛选
      通知中心
        消息合并
      考勤规则
        弹性打卡
    性能提升
      页面加载
        白屏问题
      数据同步
        同步延迟
      报表查询
        查询超时
    界面改进
      导航栏
        菜单层级深
      审批页面
        按钮易误触
`;

export const FLOW_CHART = `
flowchart TB
    subgraph Weekly["⏰ 每周执行"]
        W1(["定时触发<br/>每周一 09:00"]) --> W2(["拉取反馈数据<br/>从 FeelGood API"])
        W2 --> W3(["去重 & 补充租户<br/>feedbackId 去重"])
        W3 --> W4(["AI 逐条打标<br/>Tag1/2/3 + 置信度"])
        W4 --> W5(["批量写入多维表格<br/>一次性写入"])
        W5 --> W6(["发送 Bot 通知<br/>Top3 + 待审核数"])
    end

    subgraph Monthly["📅 每月执行"]
        M1(["定时触发<br/>每月1日 00:00"]) --> M2(["标签自进化<br/>检测重复/可拆分标签"])
        M2 --> M3(["生成 Top 问题<br/>综合评分 Top30"])
        M3 --> M4(["生成会议文档<br/>飞书文档"])
        M4 --> M5(["发送月度通知<br/>附文档链接"])
    end
`;

export const HUMAN_FLOW_CHART = `
flowchart LR
    H1(["👤 收到 Bot 通知<br/>查看飞书群周报/月报"]) --> H2(["✅ 审核低置信度标签<br/>置信度 < 0.8 需核实"])
    H2 --> H3(["✅ 维护标签库<br/>合并/拆分/停用标签"])
    H3 --> H4(["👁️ 参加月度会议<br/>基于 Top 问题分析会"])
    H4 --> H5(["👁️ 推进问题解决<br/>分派给 RD/PM/运营"])
`;
