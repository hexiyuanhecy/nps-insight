import { Bell, Link, Plus, Save, Sparkles, TestTube } from 'lucide-react';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import {
  CollapsiblePanel,
  InfoBox,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SecretField,
  StatusBadge,
  TextField,
} from '@/components/admin/config-center/ui';
import { TENANT_LEVELS } from '@/constants/config-center';

interface FeishuTabProps {
  ctrl: ConfigCenterController;
}

export function FeishuTab({ ctrl }: FeishuTabProps) {
  const { config } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* 飞书应用绑定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">飞书应用绑定</h3>
            <p className="mt-1 text-xs text-slate-500">
              用于调用飞书开放平台 API、发送机器人消息、创建多维表格。<a href="https://open.feishu.cn/document/faq/trouble-shooting/how-to-obtain-app-id" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">如何获取 App ID？</a>
            </p>
          </div>
          <StatusBadge status={config.feishu.appId && config.feishu.appSecret ? 'ok' : 'warn'} text={config.feishu.appId ? '已配置' : '未配置'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="App ID"
            value={config.feishu.appId}
            onChange={(v) => ctrl.updateFeishu('appId', v)}
            placeholder="cli_xxxxxxxxxxxxxxxx"
            hint="飞书应用 ID"
          />
          <SecretField
            label="App Secret"
            value={config.feishu.appSecret}
            onChange={(v) => ctrl.updateFeishu('appSecret', v)}
            saved={!!config.feishu.appSecret}
            placeholder="应用密钥"
            hint="请妥善保管"
          />
        </div>
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={ctrl.testFeishu} loading={ctrl.isLoading} icon={<TestTube className="h-4 w-4" />}>测试飞书连接</SecondaryButton>
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('飞书应用绑定')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      {/* 飞书通知群绑定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Bell className="h-5 w-5" />} title="飞书通知群绑定" desc="配置飞书群通知，用于推送分析报告和告警" />
        <div className="space-y-4">
          <TextField
            label="通知群 ID（多个用英文逗号分隔）"
            value={config.notification.chatIds}
            onChange={(v) => ctrl.updateNotification('chatIds', v)}
            placeholder="oc_xxxxxxxxxxxxxxxx, oc_yyyyyyyyyyyyyyyyyy"
            hint="通过飞书群设置或飞书开放平台获取 chat_id"
          />
          <div className="flex gap-3">
            <SecondaryButton onClick={ctrl.testNotify} loading={ctrl.isLoading} icon={<Bell className="h-4 w-4" />}>测试发送消息</SecondaryButton>
          </div>
          <div className="mt-4">
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('飞书通知群绑定')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      {/* 飞书多维表格管理员配置 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Bell className="h-5 w-5" />} title="飞书多维表格管理员配置" desc="配置多维表格管理员用户" />
        <div className="space-y-4">
          <TextField
            label="表格管理员（飞书用户 ID，多个用英文逗号分隔）"
            value={config.notification.adminUserIds}
            onChange={(v) => ctrl.updateNotification('adminUserIds', v)}
            placeholder="ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, …"
            hint="创建/绑定多维表格时，这些用户将被自动添加为表格协作者"
          />
          <div className="mt-4">
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('飞书多维表格管理员配置')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      {/* 大租户定义 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Sparkles className="h-5 w-5" />} title="大租户定义" desc="选中的租户级别视为「大租户」，在 Top 问题排序中权重更高" />
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3">
          {TENANT_LEVELS.map((level) => {
            const selected = config.tagging.largeTenantLevels.includes(level);
            return (
              <button
                key={level}
                onClick={() => {
                  const next = selected
                    ? config.tagging.largeTenantLevels.filter((l) => l !== level)
                    : [...config.tagging.largeTenantLevels, level];
                  ctrl.updateTagging('largeTenantLevels', next);
                }}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${selected ? 'border-blue-300 bg-blue-50 text-blue-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {level}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">已选中：{config.tagging.largeTenantLevels.length > 0 ? config.tagging.largeTenantLevels.join('、') : '未选择（默认所有租户同等权重）'}</p>
        <div className="mt-4">
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('打标配置')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
        </div>
      </section>

      {/* 飞书多维表格绑定/新建 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">飞书多维表格绑定/新建</h3>
            <p className="mt-1 text-xs text-slate-500">用于存储反馈数据、标签体系与分析结果</p>
          </div>
          <StatusBadge status={config.bitable.appToken ? 'ok' : 'warn'} text={config.bitable.appToken ? '已绑定' : '未绑定'} />
        </div>

        {config.bitable.appToken && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">✓ 当前已绑定表格</p>
            {config.bitable.url && (
              <a href={config.bitable.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-green-800 underline">
                <Link className="h-4 w-4" /> 打开多维表格
              </a>
            )}
            {config.bitable.appToken && <p className="mt-2 font-mono text-xs text-green-700">App Token: {config.bitable.appToken}</p>}
          </div>
        )}

        <div className="space-y-3">
          <CollapsiblePanel
            open={ctrl.bitableCreateOpen}
            onToggle={() => {
              ctrl.setBitableCreateOpen(!ctrl.bitableCreateOpen);
              if (!ctrl.bitableCreateOpen) ctrl.setBitableLinkOpen(false);
            }}
            icon={<Plus className="h-4 w-4" />}
            title="创建新表格"
            subtitle="一键创建预置的 4 张子表（反馈、标签、租户、分析）"
          >
            <InfoBox type="info">系统将在飞书自动创建一个预置 4 张子表的多维表格并绑定到本应用。</InfoBox>
            <div className="mt-3">
              <PrimaryButton onClick={ctrl.createTable} loading={ctrl.isLoading} icon={<Plus className="h-4 w-4" />}>创建新表格</PrimaryButton>
            </div>
          </CollapsiblePanel>

          <CollapsiblePanel
            open={ctrl.bitableLinkOpen}
            onToggle={() => {
              ctrl.setBitableLinkOpen(!ctrl.bitableLinkOpen);
              if (!ctrl.bitableLinkOpen) ctrl.setBitableCreateOpen(false);
            }}
            icon={<Link className="h-4 w-4" />}
            title="绑定已有表格"
            subtitle="把已存在的多维表格通过 App Token 绑定"
          >
            <TextField
              label="App Token"
              value={config.bitable.appToken}
              onChange={(v) => ctrl.updateBitable('appToken', v)}
              placeholder="bascnxxxxxxxxxxxxxxxx"
              hint="从表格 URL /base/ 之后的字符串"
            />
            <div className="mt-3">
              <PrimaryButton onClick={ctrl.linkTable} loading={ctrl.isLoading} icon={<Link className="h-4 w-4" />}>校验并绑定</PrimaryButton>
            </div>
          </CollapsiblePanel>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存全部配置</SecondaryButton>
      </div>
    </div>
  );
}
