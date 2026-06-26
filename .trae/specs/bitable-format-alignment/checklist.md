# 多维表格格式对齐 - Verification Checklist

## 一、字段定义一致性检查

### 反馈表（feedback）
- [ ] 字段数量为 18 个
- [ ] 字段名完全匹配：反馈ID、租户ID、租户名称、租户规模、用户ID、创建时间、不满意原因、反馈原文、翻译后文本、tag1、tag2、tag3、评分、反馈平台、AI 置信度、需查日志、待审核、打标状态
- [ ] 租户名称字段类型为 AutoNumber（查找引用，不写入）
- [ ] 租户规模为 SingleSelect，选项为 A1/A2/A3/A4/A5/A6
- [ ] 不满意原因为 MultiSelect，6 个选项（系统卡顿、界面不美观、功能缺失、打开速度慢、其他、缺少功能）
- [ ] tag1 为 MultiSelect，8 个选项（疑似Bug、功能优化、界面改进、性能提升、用户教育、安全合规、无效反馈、细节优化）
- [ ] tag2 为 MultiSelect，28 个选项
- [ ] tag3 为 MultiSelect，2 个选项（不好用、太卡）
- [ ] 评分字段类型为 Number，formatter 0.0
- [ ] 反馈平台为 SingleSelect，3 个选项（管理后台、请假员工端、打卡小程序）
- [ ] AI 置信度字段类型为 Number，formatter 0.0
- [ ] 需查日志字段类型为 Textarea
- [ ] 待审核字段类型为 Textarea
- [ ] 打标状态为 SingleSelect，2 个选项（未打标、已打标）
- [ ] 创建时间字段类型为 DateTime，formatter yyyy/MM/dd
- [ ] 不存在多余字段：用户名称、summary、suggestions、priority、tagTime 等

### Tag1表
- [ ] 字段数量为 4 个
- [ ] 字段名：tagId（Text）、tagName（SingleSelect）、desc（Text）、count（AutoNumber）
- [ ] tagName 选项与反馈表 tag1 选项一致（8 个）
- [ ] count 为自动计算字段，系统不写入

### Tag2表
- [ ] 字段数量为 4 个
- [ ] 字段名：tagId（Text）、tagName（SingleSelect）、desc（Text）、count（AutoNumber）
- [ ] tagName 选项与反馈表 tag2 选项一致（28 个）
- [ ] count 为自动计算字段，系统不写入

### Tag3表
- [ ] 字段数量为 4 个
- [ ] 字段名：tagId（Text）、tagName（SingleSelect）、desc（Text）、count（AutoNumber）
- [ ] tagName 选项与反馈表 tag3 选项一致（2 个）
- [ ] count 为自动计算字段，系统不写入

### Top问题表（top_issues）
- [ ] 字段数量为 15 个
- [ ] 字段名：index、所属模块、tag2、tag3、总反馈数、A4反馈数、A5反馈数、A6反馈数、大租户反馈数、大租户占比、人工排序、负责人、解决方案、状态、迭代周期
- [ ] index 字段类型为 Text（序号，不主动维护）
- [ ] tag2 字段类型为 SingleSelect，28 个选项
- [ ] 人工排序字段类型为 Number，formatter 0.0
- [ ] 负责人字段类型为 Text
- [ ] 解决方案字段类型为 Text
- [ ] 状态为 SingleSelect，4 个选项（待讨论、已排期、已上线、验证中）
- [ ] 迭代周期为 SingleSelect，4 个选项（Sprint 1、Sprint 2、Sprint 3+、待定）
- [ ] 所属模块为 AutoNumber（自动计算，不写入）
- [ ] tag3 为 AutoNumber（自动计算，不写入）
- [ ] 总反馈数为 AutoNumber（自动计算，不写入）
- [ ] A4/A5/A6反馈数为 AutoNumber（自动计算，不写入）
- [ ] 大租户反馈数为 AutoNumber（自动计算，不写入）
- [ ] 大租户占比为公式字段（自动计算，不写入）

### 租户表（tenants）
- [ ] 字段数量为 6 个
- [ ] 字段名：租户ID、租户名称、规模、是否企业版、联系人、联系邮箱
- [ ] 规模为 SingleSelect，选项为 A1/A2/A3/A4/A5/A6
- [ ] 是否企业版字段类型为 Textarea
- [ ] 不存在多余字段：日志平台、日志端点、日志凭证、创建时间

## 二、写入操作验证

### 反馈写入
- [ ] 创建反馈记录时，所有写入字段在目标表中存在
- [ ] 不尝试写入自动计算字段（租户名称）
- [ ] 不尝试写入不存在的字段（用户名称、summary、suggestions、priority、tagTime）
- [ ] 单选/多选字段的值在选项列表中

### 标签写入
- [ ] 创建/更新标签记录时，只写入 tagId、tagName、desc
- [ ] 不尝试写入 count 字段（自动计算）
- [ ] 不尝试写入不存在的字段（使用次数、status、createdAt 等）
- [ ] tagName 字段的值在选项列表中

### Top问题写入
- [ ] 创建/更新 Top 问题时，只写入可编辑字段
- [ ] 不尝试写入自动计算字段（总反馈数、A4/A5/A6反馈数等）
- [ ] 单选字段的值在选项列表中
- [ ] index 字段可选写入，不强制维护

### 租户写入
- [ ] 创建/更新租户时，包含"是否企业版"字段
- [ ] 不尝试写入不存在的字段（日志平台、日志端点等）

## 三、读取操作验证

- [ ] 读取反馈记录时，正确解析所有 18 个字段名
- [ ] 读取标签记录时，正确解析 4 个字段（tagId、tagName、desc、count）
- [ ] 读取 Top 问题时，正确识别自动计算字段和可编辑字段
- [ ] 读取租户时，包含"是否企业版"字段，不包含已移除字段

## 四、自动建表验证

- [ ] 新建反馈表：18 个字段，名称/类型/选项完全匹配
- [ ] 新建 Tag1 表：4 个字段，名称/类型/选项完全匹配
- [ ] 新建 Tag2 表：4 个字段，名称/类型/选项完全匹配
- [ ] 新建 Tag3 表：4 个字段，名称/类型/选项完全匹配
- [ ] 新建 Top 问题表：15 个字段，名称/类型完全匹配
- [ ] 新建租户表：6 个字段，名称/类型/选项完全匹配

## 五、构建与类型验证

- [ ] `pnpm tsc --noEmit` 无类型错误
- [ ] `pnpm lint` 无 Lint 错误
- [ ] 所有引用了旧字段名的地方都已更新

## 六、集成测试验证

- [ ] 周同步任务：拉取反馈 + AI 打标 + 写入标签，全程无字段错误
- [ ] 月分析任务：Top 问题分析写入无字段错误
- [ ] Excel 导入：导入反馈数据无字段错误
- [ ] 配置中心保存/读取配置正常
- [ ] 标签自进化功能正常
