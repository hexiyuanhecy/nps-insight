# 多维表格结构 1:1 复刻重构 - The Implementation Plan (Decomposed and Prioritized Task List)

## [ ] Task 1: 重构建表核心逻辑 - 串行创建 6 张空白表
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 基于 `nps_bitable_full_meta.json` 元数据重写建表逻辑
  - 严格按源表顺序串行创建 6 张空白表（仅表名，不含字段）
  - 建立 tableIdMap（旧表ID → 新表ID）映射
  - 每次请求后强制等待 300ms
  - 移除 Promise.all 并行创建方式
- **Acceptance Criteria Addressed**: AC-1, AC-7, AC-10
- **Test Requirements**:
  - `programmatic` TR-1.1: 调用 createBitable API，返回成功后检查表数量为 6
  - `programmatic` TR-1.2: 表名和顺序与源表一致：租户信息、top 问题表、反馈列表、Tag3表、Tag1表、Tag2表
  - `programmatic` TR-1.3: tableIdMap 包含全部 6 个旧表ID映射
- **Notes**: 源表顺序在元数据中为：tbljPeTYJXOu55Vs(租户信息) → tblRuKwkCmsdxei0(top 问题表) → tblbvwlRfKEshGm9(反馈列表) → tblJtwhN6m71qLnn(Tag3表) → tbl59iVHgHPyeLmj(Tag1表) → tblnNtMHDn92HPdu(Tag2表)

## [ ] Task 2: 实现主键字段修改逻辑
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 每张表创建后，获取默认主键字段 ID
  - 调用修改字段接口（PUT）将默认主键改为源表主键配置
  - 写入 fieldIdMap 映射
- **Acceptance Criteria Addressed**: AC-2, AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1: 每张表第一个字段名称、类型与源表主键完全一致
  - `programmatic` TR-2.2: 每张表只有 1 个主键字段
  - `programmatic` TR-2.3: fieldIdMap 包含主键字段映射

## [ ] Task 3: 实现基础字段串行创建（含完整选项 id）
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 按源字段顺序逐个创建基础字段（type 1/2/3/4/5/7）
  - 单选/多选字段完整保留 option 的 id、name、color
  - property 为 null 时省略 property 字段
  - Lookup 字段（type 19）先创建同名字段（type 1 文本）占位
  - 公式字段（type 20）暂不创建，加入公式待处理列表
  - 字段创建后写入 fieldIdMap
  - 每次创建后等待 300ms
- **Acceptance Criteria Addressed**: AC-2, AC-3, AC-4, AC-6
- **Test Requirements**:
  - `programmatic` TR-3.1: 每张表字段总数与源表一致（含 Lookup 占位）
  - `programmatic` TR-3.2: 基础字段类型与源表完全匹配
  - `programmatic` TR-3.3: 单选/多选选项的 id、name、color 与源表完全一致
  - `programmatic` TR-3.4: Lookup 位置有对应同名字段占位（文本类型）

## [ ] Task 4: 实现公式字段创建 + 精确 ID 替换
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 在所有基础字段创建完成后，串行创建公式字段
  - 精确替换公式中的表ID和字段ID（用正则，禁止全局 replace）
  - 支持 `$table[tid]`、`{fid}`、`$column[fid]`、`$field[fid]` 四种格式
  - 选项ID不替换（创建单选时已保留原ID）
  - 创建成功后写入 fieldIdMap
- **Acceptance Criteria Addressed**: AC-5, AC-7
- **Test Requirements**:
  - `programmatic` TR-4.1: 公式字段创建成功，接口无报错
  - `programmatic` TR-4.2: 公式内无残留旧表ID、旧字段ID
  - `programmatic` TR-4.3: fieldIdMap 包含公式字段映射

## [ ] Task 5: 实现失败回滚机制
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 任意核心步骤失败时，自动调用删除多维表格接口
  - 输出完整错误日志：失败步骤、请求参数、返回错误信息
  - 4xx 参数错误不重试，立即终止并回滚
  - 5xx/网络错误最多重试 3 次
- **Acceptance Criteria Addressed**: AC-8
- **Test Requirements**:
  - `programmatic` TR-5.1: 模拟建表失败，确认表格被自动删除
  - `programmatic` TR-5.2: 错误日志包含失败步骤和原因

## [ ] Task 6: 绑定表格结构验证
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 绑定已有表格时，调用获取表列表接口
  - 验证表数量是否为 6
  - 验证表名是否匹配
  - 不匹配时给出明确警告
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `programmatic` TR-6.1: 正确结构的表格绑定返回成功
  - `programmatic` TR-6.2: 结构不匹配时返回警告信息

## [ ] Task 7: 生成 Lookup 手动补配清单
- **Priority**: low
- **Depends On**: Task 3
- **Description**:
  - 收集所有 type=19 的 Lookup 字段信息
  - 生成标准化的手动操作清单
  - 包含：所在表、字段名、原列位置、目标表、目标字段、聚合方式、筛选条件
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgement` TR-7.1: 清单包含所有 Lookup 字段，信息完整可操作

## [ ] Task 8: 端到端测试与验证
- **Priority**: high
- **Depends On**: Task 4, Task 5, Task 6
- **Description**:
  - 实际调用新建表格 API
  - 用 Playwright 打开新表格截图验证
  - 逐表核对字段结构
  - 修复所有不一致之处
- **Acceptance Criteria Addressed**: AC-1 到 AC-10
- **Test Requirements**:
  - `programmatic` TR-8.1: 新建表格成功，返回 app_token
  - `human-judgement` TR-8.2: 浏览器截图对比，结构与源表一致
  - `programmatic` TR-8.3: 通过 API 验证字段数量、类型、选项
