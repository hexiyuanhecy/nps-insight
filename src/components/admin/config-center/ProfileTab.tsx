/**
 * 用户画像 Tab
 * 展示系统为用户生成的反馈特征画像，支持人工调整
 */

'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  User,
  BarChart3,
  Tag,
  Lightbulb,
  Edit3,
  Save,
  X,
  AlertCircle,
  TrendingUp,
  PieChart,
} from 'lucide-react';
import type { ConfigCenterController } from '@/components/admin/config-center/use-config-center';
import { SectionTitle, PrimaryButton, SecondaryButton, InfoBox, ToastStack } from '@/components/admin/config-center/ui';
import type { ToastItem } from '@/components/admin/config-center/types';

interface UserProfileData {
  ownerId: string;
  version: number;
  createdAt: number;
  lastUpdatedAt: number;
  basic: {
    tenantScale: string;
    dataSource?: string;
    usageDays?: number;
    syncFrequency?: string;
  };
  feedbackSignature: {
    totalFeedbacks: number;
    weeklyAverage?: number;
    scoreDistribution?: Record<string, number>;
    tag1Distribution: Array<{ tag: string; count: number; percentage: number }>;
    topTag2?: Array<{ tag: string; count: number }>;
    topTag3?: Array<{ tag: string; count: number }>;
  };
  tagModelSignature: {
    totalTag1: number;
    totalTag2: number;
    totalTag3: number;
    customTagRatio?: number;
  };
  insights?: {
    dominantIssueType?: string;
    improvementOpportunities?: string[];
    riskSignals?: string[];
  };
}

interface UserProfileAdjustment {
  dominantIssueType?: string;
  focusTags?: string[];
  userNotes?: string;
  updatedAt?: number;
}

interface ProfileTabProps {
  ctrl: ConfigCenterController;
}

