import { Calendar, Database, FileJson, Link, Save, Upload } from 'lucide-react';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import {
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SecretField,
  SelectField,
  TextField,
} from '@/components/admin/config-center/ui';
import { MOCK_LOG_URL } from '@/constants/config-center';

interface DatasourceTabProps {
  ctrl: ConfigCenterController;
}

export function DatasourceTab({ ctrl }: DatasourceTabProps) {
  const { config } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* 反馈来源 - API */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Database className="h-5 w-5" />} title="反馈来源 - API" desc="定期从 Feelgood 或其他数据源拉取反馈" />
        <div className="grid gap-4">
          <TextField label="API 地址" value={config.dataSource.apiUrl} onChange={(v) => ctrl.updateDataSource('apiUrl', v)} placeholder="https://api.feelgood.example.com/feedback" hint="含协议与路径" />
          <SecretField label="API Key" value={config.dataSource.apiKey} onChange={(v) => ctrl.updateDataSource('apiKey', v)} saved={!!config.dataSource.apiKey} placeholder="Bearer token" hint="需要鉴权时填写" />
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

      {/* 反馈来源 - Excel 导入 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Upload className="h-5 w-5" />} title="反馈来源 - Excel 导入" desc="从 Excel 文件批量导入反馈数据" />
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              id="excel-upload-datasource"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) ctrl.importExcel(file);
                // 重置 input 以便重复上传同一文件
                e.target.value = '';
              }}
            />
            <label htmlFor="excel-upload-datasource" className="cursor-pointer">
              <Upload className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">点击上传 Excel 文件</p>
              <p className="mt-1 text-xs text-slate-500">支持 .xlsx、.xls、.csv 格式</p>
            </label>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="font-semibold mb-1">📋 支持的列名</div>
            <p>自动识别以下列名：反馈内容、评分、评价时间、功能模块、来源、租户ID、租户名称、租户规模等。至少需要包含「内容」和「评分」列。</p>
          </div>
        </div>
      </section>

      {/* 其他反馈来源 */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">其他反馈来源</h2>

        {/* Webhook 接收 */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <SectionTitle icon={<FileJson className="h-5 w-5" />} title="Webhook 接收" desc="供外部系统在有新反馈时主动推送" />
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
      </div>

      {/* 日志反馈平台配置 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Calendar className="h-5 w-5" />} title="日志反馈平台配置" desc="在分析报告中生成可点击的日志查询链接；可先使用系统内置 Mock 体验" />
        <TextField
          label="日志平台链接模板"
          value={config.logPlatform.urlTemplate}
          onChange={ctrl.updateLogPlatform}
          placeholder="https://log.example.com/?userId={{userId}}&from={{start}}&to={{end}}"
          hint="支持 {{userId}} / {{start}} / {{end}} 占位符"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => ctrl.updateLogPlatform(MOCK_LOG_URL)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            填入 Mock URL 体验
          </button>
          <span className="text-xs text-slate-500">点击后将示例 URL 回填到上方输入框</span>
        </div>
        <div className="mt-4">
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('日志平台 URL')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存全部配置</SecondaryButton>
      </div>
    </div>
  );
}
