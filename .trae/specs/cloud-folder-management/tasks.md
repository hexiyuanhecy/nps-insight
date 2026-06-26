# 用户资源隔离与云文件夹自动初始化 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 定义用户资源类型与存储接口
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 定义 `UserResource` 类型，包含 4 个核心 Token 字段：rootFolderToken, reportFolderToken, monthFolderToken, bitableBaseToken
  - 定义 `UserResourceStore` 存储接口（get / save / exists）
  - 实现本地开发环境的存储（读取 .env.local 环境变量）
  - 环境变量映射：ROOT_FOLDER_TOKEN, REPORT_FOLDER_TOKEN, MONTH_FOLDER_TOKEN, BITABLE_BASE_APP_TOKEN
- **Acceptance Criteria Addressed**: AC-3, AC-8
- **Test Requirements**:
  - `programmatic` TR-1.1: UserResource 类型定义完整，4 个 Token 字段齐全
  - `programmatic` TR-1.2: 本地环境能正确读取 4 个环境变量
  - `programmatic` TR-1.3: exists() 方法能正确判断资源是否已初始化
- **Notes**: 暂时只实现本地环境存储，生产环境数据库存储后续扩展

## [ ] Task 2: 飞书云文件夹服务模块（创建 + 权限）
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 `src/lib/feishu/` 下创建 `drive-folder.ts` 模块
  - 实现 `createFolder(name: string, parentFolderToken?: string)` 方法，调用 drive/v1/files/create_folder
  - 实现 `addFolderAdmin(folderToken: string, userOpenId: string)` 方法，授予 admin 权限
  - 实现 `getFolderUrl(folderToken: string)` 方法，拼接文件夹链接
  - 所有操作添加详细 console.log 日志
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-2.1: createFolder 能在根目录创建文件夹，返回 token
  - `programmatic` TR-2.2: createFolder 支持指定 parentFolderToken 创建子文件夹
  - `programmatic` TR-2.3: addFolderAdmin 能成功为用户授予管理员权限
  - `human-judgement` TR-2.4: 代码结构清晰，错误处理完善，日志输出详细
- **Notes**: 权限接口的 perm 参数值需要确认（admin / full_access）

## [ ] Task 3: 多维表格创建支持指定 folder_token
- **Priority**: high
- **Depends On**: Task 2
- **Description**: 
  - 研究飞书多维表格创建 API 如何指定创建位置（folder_token）
  - 修改现有多维表格创建逻辑，支持传入 folderToken 参数
  - 确保创建的多维表格在指定文件夹下
  - 子表名称固定为 feedback, tenants, top_issues
- **Acceptance Criteria Addressed**: AC-4, AC-12
- **Test Requirements**:
  - `programmatic` TR-3.1: 传入 folderToken 时，多维表格创建在目标文件夹内
  - `programmatic` TR-3.2: 多维表格包含 feedback, tenants, top_issues 三个子表
  - `programmatic` TR-3.3: 不传入 folderToken 时兼容旧行为
- **Notes**: 如果创建 API 不支持 folder_token，则需要创建后用 drive move 移动

## [ ] Task 4: 用户资源初始化编排服务（5步流程）
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**: 
  - 创建 `UserResourceInitializer` 服务，编排完整的 5 步初始化流程
  - 步骤1：创建根文件夹（命名：NPS业务资源_用户名）
  - 步骤2：创建周报归档、月报汇总两个子文件夹
  - 步骤3：在根文件夹下创建多维表格
  - 步骤4：授予用户根文件夹管理员权限
  - 步骤5：保存 4 个 Token 到存储
  - 实现幂等性：已初始化直接返回，不重复创建
  - 实现断点续做：某步失败后，下次从已完成的步骤继续
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-4, AC-5
- **Test Requirements**:
  - `programmatic` TR-4.1: 首次调用完成全部 5 步，返回完整 UserResource
  - `programmatic` TR-4.2: 第二次调用直接返回已有资源，不创建新资源
  - `programmatic` TR-4.3: 根文件夹下包含 2 个子文件夹 + 1 个多维表格
  - `programmatic` TR-4.4: 用户在根文件夹权限列表中，权限为 admin
- **Notes**: 用户名暂时用默认值或从配置读取，后续对接登录后从用户信息获取

## [ ] Task 5: 文档适配器支持 folder_token
- **Priority**: high
- **Depends On**: Task 4
- **Description**: 
  - 修改 `FeishuDocumentAdapter.create()` 方法，增加 `folderToken` 参数
  - 创建文档时传入 folder_token，确保在指定文件夹下创建
  - 保持向后兼容，不传 folderToken 时行为不变
- **Acceptance Criteria Addressed**: AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-5.1: 传入 folderToken 时，文档创建在目标文件夹内
  - `programmatic` TR-5.2: 不传 folderToken 时行为与之前一致
  - `human-judgement` TR-5.3: 接口设计清晰，向后兼容

