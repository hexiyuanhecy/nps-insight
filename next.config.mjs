/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // 忽略 @vercel/kv（本地开发未安装，运行时动态降级到内存缓存）
    config.resolve.fallback = { ...config.resolve.fallback, '@vercel/kv': false };
    return config;
  },
};

export default nextConfig;
