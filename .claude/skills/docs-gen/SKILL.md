---
name: docs-gen
description: "根据代码自动生成或更新 README 和 API 文档"
tags: ["documentation", "readme", "api-docs"]
---

# 文档生成

## 触发条件
当用户说"生成文档"、"更新 README"、"更新 API 文档"、"写文档"时触发。

## 执行步骤
1. 扫描 src/ 目录结构，理解项目架构
2. 读取 API 路由定义（如 src/app/api/）
3. 读取 package.json 获取项目元信息
4. 生成/更新 README.md：
   - 项目简介
   - 技术栈
   - 快速开始
   - 目录结构
   - API 文档链接
5. 生成/更新 docs/api-reference.md：
   - 每个 API 端点的路径、方法、参数、响应格式
6. 确保文档中的命令可直接复制执行
