import { HOME_ROLE_ITEMS } from '@/constants/home-page-content';

export function RoleCards() {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-center text-lg font-semibold text-slate-800">各角色职责</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {HOME_ROLE_ITEMS.map((r) => (
          <div key={r.role} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xl">{r.icon}</span>
              <span className="font-medium text-slate-800">{r.role}</span>
            </div>
            <div className="mb-2 text-xs font-medium text-blue-600">⏰ {r.frequency}</div>
            <p className="text-sm leading-relaxed text-slate-600">{r.duties}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-purple-400" />
          <span className="text-sm text-slate-600">触发</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-400" />
          <span className="text-sm text-slate-600">系统自动</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-400" />
          <span className="text-sm text-slate-600">👁️ 需您关注</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="text-sm text-slate-600">✅ 需您审核</span>
        </div>
      </div>
    </div>
  );
}
