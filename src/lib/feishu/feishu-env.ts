/**
 * 飞书环境检测工具
 * 用于判断当前运行环境，决定走哪种授权方式
 */

/**
 * 判断是否在飞书小程序/企业微信环境中
 */
export function isInFeishuMiniApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    // 飞书小程序
    !!(window as any).my ||
    // 企业微信
    !!(window as any).wx?.miniProgram ||
    // 飞书 webview
    !!(window as any).LarkWebVersion
  );
}

/**
 * 判断是否在飞书 Webview 环境中
 * 飞书 Webview 环境优先走免登静默授权
 */
export function isInFeishuWebview(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();

  // 飞书客户端 Webview
  const isLarkClient = ua.includes('feishu') || ua.includes('larksuite');
  // 飞书小程序 webview
  const isLarkMiniProgram = !!(window as any).my;

  // 检查是否在飞书 App 环境中
  const isInLarkApp = isLarkClient || isLarkMiniProgram;

  // 如果在飞书环境中，还要检查是否通过飞书客户端打开
  // 飞书 Webview 会设置特定的 referrer 或通过 URL 参数传递信息
  const searchParams = new URLSearchParams(window.location.search);
  const hasLarkParams = searchParams.has('from_lark') ||
                         searchParams.has('app_id') ||
                         searchParams.has('block_id');

  return isInLarkApp || hasLarkParams;
}

/**
 * 判断是否在外部浏览器中（需要扫码授权）
 */
export function isInExternalBrowser(): boolean {
  return !isInFeishuWebview();
}

/**
 * 获取当前环境类型
 */
export type FeishuEnvironment = 'webview' | 'external' | 'server';

export function getFeishuEnvironment(): FeishuEnvironment {
  if (typeof window === 'undefined') return 'server';
  return isInFeishuWebview() ? 'webview' : 'external';
}
