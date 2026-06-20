import { Bell, Calendar, Clock, PlayCircle, Save } from 'lucide-react';
import { buildCronFromSchedule } from '@/components/admin/config-center/schedule-utils';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import type { ScheduleUnit } from '@/components/admin/config-center/types';
import {
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  TextField,
  TimePicker,
} from '@/components/admin/config-center/ui';
import { MOCK_LOG_URL } from '@/constants/config-center';

interface OpsTabProps {
  ctrl: ConfigCenterController;
}

export function OpsTab({ ctrl }: OpsTabProps) {
  const { config } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* 定时任务周期 - 自然语言形式 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <SectionTitle icon={<Clock className="h-5 w-5" />} title="定时任务周期" desc="友好选择器会自动生成 Cron；所有时间按服务器时区" />
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={config.schedule.devMode || false}
              onChange={(e) => ctrl.updateSchedule('devMode', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            开发模式（Mock 数据）
          </label>
        </div>

        {/* 数据拉取 */}
        <div className="rounded-lg border border-slate-200 p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">数据拉取周期</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-700">每</span>
            <input
              type="number"
              min={1}
              max={99}
              value={config.schedule.syncEvery}
              onChange={(e) => ctrl.updateSchedule('syncEvery', Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              value={config.schedule.syncUnit}
              onChange={(e) => ctrl.updateSchedule('syncUnit', e.target.value as ScheduleUnit)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="day">天</option>
              <option value="week">周</option>
              <option value="month">月</option>
            </select>
            {config.schedule.syncUnit === 'week' && (
              <>
                <select
                  value={String(config.schedule.syncWeekDay || 1)}
                  onChange={(e) => ctrl.updateSchedule('syncWeekDay', parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option>
                  <option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option>
                </select>
                <span className="text-sm text-slate-600">）</span>
              </>
            )}
            {config.schedule.syncUnit === 'month' && (
              <>
                <span className="text-sm text-slate-600">（每月第</span>
                <select
                  value={String(config.schedule.syncMonthDay || 1)}
                  onChange={(e) => ctrl.updateSchedule('syncMonthDay', parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} 号{[28, 29, 30, 31].includes(n) ? '（若无则取当月最后一天）' : ''}</option>
                  ))}
                </select>
              </>
            )}
            <TimePicker
              value={config.schedule.syncTime}
              onChange={(v) => ctrl.updateSchedule('syncTime', v)}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">预览 Cron：<code className="rounded bg-slate-100 px-2 py-0.5 font-mono">{buildCronFromSchedule(config.schedule.syncUnit, config.schedule.syncEvery, config.schedule.syncTime, config.schedule.syncWeekDay, config.schedule.syncMonthDay)}</code></p>
          <p className="mt-1 text-xs text-slate-500">拉取上一周期的新增反馈并自动打标</p>
        </div>

        {/* 月度分析 */}
        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">月度分析周期</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-700">每</span>
            <input
              type="number"
              min={1}
              max={99}
              value={config.schedule.analysisEvery}
              onChange={(e) => ctrl.updateSchedule('analysisEvery', Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              value={config.schedule.analysisUnit}
              onChange={(e) => ctrl.updateSchedule('analysisUnit', e.target.value as ScheduleUnit)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="day">天</option>
              <option value="week">周</option>
              <option value="month">月</option>
            </select>
            {config.schedule.analysisUnit === 'week' && (
              <>
                <span className="text-sm text-slate-600">（每周</span>
                <select
                  value={String(config.schedule.analysisWeekDay || 1)}
                  onChange={(e) => ctrl.updateSchedule('analysisWeekDay', parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option>
                  <option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option>
                </select>
              </>
            )}
            {config.schedule.analysisUnit === 'month' && (
              <>
                <span className="text-sm text-slate-600">（每月第</span>
                <select
                  value={String(config.schedule.analysisMonthDay || 1)}
                  onChange={(e) => ctrl.updateSchedule('analysisMonthDay', parseInt(e.target.value, 10))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} 号{[28, 29, 30, 31].includes(n) ? '（若无则取当月最后一天）' : ''}</option>
                  ))}
                </select>
              </>
            )}
            <span className="text-sm text-slate-600">时间</span>
            <TimePicker
              value={config.schedule.analysisTime}
              onChange={(v) => ctrl.updateSchedule('analysisTime', v)}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">预览 Cron：<code className="rounded bg-slate-100 px-2 py-0.5 font-mono">{buildCronFromSchedule(config.schedule.analysisUnit, config.schedule.analysisEvery, config.schedule.analysisTime, config.schedule.analysisWeekDay, config.schedule.analysisMonthDay)}</code></p>
          <p className="mt-1 text-xs text-slate-500">自动生成 Top 问题表与会议文档</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={ctrl.runManualSync} loading={ctrl.isLoading} icon={<PlayCircle className="h-4 w-4" />}>立即执行一次同步</PrimaryButton>
          <PrimaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存定时任务配置</PrimaryButton>
          <span className="text-xs text-slate-500">立即拉取数据、打标并更新分析结果</span>
        </div>
      </section>

      {/* 日志平台 URL */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Calendar className="h-5 w-5" />} title="日志平台 URL（可选）" desc="在分析报告中生成可点击的日志查询链接；可先使用系统内置 Mock 体验" />
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

      {/* 运营人员与通知 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Bell className="h-5 w-5" />} title="运营人员与通知" desc="配置飞书群通知与管理员" />
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
          <TextField
            label="表格管理员（飞书用户 ID，多个用英文逗号分隔）"
            value={config.notification.adminUserIds}
            onChange={(v) => ctrl.updateNotification('adminUserIds', v)}
            placeholder="ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx, …"
            hint="用于授予多维表格编辑权限"
          />
          <div className="mt-4">
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('运营人员与通知')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存全部配置</SecondaryButton>
      </div>
    </div>
  );
}
