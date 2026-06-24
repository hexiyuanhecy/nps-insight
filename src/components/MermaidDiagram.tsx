/**
 * Mermaid 图表组件
 *
 * 加载策略：通过 <script> 标签预加载 mermaid CDN IIFE bundle，
 * 完全绕过 Next.js webpack 解析问题。SSR 已由 next/dynamic 关闭。
 */

'use client';

import { useEffect, useState } from 'react';
import { SkeletonMermaidDiagram } from './MermaidDiagram.Skeleton';

interface MermaidAPI {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, chart: string) => Promise<{ svg: string }>;
}

const MERMAID_CDN_IIFE = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

let mermaidReady: Promise<MermaidAPI> | null = null;

function preloadMermaid(): Promise<MermaidAPI> {
  if (mermaidReady) return mermaidReady;

  mermaidReady = new Promise((resolve, reject) => {
    const win = window as unknown as Record<string, MermaidAPI>;

    // 已加载过
    if (win['mermaid']) {
      resolve(win['mermaid']);
      return;
    }

    const script = document.createElement('script');
    script.src = MERMAID_CDN_IIFE;
    script.onload = () => {
      if (win['mermaid']) resolve(win['mermaid']);
      else reject(new Error('mermaid CDN 加载完成但未找到全局对象'));
    };
    script.onerror = () => reject(new Error('mermaid CDN script 加载失败'));
    document.head.appendChild(script);

    // 超时兜底
    setTimeout(() => {
      if (!win['mermaid']) reject(new Error('mermaid CDN 加载超时（10秒）'));
    }, 10000);
  });

  return mermaidReady;
}

interface MermaidRendererProps {
  chart: string;
}

function MermaidRenderer({ chart }: MermaidRendererProps) {
  const [result, setResult] = useState<{ svg: string } | { error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function doRender() {
      try {
        const m = await preloadMermaid();
        if (cancelled) return;
        await m.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#3b82f6',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#2563eb',
            lineColor: '#94a3b8',
            secondaryColor: '#14b8a6',
            tertiaryColor: '#f8fafc',
            fontSize: '14px',
          },
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 15 },
          mindmap: { useMaxWidth: true, padding: 16 },
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await m.render(id, chart);
        if (!cancelled) setResult({ svg });
      } catch (e) {
        if (!cancelled) setResult({ error: e instanceof Error ? e.message : '渲染失败' });
      }
    }

    doRender();
    return () => { cancelled = true; };
  }, [chart]);

  if (!result) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <span className="text-sm text-slate-400">图表加载中...</span>
      </div>
    );
  }

  if ('error' in result) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg bg-red-50 p-4 text-center">
        <span className="text-sm font-medium text-red-600">图表渲染失败</span>
        <span className="text-xs text-red-400">{result.error}</span>
      </div>
    );
  }

  return (
    <div
      className="flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}

// 页面加载时预热 mermaid（提前注入 script，不阻塞首屏）
if (typeof window !== 'undefined') {
  preloadMermaid().catch(console.error);
}

// 动态导入，关闭 SSR
import dynamic from 'next/dynamic';

const MermaidDiagram = dynamic(() => Promise.resolve(MermaidRenderer), {
  ssr: false,
  loading: () => <SkeletonMermaidDiagram />,
});

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagramExport({ chart }: MermaidDiagramProps) {
  return <MermaidDiagram chart={chart} />;
}
