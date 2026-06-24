# 配置保存功能修复方案

## 问题总结

验证脚本发现了 **6 个高危问题**:

1. **敏感字段明文存储**: FEISHU_APP_SECRET、DATA_SOURCE_API_KEY、AGNESAI_API_KEY 以明文形式存储在 .env 文件中
2. **未使用 KV 存储**: route.ts 没有使用 kv-storage.ts 提供的存储功能
3. **配置写入方式不兼容云平台**: 使用 fs.writeFileSync 直接写入 .env 文件,在 Vercel 等云平台可能不可用

## 修复方案

### 方案一: 使用 KV 存储 + 加密 (推荐)

**适用场景**: 生产环境、Vercel 部署

**优点**:
- 配置持久化存储在 KV 中,重启不丢失
- 敏感字段加密存储,安全性高
- 支持多租户配置隔离

**缺点**:
- 需要 Vercel KV 服务 (有免费额度)
- 需要配置 ENCRYPTION_KEY 环境变量

**实现步骤**:

#### 1. 修改 route.ts 的 saveConfigV3 函数

```typescript
import { setConfig, getConfig } from '@/lib/storage/kv-storage';
import { encryptSensitiveFields, decryptSensitiveFields } from '@/lib/utils/encryption';

// 敏感字段列表
const SENSITIVE_KEYS = [
  'FEISHU_APP_SECRET',
  'DATA_SOURCE_API_KEY',
  'AGNESAI_API_KEY',
];

async function saveConfigV3(config: any) {
  const ownerUserId = config.ownerUserId || 'default_owner';

  // 1. 加密敏感字段
  const encryptedConfig = await encryptSensitiveFields(config, [
    'feishu.appSecret',
    'dataSource.apiKey',
    'ai.apiKey',
  ]);

  // 2. 保存到 KV 存储
  await setConfig(ownerUserId, encryptedConfig);

  // 3. 更新环境变量 (可选,用于兼容旧代码)
  // 注意: 在 Vercel 中,环境变量只能通过 Dashboard 或 CLI 设置
  // 这里仅用于本地开发环境
  if (process.env.NODE_ENV === 'development') {
    // 写入 .env.local (本地开发)
    const envPath = path.join(process.cwd(), '.env.local');
    // ... 写入逻辑
  }

  return NextResponse.json({
    success: true,
    message: '配置已保存到 KV 存储',
  });
}
```

#### 2. 修改 buildV3Config 函数

```typescript
async function buildV3Config(): Promise<any> {
  // 1. 尝试从 KV 读取配置
  const ownerUserId = process.env.DEFAULT_OWNER_ID || 'default_owner';
  const kvConfig = await getConfig(ownerUserId);

  if (kvConfig) {
    // 2. 解密敏感字段
    const decryptedConfig = await decryptSensitiveFields(kvConfig, [
      'feishu.appSecret',
      'dataSource.apiKey',
      'ai.apiKey',
    ]);

    return decryptedConfig;
  }

  // 3. KV 中没有配置,从环境变量读取 (首次启动)
  return buildConfigFromEnv();
}
```

#### 3. 配置 ENCRYPTION_KEY 环境变量

```bash
# 生成加密密钥 (32字节)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 添加到 .env 或 Vercel Dashboard
ENCRYPTION_KEY=<生成的密钥>
```

### 方案二: 仅加密敏感字段 (最小改动)

**适用场景**: 快速修复,暂时不使用 KV

**优点**:
- 改动最小,风险低
- 敏感字段加密存储

**缺点**:
- 仍然依赖 .env 文件
- 在 Vercel 中无法写入 .env

**实现步骤**:

#### 1. 在 route.ts 中添加加密逻辑

```typescript
import { encrypt, decrypt, isEncrypted } from '@/lib/utils/encryption';

async function saveConfigV3(config: any) {
  const envVars: Record<string, string> = {};

  // 敏感字段加密
  if (config.feishu?.appSecret && config.feishu.appSecret !== '__SET__') {
    envVars.FEISHU_APP_SECRET = await encrypt(config.feishu.appSecret);
  }

  if (config.dataSource?.apiKey && config.dataSource.apiKey !== '__SET__') {
    envVars.DATA_SOURCE_API_KEY = await encrypt(config.dataSource.apiKey);
  }

  if (config.ai?.apiKey && config.ai.apiKey !== '__SET__') {
    envVars.AGNESAI_API_KEY = await encrypt(config.ai.apiKey);
  }

  // ... 其他字段正常保存
}
```

#### 2. 在读取配置时解密

```typescript
async function buildV3Config(): Promise<any> {
  const appSecret = process.env.FEISHU_APP_SECRET || '';
  const decryptedAppSecret = isEncrypted(appSecret)
    ? await decrypt(appSecret)
    : appSecret;

  return {
    feishu: {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: decryptedAppSecret,
    },
    // ... 其他配置
  };
}
```

### 方案三: 使用 Vercel Environment Variables API (云平台方案)

**适用场景**: Vercel 生产环境

**优点**:
- 官方推荐方式
- 安全可靠

**缺点**:
- 需要 Vercel API Token
- 配置更新需要重新部署

**实现步骤**:

1. 使用 Vercel REST API 更新环境变量
2. 触发重新部署

**注意**: 这种方式每次配置变更都需要重新部署,不适合频繁变更的场景。

## 推荐方案

**推荐使用方案一 (KV 存储 + 加密)**:

1. **安全性**: 敏感字段加密存储
2. **持久化**: 配置存储在 KV 中,重启不丢失
3. **兼容性**: 支持本地开发和云平台部署
4. **多租户**: 支持不同用户的配置隔离

## 实施优先级

### P0 (立即修复)

1. 添加加密工具 (已完成: src/lib/utils/encryption.ts)
2. 修改 route.ts,加密敏感字段后再保存
3. 配置 ENCRYPTION_KEY 环境变量

### P1 (尽快修复)

1. 集成 KV 存储
2. 修改配置读取逻辑,优先从 KV 读取
3. 添加配置迁移脚本 (从 .env 迁移到 KV)

### P2 (后续优化)

1. 添加配置版本管理
2. 添加配置变更审计日志
3. 支持配置回滚

## 验证方法

修复后重新运行验证脚本:

```bash
node scripts/verify-config-save.js
```

预期结果:
- ✅ 所有敏感字段已加密存储
- ✅ KV 存储正常使用
- ✅ 配置读取和写入逻辑一致

## 注意事项

1. **加密密钥管理**: ENCRYPTION_KEY 必须妥善保管,丢失后无法解密已加密的配置
2. **向后兼容**: 解密函数会自动识别加密字符串,对未加密的字符串直接返回
3. **多租户隔离**: 使用 ownerUserId 作为 KV 存储的键,支持不同用户的配置
4. **降级处理**: KV 不可用时自动降级到内存缓存,避免服务中断
