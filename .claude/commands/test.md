---
name: test
description: "运行全量测试：TS编译 + ESLint + 单元测试 + E2E"
---

# 自动测试

## 执行步骤

1. **编译检查**: 运行 `pnpm tsc --noEmit`，报告类型错误
2. **代码规范**: 运行 `pnpm lint --max-warnings=0`，报告规范问题
3. **单元测试**: 运行 `pnpm test`，报告通过/失败数量
4. **E2E 测试** (如存在): 运行 `pnpm test:e2e`

## 输出格式

```
✅ TypeScript 编译通过
✅ ESLint 检查通过（0 warnings）
✅ 单元测试：XX passed, 0 failed
❌ E2E 测试：xxx.spec.ts - "测试名" 失败
   错误：Timeout waiting for selector '#xxx'
```

## 测试通过标准

- 所有 API 端点返回正确状态码
- 多维表格数据正确写入
- Bot 消息发送成功
- UI 页面正常渲染

## 注意事项

- 如有失败，必须列出失败项的文件名、测试名、错误信息
- 完成后输出变更摘要
