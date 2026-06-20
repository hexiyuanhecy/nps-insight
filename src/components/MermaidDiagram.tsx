/**
 * Mermaid 图表组件
 * 使用 next/dynamic 动态加载，避免 SSR 时 mermaid 库因缺少 DOM API 而崩溃
 */

import dynamic from 'next/dynamic';
import { SkeletonMermaidDiagram } from './MermaidDiagram.Skeleton';

// 动态导入实际渲染器，ssr: false 确保服务端完全不加载 mermaid
const MermaidRenderer = dynamic(
  () => import('./MermaidRenderer'),
  { ssr: false, loading: () => <SkeletonMermaidDiagram /> },
);


interface MermaidDiagramProps {
  chart: string;
}

/**
 * 对外导出的 MermaidDiagram 组件
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  return <MermaidRenderer chart={chart} />;
}
