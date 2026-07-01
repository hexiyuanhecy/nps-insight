/**
 * 根布局组件
 * 提供全局样式和基础HTML结构
 */

import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'NPS Insight - AI驱动NPS反馈分析',
  description: '基于飞书生态的AI驱动NPS反馈分析工具',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      {/* 
        飞书 Web 应用远程调试工具
        仅在调试模式下启用，不影响线上运行
        使用方法：https://open.feishu.cn/document/tools-and-sdks/webapp-remote-debugging-tool-user-guide
      */}
      <Script
        src="https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/op/fe/devtools_frontend/remote-debug-0.0.1-alpha.6.js"
        strategy="lazyOnload"
      />
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
