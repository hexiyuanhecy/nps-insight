'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * 授权回调页面
 * 用于浏览器环境下新窗口授权完成后的结果展示
 * - 显示授权成功/失败状态
 * - 通过 postMessage 通知原窗口
 * - 自动关闭窗口
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('正在处理授权...');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // 从 URL 参数中获取授权结果
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const errorMsg = params.get('error');
    const userName = params.get('user_name');

    // 通知原窗口授权结果
    const sendMessageToParent = () => {
      if (window.opener) {
        try {
          window.opener.postMessage(
            {
              type: 'feishu-auth-callback',
              success: success === '1',
              error: errorMsg || undefined,
              userName: userName || undefined,
            },
            window.location.origin
          );
          console.log('[AuthCallback] 已向原窗口发送授权结果消息');
        } catch (e) {
          console.warn('[AuthCallback] 无法通知原窗口:', e);
        }
      }
    };

    if (success === '1') {
      setStatus('success');
      setMessage(userName ? `授权成功：${userName}` : '授权成功');
      sendMessageToParent();

      // 倒计时自动关闭
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            window.close();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setStatus('error');
      setMessage(errorMsg || '授权失败');
      sendMessageToParent();
    }
  }, []);

  const handleClose = () => {
    window.close();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {/* 图标 */}
          <div className="mb-4">
            {status === 'loading' && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            )}
            {status === 'success' && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            )}
            {status === 'error' && (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            )}
          </div>

          {/* 标题 */}
          <h1 className="text-xl font-semibold text-slate-900">
            {status === 'loading' && '正在处理授权'}
            {status === 'success' && '授权成功'}
            {status === 'error' && '授权失败'}
          </h1>

          {/* 消息 */}
          <p className="mt-2 text-sm text-slate-500">{message}</p>

          {/* 成功时的倒计时提示 */}
          {status === 'success' && (
            <p className="mt-4 text-xs text-slate-400">
              窗口将在 {countdown} 秒后自动关闭...
            </p>
          )}

          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="mt-6 rounded-lg border border-slate-200 px-6 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {status === 'success' ? '立即关闭' : '关闭窗口'}
          </button>
        </div>
      </div>
    </div>
  );
}