export function ProfileTab({ ctrl }: ProfileTabProps) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [adjustment, setAdjustment] = useState<UserProfileAdjustment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [editForm, setEditForm] = useState({
    dominantIssueType: '',
    focusTags: '',
    userNotes: '',
  });

  function showToast(text: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      setLoading(true);
      const res = await fetch('/api/user-profile');
      const data = await res.json();
      if (data.success) {
        setProfile(data.data?.profile || null);
        setAdjustment(data.data?.adjustment || null);
      }
    } catch (error) {
      console.error('获取用户画像失败:', error);
      showToast('获取画像失败', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      const res = await fetch('/api/user-profile?action=refresh', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        showToast('画像刷新成功', 'success');
      } else {
        showToast(data.error || '刷新失败', 'error');
      }
    } catch (error) {
      showToast('刷新失败', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  function startEditing() {
    setEditForm({
      dominantIssueType: adjustment?.dominantIssueType || profile?.insights?.dominantIssueType || '',
      focusTags: adjustment?.focusTags?.join(', ') || '',
      userNotes: adjustment?.userNotes || '',
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function saveAdjustment() {
    try {
      const focusTags = editForm.focusTags
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/user-profile?action=adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dominantIssueType: editForm.dominantIssueType || undefined,
          focusTags: focusTags.length ? focusTags : undefined,
          userNotes: editForm.userNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdjustment(data.data);
        setEditing(false);
        showToast('画像调整已保存', 'success');
      } else {
        showToast(data.error || '保存失败', 'error');
      }
    } catch (error) {
      showToast('保存失败', 'error');
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-2 text-slate-500">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>加载用户画像中...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <User className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <h3 className="text-base font-medium text-slate-900">用户画像</h3>
                <p className="text-sm text-slate-500">尚未生成画像，触发一次同步后即可查看</p>
              </div>
            </div>
            <SecondaryButton onClick={handleRefresh} icon={<RefreshCw className="h-4 w-4" />}>
              生成画像
            </SecondaryButton>
          </div>
        </section>
      </div>
    );
  }

  const dominantTag1 = profile.feedbackSignature.tag1Distribution[0];
  const scoreDist = profile.feedbackSignature.scoreDistribution || {};
  const totalScore = Object.values(scoreDist).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />
      {/* 画像概览卡片 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">我的反馈画像</h3>
              <p className="text-sm text-slate-500">
                基于 {profile.feedbackSignature.totalFeedbacks} 条反馈自动生成 · 版本 v{profile.version}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <>
                <SecondaryButton onClick={startEditing} icon={<Edit3 className="h-4 w-4" />}>
                  调整画像
                </SecondaryButton>
                <SecondaryButton
                  onClick={handleRefresh}
                  icon={<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />}
                  disabled={refreshing}
                >
                  刷新
                </SecondaryButton>
              </>
            ) : (
              <>
                <PrimaryButton onClick={saveAdjustment} icon={<Save className="h-4 w-4" />}>
                  保存
                </PrimaryButton>
                <SecondaryButton onClick={cancelEditing} icon={<X className="h-4 w-4" />}>
                  取消
                </SecondaryButton>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400">
          最后更新：{formatDate(profile.lastUpdatedAt)}
          {adjustment?.updatedAt && (
            <span className="ml-4">人工调整：{formatDate(adjustment.updatedAt)}</span>
          )}
        </div>
      </section>

      {/* 编辑表单 */}
      {editing && (
        <section className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-6">
          <SectionTitle icon={<Edit3 className="h-5 w-5" />} title="人工调整画像" desc="修正系统判断，让打标更符合你的业务" />
          
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                主导问题类型 <span className="text-slate-400">（修正 AI 判断）</span>
              </label>
              <input
                type="text"
                value={editForm.dominantIssueType}
                onChange={(e) => setEditForm(f => ({ ...f, dominantIssueType: e.target.value }))}
                placeholder="例如：产品功能体验问题"
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                重点关注标签 <span className="text-slate-400">（用逗号分隔，打标时会优先考虑）</span>
              </label>
              <input
                type="text"
                value={editForm.focusTags}
                onChange={(e) => setEditForm(f => ({ ...f, focusTags: e.target.value }))}
                placeholder="例如：登录, 性能, 数据导出"
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                备注 <span className="text-slate-400">（写给 AI 的补充说明）</span>
              </label>
              <textarea
                value={editForm.userNotes}
                onChange={(e) => setEditForm(f => ({ ...f, userNotes: e.target.value }))}
                placeholder="例如：我们是B端产品，企业客户反馈的权重更高..."
                rows={3}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </section>
      )}

      {/* 基础信息 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<PieChart className="h-5 w-5" />} title="基础信息" desc="租户规模和使用概况" />
        
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs text-slate-500">租户规模</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{profile.basic.tenantScale}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs text-slate-500">累计反馈</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{profile.feedbackSignature.totalFeedbacks}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs text-slate-500">周均反馈</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {profile.feedbackSignature.weeklyAverage?.toFixed?.(1) || 0}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs text-slate-500">标签总数</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {profile.tagModelSignature.totalTag1 + profile.tagModelSignature.totalTag2 + profile.tagModelSignature.totalTag3}
            </div>
          </div>
        </div>
      </section>

      {/* NPS 评分分布 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<BarChart3 className="h-5 w-5" />} title="NPS 评分分布" desc="1-5 分反馈数量分布" />
        
        <div className="mt-4 flex items-end gap-2">
          {['1', '2', '3', '4', '5'].map(score => {
            const count = scoreDist[score] || 0;
            const pct = totalScore > 0 ? (count / totalScore) * 100 : 0;
            const height = Math.max(pct * 2, 20);
            return (
              <div key={score} className="flex flex-1 flex-col items-center">
                <div className="text-xs text-slate-500 mb-1">{count}</div>
                <div
                  className="w-full rounded-t bg-blue-500"
                  style={{ height: `${height}px` }}
                />
                <div className="mt-1 text-xs text-slate-600">{score}分</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tag1 分布 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Tag className="h-5 w-5" />} title="问题类型分布" desc="一级标签（Tag1）占比" />
        
        <div className="mt-4 space-y-3">
          {profile.feedbackSignature.tag1Distribution.slice(0, 7).map((item, idx) => (
            <div key={item.tag} className="flex items-center gap-3">
              <div className="w-24 flex-shrink-0 text-sm text-slate-700 truncate" title={item.tag}>
                {item.tag}
              </div>
              <div className="flex-1">
                <div className="h-6 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${idx === 0 ? 'bg-blue-500' : 'bg-slate-300'}`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
              <div className="w-20 text-right text-sm text-slate-500">
                {item.count} 条 ({item.percentage.toFixed(1)}%)
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 高频 Tag2 / Tag3 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <SectionTitle icon={<TrendingUp className="h-5 w-5" />} title="高频功能模块" desc="二级标签 Top 10" />
          
          <div className="mt-4 space-y-2">
            {profile.feedbackSignature.topTag2?.slice(0, 10).map((item, idx) => (
              <div key={item.tag} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                    {idx + 1}
                  </span>
                  <span className="text-sm text-slate-700">{item.tag}</span>
                </div>
                <span className="text-xs text-slate-500">{item.count} 次</span>
              </div>
            ))}
            {!profile.feedbackSignature.topTag2?.length && (
              <div className="py-4 text-center text-sm text-slate-400">暂无数据</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <SectionTitle icon={<Lightbulb className="h-5 w-5" />} title="高频具体问题" desc="三级标签 Top 10" />
          
          <div className="mt-4 space-y-2">
            {profile.feedbackSignature.topTag3?.slice(0, 10).map((item, idx) => (
              <div key={item.tag} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${idx < 3 ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                    {idx + 1}
                  </span>
                  <span className="text-sm text-slate-700 truncate" title={item.tag}>{item.tag}</span>
                </div>
                <span className="text-xs text-slate-500 flex-shrink-0">{item.count} 次</span>
              </div>
            ))}
            {!profile.feedbackSignature.topTag3?.length && (
              <div className="py-4 text-center text-sm text-slate-400">暂无数据</div>
            )}
          </div>
        </section>
      </div>

      {/* AI 洞察 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Lightbulb className="h-5 w-5" />} title="AI 深度洞察" desc="基于反馈数据的智能分析" />
        
        <div className="mt-4 space-y-4">
          {/* 主导问题类型 */}
          <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
            <div className="text-xs font-medium text-blue-600">主导问题类型</div>
            <div className="mt-1 text-base font-semibold text-slate-900">
              {adjustment?.dominantIssueType || profile.insights?.dominantIssueType || dominantTag1?.tag || '待分析'}
              {adjustment?.dominantIssueType && (
                <span className="ml-2 text-xs font-normal text-amber-600">（已人工调整）</span>
              )}
            </div>
          </div>

          {/* 改进机会 */}
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">改进机会</div>
            {profile.insights?.improvementOpportunities?.length ? (
              <ul className="space-y-1.5">
                {profile.insights.improvementOpportunities.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-green-500">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-400">积累更多反馈后生成</div>
            )}
          </div>

          {/* 风险信号 */}
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">风险信号</div>
            {profile.insights?.riskSignals?.length ? (
              <ul className="space-y-1.5">
                {profile.insights.riskSignals.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-400">暂无风险信号</div>
            )}
          </div>

          {/* 重点关注标签 */}
          {adjustment?.focusTags?.length ? (
            <div className="rounded-lg bg-amber-50 p-4">
              <div className="text-xs font-medium text-amber-600">重点关注（人工设置）</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {adjustment.focusTags.map(tag => (
                  <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* 用户备注 */}
          {adjustment?.userNotes && (
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-600">用户备注</div>
              <div className="mt-1 text-sm text-slate-700">{adjustment.userNotes}</div>
            </div>
          )}
        </div>
      </section>

      {/* 标签模型统计 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <SectionTitle icon={<Tag className="h-5 w-5" />} title="标签模型概况" desc="当前标签库规模" />
        
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center rounded-lg bg-purple-50 p-4">
            <div className="text-2xl font-bold text-purple-600">{profile.tagModelSignature.totalTag1}</div>
            <div className="mt-1 text-xs text-slate-500">一级标签</div>
          </div>
          <div className="text-center rounded-lg bg-blue-50 p-4">
            <div className="text-2xl font-bold text-blue-600">{profile.tagModelSignature.totalTag2}</div>
            <div className="mt-1 text-xs text-slate-500">二级标签</div>
          </div>
          <div className="text-center rounded-lg bg-green-50 p-4">
            <div className="text-2xl font-bold text-green-600">{profile.tagModelSignature.totalTag3}</div>
            <div className="mt-1 text-xs text-slate-500">三级标签</div>
          </div>
        </div>
      </section>
    </div>
  );
}
