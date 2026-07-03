/**
 * 首页
 * NPS Insight 主入口页面
 */

import Link from 'next/link';
import { BarChart3, MessageSquare, Settings, Sparkles, Clock, Shield, Bot } from 'lucide-react';
import { MermaidDiagramExport as MermaidDiagram } from '@/components/MermaidDiagram';
import { FeatureCard } from '@/components/home/FeatureCard';
import { RoleCards } from '@/components/home/RoleCards';
import { FLOW_CHART, HUMAN_FLOW_CHART, MIND_MAP_CHART } from '@/constants/home-page-charts';
import { TECH_STACK_ITEMS } from '@/constants/home-page-content';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">NPS Insight</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Bot className="h-4 w-4" />
              智能问答
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Settings className="h-4 w-4" />
              配置中心
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
            <Sparkles className="h-4 w-4" />
            AI驱动的NPS反馈分析
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            让每一条用户反馈
            <br />
            <span className="text-blue-600">都产生价值</span>
          </h1>
          <p className="mb-10 text-lg text-slate-600">
            基于飞书生态的AI驱动NPS反馈分析工具。自动收集、智能分类、深度分析，
            帮助产品团队快速洞察用户需求，驱动产品迭代。
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/admin"
              className="rounded-lg bg-blue-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700"
            >
              开始使用
            </Link>
            <a
              href="#features"
              className="rounded-lg border border-slate-200 bg-white px-6 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              了解更多
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-slate-900">三级标签体系</h2>
          <p className="mt-3 text-base text-slate-600">
            智能打标签帮助您快速定位和理解用户反馈问题
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <MermaidDiagram chart={MIND_MAP_CHART} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-slate-900">用户操作手册</h2>
          <p className="mt-3 text-base text-slate-600">
            了解系统运作流程，知道在哪一步需要您关注或审核
          </p>
        </div>
        <div className="space-y-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">⏰ 自动执行流程</h3>
            <MermaidDiagram chart={FLOW_CHART} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">👤 人工操作步骤</h3>
            <MermaidDiagram chart={HUMAN_FLOW_CHART} />
          </div>
          <RoleCards />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-4 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-slate-900">核心功能</h2>
          <p className="mt-4 text-lg text-slate-600">全链路NPS反馈管理与分析解决方案</p>
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<MessageSquare className="h-6 w-6" />}
            title="智能收集"
            description="多渠道收集NPS反馈，支持FeelGood等外部数据源接入，自动汇总到飞书多维表格"
          />
          <FeatureCard
            icon={<Sparkles className="h-6 w-6" />}
            title="AI自动打标"
            description="基于AgnesAI大模型，自动对反馈进行分类、摘要、优先级评估，准确率超过90%"
          />
          <FeatureCard
            icon={<BarChart3 className="h-6 w-6" />}
            title="深度分析"
            description="自动生成周期分析报告，识别TOP问题，追踪NPS趋势变化，提供数据洞察"
          />
          <FeatureCard
            icon={<Clock className="h-6 w-6" />}
            title="定时同步"
            description="支持腾讯云 SCF 定时任务，自动拉取数据、执行AI分析、发送群通知"
          />
          <FeatureCard
            icon={<Settings className="h-6 w-6" />}
            title="灵活配置"
            description="可视化的配置中心，支持标签管理、通知设置、同步频率调整等"
          />
          <FeatureCard
            icon={<Shield className="h-6 w-6" />}
            title="安全可靠"
            description="基于飞书官方SDK，数据存储在飞书多维表格，安全可控，权限管理完善"
          />
        </div>
      </section>

      <section className="border-t bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-slate-900">技术栈</h2>
            <p className="mt-4 text-lg text-slate-600">现代化技术选型，确保系统稳定高效</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {TECH_STACK_ITEMS.map((tech) => (
              <span
                key={tech}
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">NPS Insight</span>
            </div>
            <p className="text-sm text-slate-500">基于飞书生态的AI驱动NPS反馈分析工具</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
