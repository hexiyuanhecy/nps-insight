/**
 * 根布局组件
 * 提供全局样式和基础HTML结构
 */

import type { Metadata } from 'next';
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
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
