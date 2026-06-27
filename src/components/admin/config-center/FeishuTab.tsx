import { useEffect, useState } from 'react';
import { BarChart3, Bell, FolderOpen, Link, LogOut, Plus, Sparkles, TestTube, User } from 'lucide-react';
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
import type { UserResource } from '@/apis/config-api';

interface FeishuTabProps {
  ctrl: ConfigCenterController;
}

export function FeishuTab({ ctrl }: FeishuTabProps) {
  const { config, isEditing } = ctrl;
  const [userResource, setUserResource] = useState<UserResource | null>(null);
  const [resourceExists, setResourceExists] = useState(false);
  const [loadingResource, setLoadingResource] = useState(true);
  const [authStatus, setAuthStatus] = useState<{
    isAuthorized: boolean;
    userInfo?: { name: string; open_id: string };
    remainingSeconds?: number;
  } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // 禁用状态：非编辑模式时禁用所有输入框
  const disabled = !isEditing;

  const loadResourceStatus = async () => {
    setLoadingResource(true);
    const data = await ctrl.loadUserResource();
    if (data) {
      setResourceExists(data.exists);
      setUserResource(data.resource || null);
    }
    setLoadingResource(false);
  };

  const handleInitResource = async () => {
    const adminUserIds = config?.notification.adminUserIds || '';
    const firstUserId = adminUserIds.split(',')[0]?.trim() || '';
    const result = await ctrl.initializeUserResource('feishu', firstUserId);
    if (result) {
      setResourceExists(true);
      setUserResource(result.resource || null);
    }
  };

  const loadAuthStatus = async () => {
    setLoadingAuth(true);
    const data = await ctrl.loadAuthStatus();
    if (data) {
      setAuthStatus({
        isAuthorized: data.isAuthorized,
        userInfo: data.userInfo ? { name: data.userInfo.name, open_id: data.userInfo.open_id } : undefined,
        remainingSeconds: data.remainingSeconds,
      });
    }
    setLoadingAuth(false);
  };

  const handleGoAuth = async () => {
    const authUrl = await ctrl.getAuthUrl();
    if (authUrl) {
      window.open(authUrl, '_blank');
    }
  };

  const handleLogout = async () => {
    const success = await ctrl.logoutAuth('feishu');
    if (success) {
      setAuthStatus(null);
      loadAuthStatus();
    }
  };

  // 加载用户资源状态
  useEffect(() => {
    loadResourceStatus();
    loadAuthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            disabled={disabled}
          />
          <SecretField
            label="App Secret"
            value={config.feishu.appSecret}
            onChange={(v) => ctrl.updateFeishu('appSecret', v)}
            saved={!!config.feishu.appSecret}
            placeholder="应用密钥"
            hint="请妥善保管"
            disabled={disabled}
          />
        </div>
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={() => ctrl.testFeishu('feishu')} loading={ctrl.tabLoading.feishu} icon={<TestTube className="h-4 w-4" />}>测试飞书连接</SecondaryButton>
          </div>
        </div>
      </section>

      {/* 用户授权 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">用户授权</h3>
            <p className="mt-1 text-xs text-slate-500">
              使用您的飞书账号授权后，创建的云资源归属您的个人账号，支持完整的权限管理
            </p>
          </div>
          <StatusBadge
            status={loadingAuth ? 'warn' : (authStatus?.isAuthorized ? 'ok' : 'warn')}
            text={loadingAuth ? '加载中...' : (authStatus?.isAuthorized ? '已授权' : '未授权')}
          />
        </div>

        {loadingAuth ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">正在加载授权状态...</p>
          </div>
        ) : authStatus?.isAuthorized && authStatus.userInfo ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50/50 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{authStatus.userInfo.name}</p>
                <p className="text-xs text-slate-500">OpenID: {authStatus.userInfo.open_id}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">
                  Token 剩余 {authStatus.remainingSeconds ? Math.floor(authStatus.remainingSeconds / 60) : '--'} 分钟
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <SecondaryButton
                onClick={handleLogout}
                loading={ctrl.tabLoading.feishu}
                icon={<LogOut className="h-4 w-4" />}
              >
                退出授权
              </SecondaryButton>
            </div>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">提示：</span>
                Token 即将过期时会自动刷新，无需手动操作。如需切换账号，请先退出当前授权。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoBox type="warn">
              尚未进行用户授权。授权后，创建的云文件夹、多维表格等资源将归属于您的飞书账号，您拥有完全控制权。
            </InfoBox>
            <div className="flex gap-3">
              <PrimaryButton
                onClick={handleGoAuth}
                loading={ctrl.tabLoading.feishu}
                icon={<User className="h-4 w-4" />}
              >
                前往飞书授权
              </PrimaryButton>
            </div>
          </div>
        )}
      </section>

      {/* 用户云资源管理 */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">用户云资源管理</h3>
            <p className="mt-1 text-xs text-slate-500">
              首次使用自动创建专属云文件夹、多维表格，所有文件统一管理
            </p>
          </div>
          <StatusBadge 
            status={loadingResource ? 'warn' : (resourceExists ? 'ok' : 'warn')} 
            text={loadingResource ? '加载中...' : (resourceExists ? '已初始化' : '未初始化')} 
          />
        </div>

        {loadingResource ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">正在加载资源状态...</p>
          </div>
        ) : resourceExists && userResource ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <p className="text-xs font-medium text-slate-500">根文件夹</p>
                <a 
                  href={`https://www.feishu.cn/drive/folder/${userResource.rootFolderToken}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开根文件夹
                </a>
                <p className="mt-1 font-mono text-xs text-slate-500 truncate">{userResource.rootFolderToken}</p>
              </div>
              <div className="rounded-lg border border-green-100 bg-green-50/50 p-3">
                <p className="text-xs font-medium text-slate-500">多维表格</p>
                <div className="mt-1 flex flex-col gap-1">
                  <a 
                    href={`https://www.feishu.cn/base/${userResource.bitableBaseToken}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-green-600 hover:underline"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    打开多维表格
                  </a>
                  <a 
                    href={`https://www.feishu.cn/drive/folder/${userResource.rootFolderToken}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    打开云文档
                  </a>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500 truncate">{userResource.bitableBaseToken}</p>
              </div>
              <div className="rounded-lg border border-purple-100 bg-purple-50/50 p-3">
                <p className="text-xs font-medium text-slate-500">周报归档</p>
                <a 
                  href={`https://www.feishu.cn/drive/folder/${userResource.reportFolderToken}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-sm text-purple-600 hover:underline"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开周报文件夹
                </a>
                <p className="mt-1 font-mono text-xs text-slate-500 truncate">{userResource.reportFolderToken}</p>
              </div>
              <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-3">
                <p className="text-xs font-medium text-slate-500">月报汇总</p>
                <a 
                  href={`https://www.feishu.cn/drive/folder/${userResource.monthFolderToken}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-sm text-orange-600 hover:underline"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  打开月报文件夹
                </a>
                <p className="mt-1 font-mono text-xs text-slate-500 truncate">{userResource.monthFolderToken}</p>
              </div>
            </div>
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">本地环境提示：</span>
                以上 Token 仅存在于当前进程内存，重启后失效。请将 Token 手动写入 .env.local 持久化。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoBox type="warn">
              尚未初始化用户云资源。点击下方按钮，一键创建专属文件夹、多维表格等全套资源。
            </InfoBox>
            <div className="flex gap-3">
              <PrimaryButton 
                onClick={handleInitResource} 
                loading={ctrl.tabLoading.feishu}
                icon={<FolderOpen className="h-4 w-4" />}
              >
                一键初始化云资源
              </PrimaryButton>
            </div>
          </div>
        )}
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
            disabled={disabled}
          />
          <div className="flex gap-3">
            <SecondaryButton onClick={() => ctrl.testNotify('feishu')} loading={ctrl.tabLoading.feishu} icon={<Bell className="h-4 w-4" />}>测试发送消息</SecondaryButton>
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
            disabled={disabled}
          />
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
                disabled={disabled}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${selected ? 'border-blue-300 bg-blue-50 text-blue-700 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {level}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">已选中：{config.tagging.largeTenantLevels.length > 0 ? config.tagging.largeTenantLevels.join('、') : '未选择（默认所有租户同等权重）'}</p>
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
              <PrimaryButton onClick={() => ctrl.createTable('feishu')} loading={ctrl.tabLoading.feishu} icon={<Plus className="h-4 w-4" />}>创建新表格</PrimaryButton>
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
              disabled={disabled}
            />
            <div className="mt-3">
              <PrimaryButton onClick={() => ctrl.linkTable('feishu')} loading={ctrl.tabLoading.feishu} icon={<Link className="h-4 w-4" />}>校验并绑定</PrimaryButton>
            </div>
          </CollapsiblePanel>
        </div>
      </section>
    </div>
  );
}
