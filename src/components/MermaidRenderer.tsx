/**
 * Mermaid 图表实际渲染组件
 * 仅在客户端执行，负责初始化和渲染 mermaid 图表
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface MermaidAPI {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, chart: string) => Promise<{ svg: string }>;
}

let mermaidInstance: MermaidAPI | null = null;

async function getMermaid(): Promise<MermaidAPI> {
  if (!mermaidInstance) {
    const mod = await import('mermaid');
    const m = (mod.default ?? mod) as unknown as MermaidAPI;
    m.initialize({
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
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
        padding: 15,
      },
      mindmap: {
        useMaxWidth: true,
        padding: 16,
      },
    });
    mermaidInstance = m;
  }
  return mermaidInstance;
}

interface MermaidRendererProps {
  chart: string;
}

export default function MermaidRenderer({ chart }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function render() {
      if (!containerRef.current) return;

      try {
        const m = await getMermaid();
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await m.render(id, chart);

        if (mounted) {
          setSvg(svg);
          setError('');
          setIsLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : '渲染失败');
          setIsLoading(false);
        }
      }
    }

    render();

    return () => {
      mounted = false;
    };
  }, [chart]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg bg-red-50 text-red-600">
        图表渲染失败
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
