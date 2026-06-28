/**
 * Next.js 配置文件
 * 适配腾讯云函数（SCF）Web Function 部署
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 输出 standalone 模式，减小部署包体积
  output: 'standalone',

  // 禁用压缩，由云函数网关处理
  compress: false,

  // 构建时生成 ETag
  generateEtags: true,

  // React 严格模式
  reactStrictMode: true,

  // 实验性功能
  experimental: {
    // 优化 server 外部依赖打包
    serverMinification: true,
    serverSourceMaps: false,
  },

  // 图片优化配置（使用默认配置）
  images: {
    remotePatterns: [],
  },

  // 确保 standalone 模式包含所有必要的依赖
  outputFileTracingIncludes: {
    '/': ['./node_modules/styled-jsx/**/*'],
  },
};

module.exports = nextConfig;
