---
# 规则元数据 (YAML Front Matter)
name: nextjs-conventions
description: "强制执行 Next.js 项目的代码结构与风格约定"
globs:
  - "src/**/*.{ts,tsx}"
  - "!src/node_modules/**"
priority: 1000
alwaysApply: true

---

# Next.js 项目规范

## 一、文件结构与职责分离

### 1.1 组件行数限制
**`component-max-lines`**
- description: "组件文件不得超过 300 行"
- severity: error
- maxLines: 300

### 1.2 常量定义位置
**`constant-location`**
- description: "常量必须在 `src/constants/` 目录下"
- severity: error
- allowedPaths:
  - "src/constants/**/*"

### 1.3 API 封装位置
**`api-location`**
- description: "API 调用必须在 `src/apis/` 目录下"
- severity: error
- allowedPaths:
  - "src/apis/**/*"

## 二、Next.js 特性规范

### 2.1 环境变量前缀
**`next-public-env`**
- description: "环境变量必须使用 `NEXT_PUBLIC_` 前缀"
- severity: warning

### 2.2 App Router 规范
- **`app-router-layout`**
  description: "布局文件必须命名为 `layout.tsx`"
  severity: error
  allowedNames:
    - "layout.tsx"
- **`app-router-loading`**
  description: "路由必须有 `loading.tsx` 加载状态"
  severity: warning
  requiredFiles:
    - "loading.tsx"
- **`app-router-error`**
  description: "路由必须有 `error.tsx` 错误边界"
  severity: warning
  requiredFiles:
    - "error.tsx"

## 三、代码质量

### 3.1 禁用 `any` 类型
**`no-any-type`**
- description: "禁止使用 `any` 类型"
- severity: error

### 3.2 组件类型
**`prefer-function-components`**
- description: "优先使用函数组件 + Hooks"
- severity: warning

### 3.3 Props 类型定义
**`props-typed`**
- description: "组件 Props 必须显式类型定义"
- severity: warning
