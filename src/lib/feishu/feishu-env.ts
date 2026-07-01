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
 * 通过 User-Agent 判断是否在飞书客户端内
 * 这是最可靠的初筛方式，不受 JSAPI 注入时机影响
 * 
 * 飞书客户端 UA 特征（已验证）：
 * - 移动端飞书：包含 "Lark" 或 "Feishu"
 * - PC 端飞书：包含 "Lark" 或 "Feishu"
 * - 企业微信：包含 "wxwork" 或 "MicroMessenger"
 * - 部分版本可能包含 "Bytedance" 或 "bytedance"
 */
export function isFeishuClientByUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  // 检测多种飞书相关标识
  return ua.includes('feishu') || 
         ua.includes('lark') || 
         ua.includes('larksuite') ||
         ua.includes('bytedance') ||
         ua.includes('byte-dance') ||
         ua.includes('wxwork') ||
         ua.includes('micromessenger');
}

/**
 * 获取当前 User-Agent 字符串（用于调试）
 */
export function getUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent;
}

/**
 * 判断是否在飞书 Webview 环境中
 * 飞书 Webview 环境优先走免登静默授权
 * 
 * 检测优先级：
 * 1. JSAPI 是否已注入（window.lark/tt/ft）
 * 2. User-Agent 是否包含飞书标识（最可靠的初筛）
 * 3. URL 参数是否包含飞书特有参数
 */
export function isInFeishuWebview(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. 优先检查 JSAPI 是否已注入（最可靠的标志）
  if ((window as any).lark || (window as any).tt || (window as any).ft) {
    return true;
  }

  // 2. 检查 User-Agent（最可靠的初筛，不受 JSAPI 注入时机影响）
  if (isFeishuClientByUA()) {
    return true;
  }

  // 3. 检查是否是飞书小程序环境
  if ((window as any).my) {
    return true;
  }

  // 4. 检查 URL 参数（从飞书跳转来时会带一些参数）
  const searchParams = new URLSearchParams(window.location.search);
  const hasLarkParams = searchParams.has('from_lark') ||
                         searchParams.has('app_id') ||
                         searchParams.has('block_id');

  return hasLarkParams;
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
