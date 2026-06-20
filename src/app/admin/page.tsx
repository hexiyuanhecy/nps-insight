/**
 * 配置中心页面
 * 系统配置、标签管理、初始化设置的综合管理界面
 */

import { Metadata } from 'next';
import ConfigCenter from '@/components/admin/ConfigCenter';

export const metadata: Metadata = {
  title: '配置中心 - NPS Insight',
  description: 'NPS Insight 系统配置中心',
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 页面头部 */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">配置中心</h1>
            <p className="mt-1 text-sm text-slate-500">管理系统配置、标签体系和初始化设置</p>
          </div>
          <a
            href="/"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            返回首页
          </a>
        </div>
      </header>

      {/* 配置中心内容 */}
      <main className="mx-auto max-w-7xl px-4 py-8">
        <ConfigCenter />
      </main>
    </div>
  );
}
