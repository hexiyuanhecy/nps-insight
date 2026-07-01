'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { isFeishuClientByUA, getUserAgent } from '@/lib/feishu/feishu-env';
import {
  getAuthStatus,
  getAuthUrl,
  authCallback,
  getJsapiConfig,
} from '@/apis/config-api';

/**
 * 飞书授权 Hook
 * 采用飞书官方推荐的免登方案：
 * - 飞书环境：优先 JSAPI 免登（无跳转），失败则降级为页面跳转授权
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

export interface AuthLogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: string;
}

// 日志前缀，方便在控制台筛选
const LOG_PREFIX = '[FeishuAuth]';
// 全局日志存储（用于多实例共享）
let globalLogs: AuthLogEntry[] = [];
let logIdCounter = 0;
const MAX_LOGS = 100;

function addLog(level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  let dataStr: string | undefined;
  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        dataStr = data.message + (data.stack ? '\n' + data.stack : '');
      } else if (typeof data === 'object') {
        dataStr = JSON.stringify(data, Object.getOwnPropertyNames(data), 2);
      } else {
        dataStr = String(data);
      }
      if (dataStr.length > 1000) {
        dataStr = dataStr.substring(0, 1000) + '...';
      }
    } catch {
      dataStr = String(data);
    }
  }
  const entry: AuthLogEntry = {
    id: logIdCounter++,
    timestamp,
    level,
    message,
    data: dataStr,
  };
  globalLogs.unshift(entry);
  if (globalLogs.length > MAX_LOGS) {
    globalLogs = globalLogs.slice(0, MAX_LOGS);
  }
}

function logInfo(message: string, data?: unknown) {
  addLog('info', message, data);
  if (data !== undefined) {
    console.log(`${LOG_PREFIX} ${message}`, data);
  } else {
    console.log(`${LOG_PREFIX} ${message}`);
  }
}

function logError(message: string, error?: unknown) {
  addLog('error', message, error);
  if (error !== undefined) {
    console.error(`${LOG_PREFIX} ${message}`, error);
  } else {
    console.error(`${LOG_PREFIX} ${message}`);
  }
}

function logWarn(message: string, data?: unknown) {
  addLog('warn', message, data);
  if (data !== undefined) {
    console.warn(`${LOG_PREFIX} ${message}`, data);
  } else {
    console.warn(`${LOG_PREFIX} ${message}`);
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
  const ua = getUserAgent();
  const uaResult = isFeishuClientByUA();
  // 打印实际 UA，方便排查
  logInfo(`环境检测 - User-Agent: ${uaResult ? '是飞书' : '不是飞书'}`);
  logInfo(`当前 UA: ${ua.substring(0, 200)}`);
  return uaResult;
}

/**
 * 检测飞书 JSAPI 是否已注入
 * 飞书 WebView 可能注入的全局对象：tt, lark, ft, h5sdk
 */
function isJsapiInjected(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  const injected = !!(win.tt || win.lark || win.ft || win.h5sdk);
  if (injected) {
    const names: string[] = [];
    if (win.tt) names.push('tt');
    if (win.lark) names.push('lark');
    if (win.ft) names.push('ft');
    if (win.h5sdk) names.push('h5sdk');
    logInfo(`JSAPI 已注入，检测到对象: ${names.join(', ')}`);
  }
  return injected;
}

/**
 * 获取飞书 JSAPI 客户端对象
 * 优先级：tt > lark > ft > h5sdk
 */
function getJsapiClient(): any {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  return win.tt || win.lark || win.ft || win.h5sdk || null;
}

/**
 * 动态加载飞书 JS SDK
 * 飞书桌面端 WebView 可能不会自动注入 JSAPI，需要手动引入 SDK  */
