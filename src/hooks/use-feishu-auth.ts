'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { isFeishuClientByUA } from '@/lib/feishu/feishu-env';
import {
  getAuthStatus,
  getAuthUrl,
  authCallback,
} from '@/apis/config-api';

/**
 * 飞书授权 Hook
 * 采用飞书官方推荐的免登方案：
 * - 飞书环境：自动跳转授权页面，飞书客户端自动免登（用户无感知）
 * - 浏览器环境：点击按钮后新窗口打开授权页面
 * 
 * 参考文档：https://open.feishu.cn/document/quickly-create-a-login-free-web-app/introduction
 */

export interface AuthState {
  isAuthorized: boolean;
  loading: boolean;
  authorizing: boolean;
  userInfo?: {
    name: string;
    open_id: string;
  };
  remainingSeconds?: number;
}

export interface UseFeishuAuthOptions {
  autoSilentAuth?: boolean;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

function logInfo(message: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[FeishuAuth] ${message}`, data);
  } else {
    console.log(`[FeishuAuth] ${message}`);
  }
}

function logError(message: string, error?: unknown) {
  if (error !== undefined) {
    console.error(`[FeishuAuth] ${message}`, error);
  } else {
    console.error(`[FeishuAuth] ${message}`);
  }
}

function logWarn(message: string, data?: unknown) {
  if (data !== undefined) {
    console.warn(`[FeishuAuth] ${message}`, data);
  } else {
    console.warn(`[FeishuAuth] ${message}`);
  }
}

/**
 * 检测是否在飞书客户端内
 * 优先使用 User-Agent 检测，简单可靠，不依赖 JSAPI 注入时机
 */
function isFeishuEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return isFeishuClientByUA();
}

export function useFeishuAuth(options: UseFeishuAuthOptions = {}) {
  const { autoSilentAuth = true, onSuccess, onError } = options;
  const [authState, setAuthState] = useState<AuthState>({
    isAuthorized: false,
    loading: true,
    authorizing: false,
  });
  const autoAuthTriedRef = useRef(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4500);
    if (type === 'error' && onError) {
      onError(text);
    }
    if (type === 'success' && onSuccess) {
      onSuccess();
    }
  }, [onError, onSuccess]);

  /**
   * 加载授权状态
   */
  const loadAuthStatus = useCallback(async () => {
    logInfo('开始加载授权状态');
    try {
      const result = await getAuthStatus();
      if (result.success && result.data) {
        logInfo('授权状态加载成功', {
          isAuthorized: result.data.isAuthorized,
          userName: result.data.userInfo?.name,
        });
        setAuthState({
          isAuthorized: result.data.isAuthorized,
          loading: false,
          authorizing: false,
          userInfo: result.data.userInfo,
          remainingSeconds: result.data.remainingSeconds,
        });
        return result.data.isAuthorized;
      }
      logWarn('授权状态加载失败', result.error);
      setAuthState((prev) => ({ ...prev, loading: false, authorizing: false }));
      return false;
    } catch (error) {
      logError('获取授权状态异常', error);
      setAuthState((prev) => ({ ...prev, loading: false, authorizing: false }));
      return false;
    }
  }, []);

  /**
   * 获取授权 URL
   */
  const fetchAuthUrl = useCallback(async (): Promise<string | null> => {
    try {
      const result = await getAuthUrl();
      if (result.success && result.data?.authUrl) {
        logInfo('获取授权链接成功');
        return result.data.authUrl;
      }
      logError('获取授权链接失败', result.error);
      showToast('无法获取授权链接，请检查飞书应用配置', 'error');
      return null;
    } catch (error) {
      logError('获取授权链接异常', error);
      const errMsg = error instanceof Error ? error.message : '未知错误';
      showToast('获取授权链接失败：' + errMsg, 'error');
      return null;
    }
  }, [showToast]);

  /**
   * 飞书环境授权：当前页面跳转授权页面，飞书自动免登
   */
  const doAuthInFeishu = useCallback(async () => {
    logInfo('飞书环境授权流程：跳转授权页面（自动免登）');
    setAuthState((prev) => ({ ...prev, authorizing: true }));

    const authUrl = await fetchAuthUrl();
    if (!authUrl) {
      setAuthState((prev) => ({ ...prev, authorizing: false }));
      return false;
    }

    logInfo('跳转到飞书授权页面', { authUrl });
    // 在当前页面跳转，飞书客户端会自动免登并回调
    window.location.href = authUrl;
    return true;
  }, [fetchAuthUrl]);

  /**
   * 浏览器环境授权：新窗口打开授权页面
   */
  const doAuthInBrowser = useCallback(async () => {
    logInfo('浏览器环境授权流程：新窗口打开授权页面');

    const authUrl = await fetchAuthUrl();
    if (!authUrl) {
      return false;
    }

    logInfo('新窗口打开飞书授权页面');
    window.open(authUrl, '_blank');
    return true;
  }, [fetchAuthUrl]);

  /**
   * 使用授权码完成后端授权
   */
  const doAuthCallback = useCallback(async (code: string): Promise<boolean> => {
    logInfo('开始调用后端授权接口');
    try {
      const result = await authCallback(code);
      if (result.success && result.data) {
        logInfo('后端授权成功', {
          userName: result.data.userInfo?.name,
          hasToken: !!result.data.tokenExpiresAt,
        });
        setAuthState({
          isAuthorized: true,
          loading: false,
          authorizing: false,
          userInfo: result.data.userInfo,
          remainingSeconds: result.data.tokenExpiresAt
            ? result.data.tokenExpiresAt - Math.floor(Date.now() / 1000)
            : undefined,
        });
        showToast(`授权成功：${result.data.userInfo?.name || '用户'}`, 'success');
        return true;
      } else {
        const errMsg = result.error || '授权失败';
        logError('后端授权失败', errMsg);
        showToast(errMsg, 'error');
        return false;
      }
    } catch (error) {
      logError('后端授权异常', error);
      const errMsg = error instanceof Error ? error.message : '未知错误';
      showToast('授权失败：' + errMsg, 'error');
      return false;
    }
  }, [showToast]);

  /**
   * 执行授权
   * - 飞书环境：当前页面跳转授权页面（自动免登）
   * - 浏览器环境：新窗口打开授权页面
   */
  const doAuth = useCallback(async (): Promise<boolean> => {
    const inFeishu = isFeishuEnvironment();
    logInfo('开始执行授权', { inFeishu });

    if (inFeishu) {
      return await doAuthInFeishu();
    } else {
      return await doAuthInBrowser();
    }
  }, [doAuthInFeishu, doAuthInBrowser]);

  // 初始加载：获取授权状态
  useEffect(() => {
    logInfo('Hook 初始化，开始加载授权状态');
    void loadAuthStatus();
  }, [loadAuthStatus]);

  // 飞书环境 + 未授权 + 自动免登开启：自动跳转授权页面
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!autoSilentAuth) return;
    if (authState.loading) return;
    if (authState.isAuthorized) return;
    if (authState.authorizing) return;
    if (autoAuthTriedRef.current) return;

    const inFeishu = isFeishuEnvironment();
    if (!inFeishu) {
      autoAuthTriedRef.current = true;
      return;
    }

    autoAuthTriedRef.current = true;
    logInfo('检测到飞书环境且未授权，自动跳转授权页面实现免登');

    // 延迟 300ms，让页面先渲染出来
    const timer = setTimeout(() => {
      void doAuth();
    }, 300);

    return () => clearTimeout(timer);
  }, [autoSilentAuth, authState.loading, authState.isAuthorized, authState.authorizing, doAuth]);

  // 检查 URL 中的 auth_error 参数
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      const decodedError = decodeURIComponent(authError);
      logError('检测到 URL 中的授权错误参数', decodedError);
      showToast('授权失败：' + decodedError, 'error');
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_error');
      window.history.replaceState({}, '', url.toString());
      logInfo('已清除 URL 中的 auth_error 参数');
    }
  }, [showToast]);

  // 监听来自新窗口的授权结果消息（浏览器环境下新窗口授权完成后通知原窗口）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessage = (event: MessageEvent) => {
      // 验证消息来源
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'feishu-auth-callback') return;

      logInfo('收到授权结果消息', event.data);

      if (event.data.success) {
        // 授权成功，刷新授权状态
        logInfo('新窗口授权成功，刷新授权状态');
        showToast(
          event.data.userName
            ? `授权成功：${event.data.userName}`
            : '授权成功',
          'success'
        );
        void loadAuthStatus();
      } else {
        // 授权失败
        const errorMsg = event.data.error || '授权失败';
        logError('新窗口授权失败', errorMsg);
        showToast('授权失败：' + errorMsg, 'error');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadAuthStatus, showToast]);

  return {
    authState,
    loadAuthStatus,
    doAuth,
    doAuthCallback,
    toastMsg,
    showToast,
  };
}
