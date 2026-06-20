import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionTitle({ icon, title, desc }: { icon: ReactNode; title: string; desc?: string }) {
  return (
    <div className="mb-5 flex items-start gap-2">
      <div className="mt-0.5 text-blue-600">{icon}</div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

/** 可折叠面板（用于：创建新表格 / 绑定已有表格 的展开区域） */
export function CollapsiblePanel({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border transition-colors ${open ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${open ? 'bg-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-200/60 bg-white px-5 py-5">{children}</div>}
    </section>
  );
}

export function HighlightNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <InfoIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="leading-5">{children}</div>
    </div>
  );
}

export function StatusBadge({ status, text }: { status: 'ok' | 'warn' | 'none'; text: string }) {
  const styles = {
    ok: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-700',
    none: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'ok' && <CheckCircle className="h-3 w-3" />}
      {status === 'warn' && <AlertCircle className="h-3 w-3" />}
      {text}
    </span>
  );
}

export function InfoBox({ type = 'info', children }: { type?: 'info' | 'warn' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    success: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}