## [ ] Task 6: 周报生成接入用户资源体系
- **Priority**: medium
- **Depends On**: Task 5
- **Description**: 
  - 周报生成时，从当前用户资源中读取 bitableBaseToken 作为数据源
  - 周报文档创建时，传入 reportFolderToken 归档到周报文件夹
  - 保持现有周报内容生成逻辑不变
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `programmatic` TR-6.1: 周报数据读取使用用户自己的 bitableBaseToken
  - `programmatic` TR-6.2: 生成的周报文档在 reportFolderToken 对应文件夹内
  - `programmatic` TR-6.3: 周报到货推送等其他功能不受影响

## [ ] Task 7: 月报生成接入用户资源体系
- **Priority**: medium
- **Depends On**: Task 5
- **Description**: 
  - 月报生成时，从当前用户资源中读取 bitableBaseToken 作为数据源
  - 月报/会议文档创建时，传入 monthFolderToken 归档到月报文件夹
  - 保持现有月报内容生成逻辑不变
- **Acceptance Criteria Addressed**: AC-7
- **Test Requirements**:
  - `programmatic` TR-7.1: 月报数据读取使用用户自己的 bitableBaseToken
  - `programmatic` TR-7.2: 生成的月报文档在 monthFolderToken 对应文件夹内
  - `programmatic` TR-7.3: 月报其他功能不受影响

## [ ] Task 8: Mock 数据规则对齐（平台绑定 + 租户一致）
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 整理平台固定枚举：打卡小程序、休假小程序、休假员工端、假勤管理后台、考勤机
  - 为每个平台建立专属反馈文案池，确保平台与文案强绑定
  - 实现租户一致性：同一租户 ID 的名称和规模全局一致（用 Map 缓存）
  - 租户规模枚举：A1 - A6
  - 不满意原因多选字段对齐
- **Acceptance Criteria Addressed**: AC-10, AC-11
- **Test Requirements**:
  - `programmatic` TR-8.1: 生成 N 条数据，每条反馈的文案与平台匹配
  - `programmatic` TR-8.2: 同一租户 ID 在所有记录中名称和规模完全一致
  - `programmatic` TR-8.3: 评分 1-5 保留 1 位小数
  - `human-judgement` TR-8.4: 文案池内容合理，符合各平台场景

## [ ] Task 9: 配置中心 UI 适配（展示用户资源状态）
- **Priority**: medium
- **Depends On**: Task 4
- **Description**: 
  - 在配置中心增加资源状态展示区
  - 展示根文件夹链接、周报文件夹链接、月报文件夹链接、多维表格链接
  - 展示初始化状态（未初始化 / 已初始化）
  - 本地开发环境标注"本地环境"标识
- **Acceptance Criteria Addressed**: AC-3, AC-8
- **Test Requirements**:
  - `human-judgement` TR-9.1: 页面正确展示 4 个资源链接和状态
  - `human-judgement` TR-9.2: 链接可点击跳转到对应飞书资源
  - `human-judgement` TR-9.3: UI 风格与配置中心整体一致

## [ ] Task 10: 端到端验证测试
- **Priority**: high
- **Depends On**: Task 6, Task 7, Task 8, Task 9
- **Description**: 
  - 场景1：本地环境配置 .env.local，验证系统直接使用环境变量 Token
  - 场景2：清空配置后触发初始化，验证完整 5 步流程全部成功
  - 场景3：检查云盘目录结构（根文件夹 + 2 子文件夹 + 1 多维表格）
  - 场景4：验证管理员权限设置正确
  - 场景5：生成 100 条 Mock 数据，验证平台绑定和租户一致性
  - 场景6：执行周打标，验证周报归档到周报文件夹
  - 场景7：执行月分析，验证月报归档到月报文件夹
  - 场景8：验证幂等性，重复触发初始化不产生重复资源
- **Acceptance Criteria Addressed**: AC-1 ~ AC-12
- **Test Requirements**:
  - `programmatic` TR-10.1: 完整初始化流程成功，4 个 Token 全部存储
  - `programmatic` TR-10.2: 云盘目录结构符合标准（1 根 + 2 子 + 1 多维表格）
  - `programmatic` TR-10.3: 用户在文件夹权限列表中，权限为 admin
  - `programmatic` TR-10.4: Mock 数据平台绑定正确，租户一致
  - `programmatic` TR-10.5: 周报在周报文件夹，月报在月报文件夹
  - `programmatic` TR-10.6: 重复初始化不产生新资源（幂等）
  - `programmatic` TR-10.7: TypeScript 编译通过，无类型错误
- **Notes**: 测试完成后将云文件夹链接和多维表格链接发给用户
