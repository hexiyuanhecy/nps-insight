---
name: auto-test
description: "功能开发完成后自动运行全量测试，包括编译检查、代码规范、单元测试和 E2E 测试"
tags: ["testing", "verification", "quality"]
---

# 自动测试流程

## 触发条件
当用户说"跑测试"、"自测"、"验证一下"、"运行测试"时触发。

## 执行步骤
1. 编译检查：运行 `pnpm tsc --noEmit`，报告类型错误
2. 代码规范：运行 `pnpm lint --max-warnings=0`，报告规范问题
3. 单元测试：运行 `pnpm test`，报告通过/失败数量
4. E2E 测试（如存在）：运行 `pnpm test:e2e`
5. 输出结果摘要：
   - ✅ 全部通过 → 报告"所有测试通过"
   - ❌ 有失败 → 列出失败项的文件名、测试名、错误信息

## 输出格式
```
✅ TypeScript 编译通过
✅ ESLint 检查通过（0 warnings）
✅ 单元测试：42 passed, 0 failed
❌ E2E 测试：login.spec.ts - "用户登录流程" 失败
   错误：Timeout waiting for selector '#dashboard'
```
