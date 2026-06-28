'use client';

import {
  Clock,
  Cpu,
  FolderOpen,
  Key,
  Plus,
  Sparkles,
  Tag,
  TestTube,
  Trash2,
  Zap,
  PlayCircle,
} from 'lucide-react';
import { buildCronFromSchedule } from '@/components/admin/config-center/schedule-utils';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import type { ScheduleUnit } from '@/components/admin/config-center/types';
import {
  AutoSaveField,
  HighlightNotice,
  InfoBox,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SecretField,
  TextArea,
  TextField,
  TimePicker,
} from '@/components/admin/config-center/ui';
import { DEFAULT_TAG2_PRESET, POPULAR_MODELS } from '@/constants/config-center';

interface TaggingTabProps {
  ctrl: ConfigCenterController;
}

export function TaggingTab({ ctrl }: TaggingTabProps) {
  const { config, activeAI } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* AI 模型选择：热门模型下拉 + 版本下拉 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Cpu className="h-5 w-5" />} title="AI 模型选择" desc="用于自动打标、生成分析报告等智能功能" />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">模型厂商</label>
            <AutoSaveField fieldPath="ai.provider" value={config.ai.provider} onSave={ctrl.savePartial}>
              <select
                value={config.ai.provider}
                onChange={(e) => ctrl.handleProviderChange(e.target.value)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {POPULAR_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>{m.name}</option>
                ))}
              </select>
            </AutoSaveField>
            <p className="mt-1 text-xs text-slate-500">当前：{activeAI.name}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">模型版本</label>
            <AutoSaveField fieldPath="ai.modelVersion" value={config.ai.modelVersion || activeAI.defaultVersion} onSave={ctrl.savePartial}>
              <select
                value={config.ai.modelVersion || activeAI.defaultVersion}
                onChange={(e) => {
                  ctrl.updateAI('modelVersion', e.target.value);
                  ctrl.updateAI('model', e.target.value);
                }}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {activeAI.versions.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </AutoSaveField>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {activeAI.needsBaseUrl && (
            <AutoSaveField fieldPath="ai.baseUrl" value={config.ai.baseUrl} onSave={ctrl.savePartial}>
              <TextField label="自定义 API 地址" value={config.ai.baseUrl} onChange={(v) => ctrl.updateAI('baseUrl', v)} placeholder="https://api.example.com/v1" hint="OpenAI 兼容接口" />
            </AutoSaveField>
          )}
          <AutoSaveField fieldPath="ai.apiKey" value={config.ai.apiKey} onSave={ctrl.savePartial}>
            <SecretField
              label="Token / API Key"
              value={config.ai.apiKey}
              onChange={(v) => ctrl.updateAI('apiKey', v)}
              saved={!!config.ai.apiKey}
              placeholder={activeAI.placeholderToken}
              hint={config.ai.provider === 'agnesai' ? 'AgnesAI 也需要 Token（当前使用的是你自己的，请妥善保管）' : '用于鉴权'}
              mode="auto"
            />
          </AutoSaveField>
          {activeAI.versions.length === 0 && activeAI.needsModelName && (
            <AutoSaveField fieldPath="ai.model" value={config.ai.model} onSave={ctrl.savePartial}>
              <TextField label="模型名称 / model" value={config.ai.model} onChange={(v) => ctrl.updateAI('model', v)} placeholder={activeAI.defaultVersion} hint="作为 chat completions 请求的 model 参数" />
            </AutoSaveField>
          )}
        </div>

        <div className="mt-4">
          <SecondaryButton onClick={() => ctrl.testAI('tagging')} loading={ctrl.tabLoading.tagging} icon={<TestTube className="h-4 w-4" />}>测试连接</SecondaryButton>
        </div>
      </section>

      {/* Tag1 一级标签 - 标签体系配置 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Tag className="h-5 w-5" />} title="标签体系配置" desc="三级标签分层，帮助你从粗到细梳理问题" />

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tag1 · 一级分类</p>
            <p className="mt-1 text-xs text-slate-600">问题大类（如：安全合规 / 功能体验 / 无效反馈 …），不常动，需要稳定命名</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tag2 · 二级场景</p>
            <p className="mt-1 text-xs text-slate-600">功能模块 / 业务场景，AI 会先从预设里匹配，匹配不到时可自由创建</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tag3 · 三级问题</p>
            <p className="mt-1 text-xs text-slate-600">从用户原话提炼的具体问题点（如「登录失败」「加载慢」），粒度最细</p>
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-900">Tag1 一级标签配置</h4>
          <HighlightNotice>
            <strong>⚠ Tag1 是稳定分类，建议命名保持一致并长期使用。</strong> 例如「安全」改为<strong>安全合规</strong>、「无效」改为<strong>无效反馈</strong>后，建议<strong>立即重新打标历史数据</strong>。
          </HighlightNotice>
        </div>
        <AutoSaveField fieldPath="tag1" value={config.tag1} onSave={ctrl.savePartial}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="pb-2 pr-4 text-left font-medium w-1/4">标签名称</th>
                  <th className="pb-2 pr-4 text-left font-medium">定义说明（让 AI 理解）</th>
                  <th className="pb-2 pr-4 text-left font-medium w-20 text-center">启用</th>
                  <th className="pb-2 pr-4 text-left font-medium w-16"></th>
                </tr>
              </thead>
              <tbody>
                {config.tag1.map((tag, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={tag.name}
                        onChange={(e) => ctrl.updateTag1(idx, 'name', e.target.value)}
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="如：疑似Bug"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={tag.definition}
                        onChange={(e) => ctrl.updateTag1(idx, 'definition', e.target.value)}
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="标签的定义说明"
                      />
                    </td>
                    <td className="py-2 pr-4 text-center">
                      <input
                        type="checkbox"
                        checked={tag.enabled}
                        onChange={(e) => ctrl.updateTag1(idx, 'enabled', e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <button
                        onClick={() => ctrl.removeTag1(idx)}
                        disabled={config.tag1.length <= 1}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="删除标签"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AutoSaveField>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={ctrl.addTag1}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" />添加标签
          </button>
          {ctrl.tag1Changed && (
            <SecondaryButton onClick={() => ctrl.retagHistory('tagging')} loading={ctrl.tabLoading.tagging} icon={<PlayCircle className="h-4 w-4" />}>重新打标历史数据</SecondaryButton>
          )}
        </div>
      </section>

      {/* Tag2 初始化预设 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<FolderOpen className="h-5 w-5" />} title="Tag2 初始化预设" desc="首次使用时可预置一批二级标签；系统内置了一个示例供参考" />
        <div className="flex flex-wrap items-start gap-3">
          <button
            onClick={() => ctrl.setConfig({ ...config, tag2Init: DEFAULT_TAG2_PRESET })}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Sparkles className="h-4 w-4" /> 载入系统内置示例
          </button>
        </div>
        <AutoSaveField fieldPath="tag2Init" value={config.tag2Init} onSave={ctrl.savePartial}>
          <TextArea
            label="Tag2 名称列表（一行一个）"
            value={config.tag2Init}
            onChange={ctrl.updateTag2Init}
            rows={6}
            placeholder={'极速打卡\n休假申请\n加班审批\n移动审批\n报表\n系统异常'}
            hint="仅在标签库为空时生效；已有标签不被覆盖"
          />
        </AutoSaveField>
        <InfoBox type="info">
          AI 打标流程：先从用户原话提取 Tag3 → 归属到已有 Tag2 → 最后判定 Tag1。Tag2 匹配不到时，AI 会新建。
        </InfoBox>
      </section>

      {/* 置信度阈值 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Key className="h-5 w-5" />} title="置信度阈值" desc="低于阈值的打标结果会标记为「待审核」" />
        <AutoSaveField
          fieldPath="tagging.confidenceThreshold"
          value={config.tagging.confidenceThreshold}
          onSave={ctrl.savePartial}
          getValueFromDOM={() => {
            const input = document.getElementById('confidence-threshold-input');
            return input ? parseFloat((input as HTMLInputElement).value) : undefined;
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="confidence-threshold-input"
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={config.tagging.confidenceThreshold}
              onChange={(e) => ctrl.updateTagging('confidenceThreshold', parseFloat(e.target.value) || 0.8)}
              className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="text-xs text-slate-500">默认 0.8；调低 = 更信任 AI；调高 = 更多走人工审核</span>
          </div>
        </AutoSaveField>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <div className="mb-1 font-semibold">📖 置信度如何定义？</div>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>置信度 = 模型对「本次打标结果是否正确」的信心分数（0-1）。</strong></li>
            <li>当前实现：由模型在 JSON 输出中附带 <code>confidence</code> 字段，或根据「所选 Tag 与原文的语义相似度」归一化后取值。</li>
            <li>当 <code>confidence &lt; 阈值</code> 时，反馈被标记为「待审核」，由人工确认。</li>
          </ul>
        </div>
      </section>

      {/* 定时任务周期 - 自然语言形式 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <SectionTitle icon={<Clock className="h-5 w-5" />} title="定时任务周期" desc="友好选择器会自动生成 Cron；所有时间按服务器时区" />
          <AutoSaveField fieldPath="schedule.devMode" value={config.schedule.devMode || false} onSave={ctrl.savePartial}>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={config.schedule.devMode || false}
                onChange={(e) => ctrl.updateSchedule('devMode', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              开发模式（Mock 数据）
            </label>
          </AutoSaveField>
        </div>

        {/* 数据拉取 */}
        <div className="rounded-lg border border-slate-200 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">数据拉取周期</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-700">每</span>
            <AutoSaveField fieldPath="schedule.syncEvery" value={config.schedule.syncEvery} onSave={ctrl.savePartial}>
              <input
                type="number"
                min={1}
                max={99}
                value={config.schedule.syncEvery}
                onChange={(e) => ctrl.updateSchedule('syncEvery', Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </AutoSaveField>
            <AutoSaveField fieldPath="schedule.syncUnit" value={config.schedule.syncUnit} onSave={ctrl.savePartial}>
              <select
                value={config.schedule.syncUnit}
                onChange={(e) => ctrl.updateSchedule('syncUnit', e.target.value as ScheduleUnit)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="day">天</option>
                <option value="week">周</option>
                <option value="month">月</option>
              </select>
            </AutoSaveField>
            {config.schedule.syncUnit === 'week' && (
              <>
                <AutoSaveField fieldPath="schedule.syncWeekDay" value={config.schedule.syncWeekDay || 1} onSave={ctrl.savePartial}>
                  <select
                    value={String(config.schedule.syncWeekDay || 1)}
                    onChange={(e) => ctrl.updateSchedule('syncWeekDay', parseInt(e.target.value, 10))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option>
                    <option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option>
                  </select>
                </AutoSaveField>
                <span className="text-sm text-slate-600">）</span>
              </>
            )}
            {config.schedule.syncUnit === 'month' && (
              <>
                <span className="text-sm text-slate-600">（每月第</span>
                <AutoSaveField fieldPath="schedule.syncMonthDay" value={config.schedule.syncMonthDay || 1} onSave={ctrl.savePartial}>
                  <select
                    value={String(config.schedule.syncMonthDay || 1)}
                    onChange={(e) => ctrl.updateSchedule('syncMonthDay', parseInt(e.target.value, 10))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} 号</option>
                    ))}
                  </select>
                </AutoSaveField>
              </>
            )}
            <AutoSaveField fieldPath="schedule.syncTime" value={config.schedule.syncTime} onSave={ctrl.savePartial}>
              <TimePicker
                value={config.schedule.syncTime}
                onChange={(v) => ctrl.updateSchedule('syncTime', v)}
              />
            </AutoSaveField>
          </div>
          <p className="mt-2 text-xs text-slate-500">预览 Cron：<code className="rounded bg-slate-100 px-2 py-0.5 font-mono">{config.schedule.syncCron || buildCronFromSchedule(config.schedule.syncUnit, config.schedule.syncEvery, config.schedule.syncTime, config.schedule.syncWeekDay, config.schedule.syncMonthDay)}</code></p>
          <p className="mt-1 text-xs text-slate-500">拉取上一周期的新增反馈并自动打标</p>
        </div>

        {/* 月度分析 */}
        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">月度分析周期</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-700">每</span>
            <AutoSaveField fieldPath="schedule.analysisEvery" value={config.schedule.analysisEvery} onSave={ctrl.savePartial}>
              <input
                type="number"
                min={1}
                max={99}
                value={config.schedule.analysisEvery}
                onChange={(e) => ctrl.updateSchedule('analysisEvery', Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </AutoSaveField>
            <AutoSaveField fieldPath="schedule.analysisUnit" value={config.schedule.analysisUnit} onSave={ctrl.savePartial}>
              <select
                value={config.schedule.analysisUnit}
                onChange={(e) => ctrl.updateSchedule('analysisUnit', e.target.value as ScheduleUnit)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="day">天</option>
                <option value="week">周</option>
                <option value="month">月</option>
              </select>
            </AutoSaveField>
            {config.schedule.analysisUnit === 'week' && (
              <>
                <span className="text-sm text-slate-600">（每周</span>
                <AutoSaveField fieldPath="schedule.analysisWeekDay" value={config.schedule.analysisWeekDay || 1} onSave={ctrl.savePartial}>
                  <select
                    value={String(config.schedule.analysisWeekDay || 1)}
                    onChange={(e) => ctrl.updateSchedule('analysisWeekDay', parseInt(e.target.value, 10))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="1">周一</option><option value="2">周二</option><option value="3">周三</option>
                    <option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option>
                  </select>
                </AutoSaveField>
              </>
            )}
            {config.schedule.analysisUnit === 'month' && (
              <>
                <span className="text-sm text-slate-600">（每月第</span>
                <AutoSaveField fieldPath="schedule.analysisMonthDay" value={config.schedule.analysisMonthDay || 1} onSave={ctrl.savePartial}>
                  <select
                    value={String(config.schedule.analysisMonthDay || 1)}
                    onChange={(e) => ctrl.updateSchedule('analysisMonthDay', parseInt(e.target.value, 10))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} 号</option>
                    ))}
                  </select>
                </AutoSaveField>
              </>
            )}
            <span className="text-sm text-slate-600">时间</span>
            <AutoSaveField fieldPath="schedule.analysisTime" value={config.schedule.analysisTime} onSave={ctrl.savePartial}>
              <TimePicker
                value={config.schedule.analysisTime}
                onChange={(v) => ctrl.updateSchedule('analysisTime', v)}
              />
            </AutoSaveField>
          </div>
          <p className="mt-2 text-xs text-slate-500">预览 Cron：<code className="rounded bg-slate-100 px-2 py-0.5 font-mono">{config.schedule.analysisCron || buildCronFromSchedule(config.schedule.analysisUnit, config.schedule.analysisEvery, config.schedule.analysisTime, config.schedule.analysisWeekDay, config.schedule.analysisMonthDay)}</code></p>
          <p className="mt-1 text-xs text-slate-500">自动生成 Top 问题表与会议文档</p>
        </div>

        {/* 手动触发任务 */}
        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-slate-700">手动触发任务</span>
            <span className="text-xs text-slate-500">（点击后请查看浏览器控制台和终端日志）</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => ctrl.runManualSync('tagging')} loading={ctrl.tabLoading.tagging} icon={<PlayCircle className="h-4 w-4" />}>立即执行一次同步</PrimaryButton>
            <span className="text-xs text-slate-500">立即拉取数据、打标并更新分析结果</span>
          </div>
        </div>
      </section>
    </div>
  );
}