function loadFeishuJsSdk(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    const win = window as any;
    // 已经加载过了
    if (win.tt || win.lark || win.h5sdk) {
      resolve(true);
      return;
    }
    // 避免重复加载
    if (win.__feishuSdkLoading) {
      resolve(false);
      return;
    }
    win.__feishuSdkLoading = true;

    logInfo('动态加载飞书 JS SDK');
    const script = document.createElement('script');
    script.src = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.45.js';
    script.async = true;
    script.onload = () => {
      logInfo('飞书 JS SDK 加载成功');
      win.__feishuSdkLoading = false;
      resolve(true);
    };
    script.onerror = () => {
      logError('飞书 JS SDK 加载失败');
      win.__feishuSdkLoading = false;
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * 等待 JSAPI 注入
 * 飞书 WebView 加载页面后，JSAPI 可能需要一点时间才能注入完成
 * 如果没有自动注入，则尝试动态加载 JS SDK
 */
function waitForJsapi(timeout: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isJsapiInjected()) {
      resolve(true);
      return;
    }

    logInfo(`等待 JSAPI 注入，超时时间: ${timeout}ms`);
    const startTime = Date.now();
    let sdkLoadStarted = false;

    const checkInterval = setInterval(() => {
      if (isJsapiInjected()) {
        clearInterval(checkInterval);
        const elapsed = Date.now() - startTime;
        logInfo(`JSAPI 注入成功，耗时: ${elapsed}ms`);
        resolve(true);
        return;
      }

      // 1秒后还没注入，尝试动态加载 SDK
      if (!sdkLoadStarted && Date.now() - startTime > 1000) {
        sdkLoadStarted = true;
        logInfo('1秒内未检测到 JSAPI，尝试动态加载 JS SDK');
        void loadFeishuJsSdk();
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        logWarn(`JSAPI 注入超时 (${timeout}ms)`);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * 调用 JSAPI 方法，兼容 Promise 和回调两种风格
 */
function callJsapiMethod(client: any, methodPath: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    // 解析方法路径，如 'oauth.getAuthCode'
    const parts = methodPath.split('.');
    let obj = client;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj?.[parts[i]];
      if (!obj) {
        reject(new Error(`方法路径不存在: ${methodPath}`));
        return;
      }
    }
    const methodName = parts[parts.length - 1];
    const method = obj[methodName];

    if (typeof method !== 'function') {
      reject(new Error(`方法不存在: ${methodPath}`));
      return;
    }

    // 尝试 Promise 风格调用
    try {
      const result = method.call(obj, {
        ...params,
        success: (res: unknown) => resolve(res),
        fail: (err: unknown) => reject(err),
        complete: () => {},
      });
      // 如果返回了 Promise，也支持
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

export function useFeishuAuth(options: UseFeishuAuthOptions = {}) {
  const { autoSilentAuth = true, onSuccess, onError } = options;
  const [authState, setAuthState] = useState<AuthState>({
    isAuthorized: false,
    loading: true,
    authorizing: false,
  });
  const autoAuthTriedRef = useRef(false);
  const jsapiReadyRef = useRef(false);
  const jsapiConfigTriedRef = useRef(false);
  const doAuthInFeishuJSAPIRef = useRef<typeof doAuthInFeishuJSAPI | null>(null);
  const doAuthInFeishuRef = useRef<typeof doAuthInFeishu | null>(null);
  const feishuAppIdRef = useRef<string>('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [debugLogs, setDebugLogs] = useState<AuthLogEntry[]>([]);

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
   * 初始化飞书 JSAPI
   * 尝试多种参数格式和调用方式，确保兼容性
   */
  const initJsapi = useCallback(async (): Promise<boolean> => {
    if (jsapiReadyRef.current) {
      logInfo('JSAPI 已初始化，直接返回');
      return true;
    }
    if (jsapiConfigTriedRef.current) {
      logInfo('JSAPI 已尝试过初始化，不再重复尝试');
      return false;
    }
    jsapiConfigTriedRef.current = true;

    const inFeishu = isFeishuEnvironment();
    if (!inFeishu) {
      logInfo('非飞书环境，跳过 JSAPI 初始化');
      return false;
    }

    // 等待 JSAPI 注入
    const injected = await waitForJsapi(5000);
    if (!injected) {
      logWarn('JSAPI 注入超时，跳过 JSAPI 初始化');
      return false;
    }

    const client = getJsapiClient();
    if (!client) {
      logError('无法获取 JSAPI 客户端');
      return false;
    }

    try {
      logInfo('获取 JSAPI 配置（签名）');
      const currentUrl = window.location.href.split('#')[0];
      const result = await getJsapiConfig(currentUrl);

      if (!result.success || !result.data) {
        logError('获取 JSAPI 配置失败', result.error);
        return false;
      }

      const jsapiConfig = result.data;
      logInfo('JSAPI 配置获取成功', { appId: jsapiConfig.appId });
      feishuAppIdRef.current = jsapiConfig.appId;

      // 尝试多种 config 调用方式
      const configFormats = [
        // 格式1：驼峰命名
        {
          appId: jsapiConfig.appId,
          timestamp: jsapiConfig.timestamp,
          nonceStr: jsapiConfig.nonceStr,
          signature: jsapiConfig.signature,
          jsApiList: ['requestAuthCode'],
        },
        // 格式2：下划线命名
        {
          app_id: jsapiConfig.appId,
          timestamp: jsapiConfig.timestamp,
          nonce_str: jsapiConfig.nonceStr,
          signature: jsapiConfig.signature,
          jsApiList: ['requestAuthCode'],
        },
      ];

      let configSuccess = false;

      // 尝试不同的 config 方法和参数格式
      for (let i = 0; i < configFormats.length; i++) {
        const configParams = configFormats[i];
        const formatNames = ['驼峰', '下划线'];
        logInfo(`尝试 JSAPI config 格式 ${i + 1}/${configFormats.length}: ${formatNames[i]}`);

        try {
          await callJsapiMethod(client, 'config', configParams);
          configSuccess = true;
          logInfo(`JSAPI config 成功，使用格式: ${formatNames[i]}`);
          break;
        } catch (configErr) {
          logWarn(`JSAPI config 格式 ${formatNames[i]} 失败`, configErr);
        }
      }

      // 如果 config 方法都失败了，试试直接跳过 config（某些环境下可能不需要 config）
      if (!configSuccess) {
        logWarn('所有 config 格式都失败了，尝试不 config 直接使用');
        // 检查是否有 requestAuthCode 方法，如果有就直接用
        if (typeof client.requestAuthCode === 'function' || 
            typeof client.oauth?.getAuthCode === 'function') {
          logInfo('检测到 requestAuthCode 方法存在，跳过 config 直接使用');
          configSuccess = true;
        }
      }

      if (!configSuccess) {
        logError('JSAPI 初始化失败，所有方式都尝试过了');
        return false;
      }

      jsapiReadyRef.current = true;
      logInfo('JSAPI 初始化完成');
      return true;
    } catch (error) {
      logError('JSAPI 初始化异常', error);
      return false;
    }
  }, []);

  /**
   * 飞书 JSAPI 免登（推荐方案）
   * 通过 tt.requestAuthCode 获取授权码，完全在飞书 WebView 内完成，用户无感知
   */
  const doAuthInFeishuJSAPI = useCallback(async (): Promise<boolean> => {
    logInfo('========== 开始飞书 JSAPI 免登 ==========');
    setAuthState((prev) => ({ ...prev, authorizing: true }));

    // 1. 初始化 JSAPI
    const jsapiReady = await initJsapi();
    if (!jsapiReady) {
      logWarn('JSAPI 未就绪，JSAPI 免登失败');
      setAuthState((prev) => ({ ...prev, authorizing: false }));
      return false;
    }

    // 2. 调用 requestAuthCode 获取授权码
    const client = getJsapiClient();
    if (!client) {
      logError('JSAPI 客户端不存在');
      setAuthState((prev) => ({ ...prev, authorizing: false }));
      return false;
    }

    try {
      logInfo('尝试获取授权码，尝试多种调用方式');
      let code: string | null = null;
      const appId = feishuAppIdRef.current;

      // 尝试多种调用方式
      const methodPaths = [
        'requestAuthCode',           // tt.requestAuthCode
        'oauth.getAuthCode',         // tt.oauth.getAuthCode
        'getAuthCode',               // tt.getAuthCode
      ];

      // 不同的参数组合
      const paramVariants: Record<string, unknown>[] = [
        { appId },
      ];

      outer:
      for (let i = 0; i < methodPaths.length; i++) {
        const methodPath = methodPaths[i];
        for (let j = 0; j < paramVariants.length; j++) {
          const params = paramVariants[j];
          logInfo(`尝试方式 ${i + 1}/${methodPaths.length}-${j + 1}: ${methodPath}`);
          try {
            const result = await callJsapiMethod(client, methodPath, params);
            logInfo(`${methodPath} 调用成功，返回结果:`, result);
            
            // 从返回结果中提取 code
            const resultCode = result?.code || result?.data?.code;
            if (resultCode) {
              code = resultCode;
              logInfo(`从 ${methodPath} 获取到授权码`);
              break outer;
            }
          } catch (methodErr) {
            const errMsg = methodErr instanceof Error ? methodErr.message : String(methodErr);
            // 如果是 URL 白名单错误，记录但继续尝试其他方式
            if (errMsg.includes('10236') || errMsg.includes('invalid url')) {
              logWarn(`${methodPath} 失败：URL 不在可信域名白名单`, methodErr);
            } else {
              logWarn(`${methodPath} 调用失败`, methodErr);
            }
          }
        }
      }

      if (!code) {
        logError('所有方式都无法获取授权码');
        setAuthState((prev) => ({ ...prev, authorizing: false }));
        showToast('获取授权码失败，请点击按钮重试', 'error');
        return false;
      }

      logInfo('获取授权码成功，开始后端授权');

      // 3. 用授权码调用后端完成授权
      const success = await doAuthCallback(code);
      
      if (success) {
        logInfo('========== JSAPI 免登成功 ==========');
      } else {
        logError('========== JSAPI 免登失败：后端授权失败 ==========');
      }
      
      return success;
    } catch (error) {
      logError('JSAPI 免登异常', error);
      setAuthState((prev) => ({ ...prev, authorizing: false }));
      return false;
    }
  }, [initJsapi, doAuthCallback, showToast]);

  // 用 ref 保存最新的 doAuthInFeishuJSAPI，避免 effect 依赖导致的 clearTimeout 问题
  useEffect(() => {
    doAuthInFeishuJSAPIRef.current = doAuthInFeishuJSAPI;
  }, [doAuthInFeishuJSAPI]);

  /**
   * 飞书环境授权：当前页面跳转授权页面，飞书自动免登
   * 注意：飞书 WebView 内跳转 accounts.feishu.cn 可能会用系统浏览器打开
   * 这是飞书 WebView 的安全策略，JSAPI 免登是更好的选择
   */
  const doAuthInFeishu = useCallback(async () => {
    logInfo('========== 开始飞书页面跳转授权 ==========');
    setAuthState((prev) => ({ ...prev, authorizing: true }));

    const authUrl = await fetchAuthUrl();
    if (!authUrl) {
      setAuthState((prev) => ({ ...prev, authorizing: false }));
      return false;
    }

    logInfo('当前页面跳转到飞书授权页面', { authUrl });
    // 在当前页面跳转，飞书客户端内应该自动免登
    // 注意：如果跳转到了系统浏览器，说明飞书 WebView 不允许在 WebView 内打开授权页面
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

  // 用 ref 保存最新的 doAuthInFeishu
  useEffect(() => {
    doAuthInFeishuRef.current = doAuthInFeishu;
  }, [doAuthInFeishu]);

  /**
   * 执行授权
   * - 飞书环境：优先 JSAPI 免登（无跳转），失败则降级为当前页面跳转
   * - 浏览器环境：新窗口打开授权页面
   */
  const doAuth = useCallback(async (): Promise<boolean> => {
    const inFeishu = isFeishuEnvironment();
    logInfo('开始执行授权', { inFeishu });

    if (inFeishu) {
      // 飞书环境：优先使用 JSAPI 免登
      const jsapiSuccess = await doAuthInFeishuJSAPI();
      if (jsapiSuccess) {
        return true;
      }
      // JSAPI 免登失败，降级为页面跳转授权
      logInfo('JSAPI 免登失败，降级为页面跳转授权');
      return await doAuthInFeishu();
    } else {
      return await doAuthInBrowser();
    }
  }, [doAuthInFeishuJSAPI, doAuthInFeishu, doAuthInBrowser]);

  // 初始加载：获取授权状态
  useEffect(() => {
    logInfo('Hook 初始化，开始加载授权状态');
    void loadAuthStatus();
  }, [loadAuthStatus]);

  // 飞书环境 + 未授权 + 自动免登开启：自动尝试 JSAPI 免登，失败则降级为页面跳转
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
    logInfo('检测到飞书环境且未授权，自动尝试 JSAPI 免登');

    // 延迟 300ms，让页面先渲染，同时等待 JSAPI 注入
    const timer = setTimeout(() => {
      logInfo('setTimeout 回调开始执行，准备调用 doAuthInFeishuJSAPI');
      const jsapiFn = doAuthInFeishuJSAPIRef.current;
      if (!jsapiFn) {
        logError('doAuthInFeishuJSAPIRef.current 为 null，无法执行');
        return;
      }
      jsapiFn()
        .then((success) => {
          if (success) {
            logInfo('JSAPI 免登成功');
          } else {
            logInfo('JSAPI 免登失败，自动降级为页面跳转授权');
            const redirectFn = doAuthInFeishuRef.current;
            if (redirectFn) {
              void redirectFn();
            } else {
              logError('doAuthInFeishuRef.current 为 null，无法降级跳转');
            }
          }
        })
        .catch((error) => {
          logError('doAuthInFeishuJSAPI 未捕获的异常，尝试降级跳转', error);
          const redirectFn = doAuthInFeishuRef.current;
          if (redirectFn) {
            void redirectFn();
          }
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [autoSilentAuth, authState.loading, authState.isAuthorized, authState.authorizing]);

  // 检查 URL 中的 auth_error 参数（页面跳转授权失败时回传）
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

  // 检查 URL 中的 auth_success 参数（页面跳转授权成功时回传）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get('auth_success');
    if (authSuccess === '1') {
      logInfo('检测到 URL 中的授权成功参数，重新加载授权状态');
      // 清除 URL 参数
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_success');
      url.searchParams.delete('user_name');
      window.history.replaceState({}, '', url.toString());
      // 重新加载授权状态
      void loadAuthStatus();
    }
  }, [loadAuthStatus]);

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

  // 定时刷新日志（因为日志是全局存储的，React 状态不会自动更新）
  const refreshDebugLogs = useCallback(() => {
    setDebugLogs([...globalLogs]);
  }, []);

  // 每秒刷新一次日志
  useEffect(() => {
    refreshDebugLogs(); // 初始刷新
    const timer = setInterval(refreshDebugLogs, 1000);
    return () => clearInterval(timer);
  }, [refreshDebugLogs]);

  return {
    authState,
    loadAuthStatus,
    doAuth,
    doAuthCallback,
    toastMsg,
    showToast,
    debugLogs,
    refreshDebugLogs,
  };
}
