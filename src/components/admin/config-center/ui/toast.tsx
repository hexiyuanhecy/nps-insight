import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import type { ToastItem } from '@/components/admin/config-center/types';

/** 右上角 Toast（统一弹出样式） */
export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-6 top-6 z-[100] flex w-[340px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border p-3 shadow-lg backdrop-blur ${
            t.type === 'success'
              ? 'border-green-200 bg-green-50/95 text-green-800'
              : t.type === 'error'
                ? 'border-red-200 bg-red-50/95 text-red-800'
                : 'border-slate-200 bg-white/95 text-slate-700'
          }`}
        >
          <div className="flex items-start gap-2 text-sm leading-5">
            {t.type === 'success' && <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            {t.type === 'error' && <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            {t.type === 'info' && <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <div className="flex-1">{t.text}</div>
            <button onClick={() => onDismiss(t.id)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
