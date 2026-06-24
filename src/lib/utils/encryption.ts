/**
 * 加密工具
 * 用于加密敏感配置字段
 */

import crypto from 'crypto';

// 加密算法
const ALGORITHM = 'aes-256-gcm';

// 加密密钥来源优先级:
// 1. ENCRYPTION_KEY 环境变量 (推荐生产环境使用)
// 2. 自动生成的密钥存储在 KV 中 (开发环境)
let encryptionKey: string | null = null;

/**
 * 获取加密密钥
 */
export async function getEncryptionKey(): Promise<string> {
  if (encryptionKey) {
    return encryptionKey;
  }

  // 从环境变量获取
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    encryptionKey = envKey;
    return encryptionKey;
  }

  // 生成临时密钥 (仅用于开发环境)
  console.warn('[加密] 未配置 ENCRYPTION_KEY,使用临时密钥 (不推荐生产环境)');
  encryptionKey = crypto.randomBytes(32).toString('hex');
  return encryptionKey;
}

/**
 * 加密字符串
 * @param plaintext 明文
 * @returns 加密后的字符串 (格式: encrypted:iv:authTag:ciphertext)
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();

  // 生成随机 IV
  const iv = crypto.randomBytes(16);

  // 创建加密器
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(key, 'hex').slice(0, 32),
    iv
  );

  // 加密
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  // 获取认证标签
  const authTag = cipher.getAuthTag();

  // 返回格式: encrypted:iv:authTag:ciphertext
  return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * 解密字符串
 * @param encryptedString 加密字符串 (格式: encrypted:iv:authTag:ciphertext)
 * @returns 解密后的明文
 */
export async function decrypt(encryptedString: string): Promise<string> {
  // 检查格式
  if (!encryptedString.startsWith('encrypted:')) {
    // 不是加密字符串,直接返回
    return encryptedString;
  }

  const key = await getEncryptionKey();

  // 解析加密字符串
  const parts = encryptedString.split(':');
  if (parts.length !== 4) {
    throw new Error('加密字符串格式错误');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = parts[3];

  // 创建解密器
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(key, 'hex').slice(0, 32),
    iv
  );

  // 设置认证标签
  decipher.setAuthTag(authTag);

  // 解密
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * 检查字符串是否已加密
 */
export function isEncrypted(value: string): boolean {
  return Boolean(value && value.startsWith('encrypted:'));
}

/**
 * 批量加密对象中的敏感字段
 */
export async function encryptSensitiveFields(
  obj: Record<string, unknown>,
  sensitiveKeys: string[]
): Promise<Record<string, unknown>> {
  const result = { ...obj };

  for (const key of sensitiveKeys) {
    if (result[key] && typeof result[key] === 'string') {
      const value = result[key] as string;
      // 如果不是加密字符串且不是占位符,则加密
      if (!isEncrypted(value) && value !== '__SET__') {
        result[key] = await encrypt(value);
      }
    }
  }

  return result;
}

/**
 * 批量解密对象中的敏感字段
 */
export async function decryptSensitiveFields(
  obj: Record<string, unknown>,
  sensitiveKeys: string[]
): Promise<Record<string, unknown>> {
  const result = { ...obj };

  for (const key of sensitiveKeys) {
    if (result[key] && typeof result[key] === 'string') {
      const value = result[key] as string;
      if (isEncrypted(value)) {
        try {
          result[key] = await decrypt(value);
        } catch (error) {
          console.error(`[加密] 解密 ${key} 失败:`, error);
          // 解密失败时保留原值
        }
      }
    }
  }

  return result;
}
