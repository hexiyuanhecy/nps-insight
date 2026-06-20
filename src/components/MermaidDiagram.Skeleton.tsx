/**
 * Mermaid 图表骨架组件
 * 用于动态加载时的 loading 状态
 */

/**
 * 骨架屏：loading 时显示的占位符
 */
export function SkeletonMermaidDiagram() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}
