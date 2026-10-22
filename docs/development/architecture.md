# 技术架构（草案）

> 状态：设计草案（I），M0 验证后修订；不是已实现结构。  
> 约束来源：[host/capabilities.md](../host/capabilities.md)、[host/limits.md](../host/limits.md)、[product/decisions.md](../product/decisions.md)。

## 1. 原则

1. **UI-only**：无 sidecar、无后端、无自建连接池；数据库访问只经 `host.queryData`。
2. **宿主是边界**：能力探测、权限、同意、错误都封装在 `platform/host` 一层，业务代码不直接碰 `window.dbxPlugin`。
3. **SQL 是真相**：所有计算下推到数据库；前端不做明细聚合、不做跨查询 JOIN、不缓存业务结果作为资产。
4. **显式保存**：文档状态与磁盘状态分离；保存成功才置“已保存”；取消/失败不得伪装成功。
5. **截断/失败即降级**：`truncated=true` 或查询失败时，禁止“完整/最新”标记，禁止全量导出。
6. **可逆与可诊断**：所有外部输入（文件、AI JSON）先校验再使用；错误有稳定 code 与用户可读文案。

## 2. 模块划分

```
src/
  manifest.json
  ui/index.html
  src/
    platform/host.ts        # window.dbxPlugin 封装：init、capabilities、权限、API 调用、错误映射
    platform/files.ts       # saveFile / 拖入 / openFilesystem；字节与文件名处理
    core/document/          # ProjectDocument schema、校验、id、hash、版本、迁移
    core/dataset/           # 查询规格、run 编排、queryHash、截断、错误分类
    core/metric/            # 指标/维度词典、字段契约、口径校验
    core/report/            # viewSpec → 渲染模型、字段映射、筛选
    core/dashboard/         # ≤4 报表、刷新队列、逐卡状态、部分失败
    ai/draft/               # prompt、候选 JSON schema、校验、diff
    ui/workbench/           # 工作台外壳、文档切换、保存/打开
    ui/designer/            # 数据集/报表编辑器（表单 + 预览）
    ui/render/              # 图表适配器（ECharts 或 SVG）、表格、数值卡
    ui/components/          # 宿主 dbx-* 组件包装 + 自有小组件
    ui/state/               # 运行时 store（非资产）
```

**依赖方向**：`ui → core → platform`。`core/` 不 import DOM、不 import `window.dbxPlugin`、不做网络；`platform/` 是唯一宿主适配层。这样 core 可单测，未来换渲染/换宿主成本低。

## 3. 运行时数据流

```
打开文档（JSON）
  → core/document 校验（formatVersion/引用/字段映射）
  → 绑定本机连接（sourceAliases → connectionId，用户确认）
  → 运行数据集：dataset.query → host.queryData → 结果（columns/rows/truncated/elapsedMs）
  → 确认 datasetVersion（queryHash + 输出字段契约）
  → core/report 将结果映射成视图模型 → ui/render 渲染
  → 看板：按卡排队刷新，逐卡记录状态/时间
  → 保存：core/document 序列化 → platform.files.saveFile
```

**AI 草稿单独一条**：`ai/draft` 生成候选 → 校验 → UI 审阅 → 用户点“预览”才执行 `queryData` → 用户点“保存”才落盘；任一环节取消都不会查询/保存。

## 4. 状态机

### Document

`empty → loaded → dirty → saving → saved`，失败回 `dirty` 并保留错误。  
关键：`dirty` 由内容 hash 判定，不由“点过按钮”判定；关闭窗口不承诺自动保存；同一文档多 tab 时以保存时的 revision 冲突检测（若无法检测，明确提示可能覆盖）。

### DatasetVersion

`unverified → running → verified`；SQL/连接/字段变化 → `stale`；失败 → `error`（保留上一验证版本但标记 stale）。  
`verified` 必须记录：`queryHash`、输出列契约、`confirmedAt`、示例 `elapsedMs/truncated`（不存业务数据）。

### Report

`draft → confirmed → stale`。报表引用 `datasetVersionRef`；数据集版本变化 → 报表 stale，不允许“看起来正常”地继续发布。

### Dashboard card

`idle → queued → loading → success | error | truncated`；每卡独立时间戳；部分失败不污染其他卡；刷新有 generation，旧响应丢弃。

## 5. 不变量（代码必须强制）

1. 没有 `host.data:read` + grant，不发起查询；拒绝后不重试轰炸。
2. 查询结果只与 `(connectionId, queryHash, generation)` 绑定；错代响应不得写入状态。
3. `truncated=true` 时：可预览、可标注样本，不可计算“总计/占比”并宣称完整，不可导出全量。
4. 保存前必须通过 schema 校验；未知 `formatVersion` major 只读/拒绝，不静默迁移。
5. 文档中不出现凭据、密码、token、完整连接配置；只写连接别名与脱敏元数据。
6. 报表/看板只引用存在的 datasetVersion；删除被引用对象必须显式确认。
7. AI 候选未通过 schema/字段校验不得进入预览；未人工确认不得保存。
8. 看板刷新无跨查询事务；UI 必须逐卡显示时间，不能给单一“数据截至”时间。

## 6. 并发与队列

- 文档内查询队列上限 2；宿主每 bridge 4 并发是硬上限，插件不得占满。
- 运行中的新请求：同一 dataset 取消旧意图（generation+1），不依赖宿主 cancel；旧响应丢弃。
- 看板刷新：默认顺序队列（≤2 并发）；单卡失败不终止队列，记录错误继续。
- 刷新按钮在队列非空时显示“排队中”，不重复入队。
- 禁止隐式定时刷新；无后台刷新能力。

