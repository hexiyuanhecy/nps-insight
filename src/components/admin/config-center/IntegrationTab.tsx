import { Database, FileJson, Link, Plus, Save, TestTube } from 'lucide-react';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import {
  CollapsiblePanel,
  InfoBox,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SecretField,
  SelectField,
  StatusBadge,
  TextField,
} from '@/components/admin/config-center/ui';

interface IntegrationTabProps {
  ctrl: ConfigCenterController;
}

export function IntegrationTab({ ctrl }: IntegrationTabProps) {
  const { config } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* 飞书基础集成 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">飞书基础集成</h3>
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
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('飞书基础集成')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      {/* 多维表格绑定 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">多维表格绑定</h3>
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

      {/* 数据源 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Database className="h-5 w-5" />} title="数据源（Feelgood）" desc="定期从 Feelgood 或其他数据源拉取反馈" />
        <div className="grid gap-4">
          <TextField label="API 地址" value={config.dataSource.apiUrl} onChange={(v) => ctrl.updateDataSource('apiUrl', v)} placeholder="https://api.feelgood.example.com/feedback" hint="含协议与路径" />
          <TextField label="API Key" value={config.dataSource.apiKey} onChange={(v) => ctrl.updateDataSource('apiKey', v)} placeholder="Bearer token" hint="需要鉴权时填写" />
          <TextField label="查询参数（可选）" value={config.dataSource.queryParams} onChange={(v) => ctrl.updateDataSource('queryParams', v)} placeholder="type=nps&status=new" hint="拼接到 URL 后面" />
          <SelectField
            label="时间范围规则"
            value={config.dataSource.timeRule}
            options={[
              { value: 'lastWeek', label: '最近一周' },
              { value: 'lastMonth', label: '最近一月' },
              { value: 'custom', label: '自定义（由查询参数决定）' },
            ]}
            onChange={(v) => ctrl.updateDataSource('timeRule', v as typeof config.dataSource.timeRule)}
          />
        </div>
        <div className="mt-4">
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('数据源')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
        </div>
      </section>

      {/* Webhook 接收地址 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<FileJson className="h-5 w-5" />} title="Webhook 接收地址" desc="供外部系统在有新反馈时主动推送" />
        <TextField
          label="接收端点"
          value={config.webhook.url || '/api/webhook/feelgood'}
          onChange={ctrl.updateWebhook}
          placeholder="/api/webhook/feelgood"
          hint="外部系统把新反馈 POST 到这里"
        />
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <div className="font-semibold mb-1">📖 这个地址是做什么用的？</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Webhook 接收地址 = 你的服务暴露的 HTTP 端点，比如 <code>/api/webhook/feelgood</code></li>
            <li>外部系统（Feelgood、工单、CRM 等）在产生新反馈时，会把数据 POST 到这里</li>
            <li>相比「定期拉取」更及时，能近乎实时入库并自动打标</li>
            <li>与飞书无关，不依赖 App ID / Secret</li>
            <li>建议同时开启「定期拉取」+「Webhook」双保险</li>
          </ul>
        </div>
        <div className="mt-4">
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('Webhook 接收地址')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存全部配置</SecondaryButton>
      </div>
    </div>
  );
}
