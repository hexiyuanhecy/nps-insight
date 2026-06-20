import {
  Cpu,
  FolderOpen,
  Key,
  PlayCircle,
  Plus,
  Save,
  Sparkles,
  Tag,
  TestTube,
  Trash2,
} from 'lucide-react';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import {
  HighlightNotice,
  InfoBox,
  PrimaryButton,
  SecondaryButton,
  SectionTitle,
  SecretField,
  TextArea,
  TextField,
} from '@/components/admin/config-center/ui';
import { DEFAULT_TAG2_PRESET, POPULAR_MODELS, TENANT_LEVELS } from '@/constants/config-center';

interface AiTagsTabProps {
  ctrl: ConfigCenterController;
}

export function AiTagsTab({ ctrl }: AiTagsTabProps) {
  const { config, activeAI } = ctrl;
  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* AI 模型配置：热门模型下拉 + 版本下拉 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Cpu className="h-5 w-5" />} title="AI 模型配置" desc="用于自动打标、生成分析报告等智能功能" />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">模型厂商</label>
            <select
              value={config.ai.provider}
              onChange={(e) => ctrl.handleProviderChange(e.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {POPULAR_MODELS.map((m) => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">当前：{activeAI.name}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">模型版本</label>
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
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {activeAI.needsBaseUrl && (
            <TextField label="自定义 API 地址" value={config.ai.baseUrl} onChange={(v) => ctrl.updateAI('baseUrl', v)} placeholder="https://api.example.com/v1" hint="OpenAI 兼容接口" />
          )}
          <SecretField
            label="Token / API Key"
            value={config.ai.apiKey}
            onChange={(v) => ctrl.updateAI('apiKey', v)}
            saved={!!config.ai.apiKey}
            placeholder={activeAI.placeholderToken}
            hint={config.ai.provider === 'agnesai' ? 'AgnesAI 也需要 Token（当前使用的是你自己的，请妥善保管）' : '用于鉴权'}
          />
          {activeAI.versions.length === 0 && activeAI.needsModelName && (
            <TextField label="模型名称 / model" value={config.ai.model} onChange={(v) => ctrl.updateAI('model', v)} placeholder={activeAI.defaultVersion} hint="作为 chat completions 请求的 model 参数" />
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={ctrl.testAI} loading={ctrl.isLoading} icon={<TestTube className="h-4 w-4" />}>测试连接</SecondaryButton>
            <PrimaryButton onClick={() => ctrl.saveSectionConfig('AI 模型配置')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
          </div>
        </div>
      </section>

      {/* Tag1 一级标签 */}
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={ctrl.addTag1}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" />添加标签
          </button>
          {ctrl.tag1Changed && (
            <SecondaryButton onClick={ctrl.retagHistory} loading={ctrl.isLoading} icon={<PlayCircle className="h-4 w-4" />}>立即重新打标历史数据</SecondaryButton>
          )}
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('标签体系配置')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
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
        <TextArea
          label="Tag2 名称列表（一行一个）"
          value={config.tag2Init}
          onChange={ctrl.updateTag2Init}
          rows={6}
          placeholder={'极速打卡\n休假申请\n加班审批\n移动审批\n报表\n系统异常'}
          hint="仅在标签库为空时生效；已有标签不被覆盖"
        />
        <InfoBox type="info">
          AI 打标流程：先从用户原话提取 Tag3 → 归属到已有 Tag2 → 最后判定 Tag1。Tag2 匹配不到时，AI 会新建。
        </InfoBox>
        <div className="mt-4">
          <PrimaryButton onClick={() => ctrl.saveSectionConfig('Tag2 初始化预设')} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存配置</PrimaryButton>
        </div>
      </section>

      {/* 置信度与大租户拆分 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Key className="h-5 w-5" />} title="置信度" desc="低于阈值的打标结果会标记为「待审核」" />
        <div className="flex flex-wrap items-center gap-3">
          <input
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
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <div className="font-semibold mb-1">📖 置信度如何定义？</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>置信度 = 模型对「本次打标结果是否正确」的信心分数（0-1）。</strong></li>
            <li>当前实现：由模型在 JSON 输出中附带 <code>confidence</code> 字段，或根据「所选 Tag 与原文的语义相似度」归一化后取值。</li>
            <li>当 <code>confidence &lt; 阈值</code> 时，反馈被标记为「待审核」，由人工确认。</li>
          </ul>
        </div>
      </section>

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

      <div className="flex justify-end gap-3">
        <SecondaryButton onClick={ctrl.persistScheduleAndSave} loading={ctrl.isLoading} icon={<Save className="h-4 w-4" />}>保存全部配置</SecondaryButton>
      </div>
    </div>
  );
}