## 7. 错误模型

统一 `AppError { code, message, detail?, retryable }`；UI 文案分“用户可修复/需管理员/需升级宿主”。

| code | 触发 | UX |
|---|---|---|
| `HOST_API_UNSUPPORTED` | capabilities 缺 dataApi/ai | 禁用对应功能，提示升级 DBX |
| `PLUGIN_PERMISSION_DENIED` | manifest 缺权限或宿主拒绝 | 说明所需权限，不重试 |
| `DATA_ACCESS_NOT_GRANTED` | 用户拒绝/撤销 grant | 提供“重新授权”；保留 SQL |
| `CONNECTION_NOT_OPEN` | 连接未打开 | 引导先在 DBX 打开连接 |
| `CONNECTION_UNSUPPORTED` | 非 SQL 连接 | 禁用执行，说明仅 SQL 连接 |
| `SQL_REJECTED` | 只读分类/多语句/不支持语法 | 展示原因，不自动改写 SQL |
| `QUERY_TIMEOUT` | 执行超时 | 建议缩小范围/降低 maxRows；不声称“已取消数据库” |
| `QUERY_TRUNCATED` | 行/字节截断 | 显式样本徽标；禁止“完整”操作 |
| `RESULT_TOO_LARGE` | 8 MiB/上限 | 建议减少列/行，不导出全量 |
| `SCHEMA_MISMATCH` | 输出字段缺失/类型变化 | 标 stale，要求重新确认字段 |
| `FORMAT_VERSION_UNSUPPORTED` | 文档 major 过高 | 只读提示/拒绝，不迁移 |
| `SAVE_CANCELLED` | 用户取消保存 | 保持 dirty，不提示已保存 |
| `STORAGE_QUOTA` | 偏好/草稿超限 | 清理提示；不写业务资产 |
| `AI_UNAVAILABLE` / `AI_REFUSED` | 无模型/拒绝/超时 | 保留手工路径，可重试但限次 |

## 8. 图表渲染

- 统一 `ChartSpec`（表格/柱/折线/数值卡），由 `core/report` 产出，`ui/render` 负责映射。
- 首选 ECharts（包内、无 CDN、无 eval）；M0 实测 CSP/包体积/许可证。若不可用，退化到轻量 SVG（柱/折线/数值卡），不引入需要 worker 的方案。
- 禁止：图表配置里的函数、HTML、远程 URL、任意脚本；只接受白名单字段与枚举。
- 主题：监听 `dbxTheme`，使用宿主 CSS token；图表颜色/字体从主题读取。
- 大结果：渲染上限 ≤5000 点；超过由结果截断或建议聚合，不做前端抽样冒充全量。
- 导出 PNG/SVG 不进 M1；如后续做，先验证 sandbox 下 canvas/foreignObject/字体。

## 9. 文件与文档 I/O

- 保存：JSON 序列化（稳定 key 顺序）→ UTF-8 字节 → `host.saveFile`；文件名 `<slug>.dbxreport.json`；不写入连接 id/凭据。
- 打开：拖入或文件选择；限制文档大小（建议 5 MiB，防解析炸弹）；严格 JSON.parse + schema 校验；错误定位到字段。
- 不自动保存；不覆盖宿主已有文件（由用户对话框决定）；“另存为”是唯一保存语义。
- 不把 `host.storage` 当资产库；只存最近文件指针、UI 偏好、未完成草稿（带 TTL/清理）。

## 10. AI 草稿管线

1. 输入：连接摘要（脱敏）、作者目标、已确认字段词典；默认不发送任何结果行。
2. 调 `host.ai` completion（限额内），要求返回严格 JSON（schema 见 data-model）。
3. 本地校验：schema、id 唯一、引用存在、SQL 单语句/只读预检（非权威）、无 JS/URL。
4. UI 并排展示候选与当前文档；用户可拒绝、编辑、预览；预览才执行查询。
5. 用户显式确认 + 保存才落盘；记录 `aiAssisted` 标记与模型/prompt 版本（不含内容）。
6. 失败/超时/拒绝 → 手工路径不受影响；不自动重试超过 1 次。

## 11. 性能与资源预算（目标，非承诺）

| 指标 | 目标 |
|---|---|
| workbench 首屏 | <1 s（本地资源） |
| 500 行表格渲染 | <200 ms；不阻塞主线程 >50 ms 连续 |
| 500 点柱/折线 | <300 ms |
| 文档打开+校验（≤1 MiB） | <200 ms |
| 内存（5000 行×20 列） | <100 MB 峰值 |
| 包体积 | <5 MB（图表库另记）；超出需评审 |

## 12. 安全边界

- 唯一宿主入口：`platform/host`；所有权限/同意检查集中在此，避免散落。
- 不拼接 HTML；Vue 默认转义；禁止 `v-html` 渲染用户/AI 内容。
- 不发起任何网络请求（不申请 `host.network`）；无 CDN、无遥测。
- 文件内容不可信；限制大小/深度/字段数；拒绝 `__proto__` 等原型污染键。
- CSV 导出防公式注入（`= + - @` 前置转义）；日志不打印 SQL 字面量/结果值。
- 密码/token 永不进入文档、日志、AI prompt。

## 13. 待定设计问题

- 图表库最终选型（M0）。
- 文档 revision/多 tab 冲突检测能做到什么程度（宿主未提供锁）。
- 指标词典的字段漂移迁移交互。
- AI 候选 diff 的展示粒度。
- 是否需要在 M2 前引入路由/状态库（倾向不引入，保持简单）。
