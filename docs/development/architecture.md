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
    platform/files.ts       # saveFile / fileTransfer(pick/read/close) / 拖入；字节与文件名处理
    core/document/          # ProjectDocument schema、校验、id、hash、版本、迁移
    core/dataset/           # 查询规格、run 编排、queryHash、截断、错误分类
    core/metric/            # 指标/维度词典、字段契约、口径校验
    core/report/            # viewSpec → 渲染模型、字段映射、筛选
    core/dashboard/         # ≤20 报表（建议≤12）、刷新队列、逐卡状态、部分失败、懒加载编排
    ai/draft/               # prompt、候选 JSON schema、校验、diff
    ui/workbench/           # 工作台外壳、文档切换、保存/打开
    ui/designer/            # 数据集/报表编辑器（表单 + 预览）
    ui/render/              # 图表适配器（ECharts 或 SVG）、表格、数值卡
    ui/dashboard/           # 看板布局：gridstack 适配层（12 列网格）、尺寸预设、键盘与表单等价入口
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
  → 确认 dataset.version（queryHash + fieldsHash + 输出字段契约）
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

`draft → confirmed → stale`。报表保存 `basis:{queryHash,fieldsHash,confirmedAt}`（不存版本 id/历史；比对只看两个哈希，`confirmedAt` 只记录口径确认时间）；`basis` 哈希与数据集当前 `version` 不一致 → 报表 stale，不允许“看起来正常”地继续发布；重新确认后写回新 `basis`。

### Dashboard card

`idle → queued → running → ok | ok_truncated | error | stale | abandoned`；每卡记录 `lastQueriedAt/lastSuccessAt/durationMs/queuePosition`；部分失败不污染其他卡；刷新有 generation，旧响应丢弃。`abandoned` 表示“已停止等待”（数据库可能仍在执行），不得显示“已取消”。

## 5. 不变量（代码必须强制）

1. 没有 `host.data:read` + grant，不发起查询；拒绝后不重试轰炸。
2. 查询结果只与 `(connectionId, queryHash, generation)` 绑定；错代响应不得写入状态。
3. `truncated=true` 时：可预览、可标注样本，不可计算“总计/占比”并宣称完整，不可导出全量。
4. 保存前必须通过 schema 校验；未知 `formatVersion` major 只读/拒绝，不静默迁移。
5. 文档中不出现凭据、密码、token、完整连接配置；只写连接别名与脱敏元数据。
6. 报表/看板只引用存在的 `dataset`/`report` 实体；`basis` 与 `dataset.version` 哈希不一致时标 `stale`，不静默更新；删除被引用对象必须显式确认。
7. AI 候选未通过 schema/字段校验不得进入预览；未人工确认不得保存。
8. 看板刷新无跨查询事务；UI 必须逐卡显示时间，不能给单一“数据截至”时间。
9. 看板 `layout` 只存 12 列网格坐标：加载校验边界、不重叠、与 `reportRefs` 一一对应；不存像素坐标与渲染结果。
10. 读者过滤/排序只作用于**已取回的行**，不改变 SQL、不改变已取回行数；UI 必须常驻“已取回 N 行（行上限 N）”语境。
11. 前端不对 rows 做合计/占比/平均/“其他”桶；需要合计只能是 SQL 输出的标记行（`totals.sql_marker`）。
12. 不实现结果缓存/定时刷新；“刷新”= 重新执行 SQL，取数时间逐卡显示，不给单一“数据截至”。

## 6. 并发与队列

- 文档内查询队列上限 2；宿主每 bridge 4 并发是硬上限，插件不得占满。
- 运行中的新请求：同一 dataset 取消旧意图（generation+1），不依赖宿主 cancel；旧响应丢弃。
- 看板刷新：默认顺序队列（≤2 并发）；单卡失败不终止队列，记录错误继续；可见卡优先。
- 队列去重：同一 `queryHash` 的多个卡只执行一次并复用 rows，不重复排队。
- 刷新按钮在队列非空时显示进度 `第 k/N 张`，不重复入队；`停止等待` 把未完成卡置 `abandoned`，只丢弃响应，不声称数据库已停。
- 单卡 watchdog：`timeoutMs + 5s` 未完成 → 本地置 `error`（`QUERY_TIMEOUT`，`retryable=true`），文案“已停止等待（数据库可能仍在执行，执行上限 60 秒）”；不自动重试。
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
| `SCHEMA_MISMATCH` | 加载时文档内字段/引用不一致（viewSpec 引用不存在字段等） | 校验失败，拒绝打开/保存并指出路径 |
| `SCHEMA_DRIFT` | 运行时结果列/类型与已确认 `fields` 契约不一致 | 标 stale，列出差异；提供“更新字段契约/回滚 SQL”；不自动更新 |
| `FILE_CANCELED` | 用户取消打开/保存 | 保持原状态，不提示成功 |
| `FILE_WRITE_FAILED` | 保存 IO/磁盘/权限失败（非取消） | 保持 dirty，提示重试或换目录；绝不提示已保存 |
| `FILE_TOO_LARGE` | 打开文件 >5 MiB | 拒绝并说明上限 |
| `FILE_UNSUPPORTED` | 非 JSON/格式非法 | 显示解析错误位置 |
| `FILE_HANDLE_EXHAUSTED` | 文件句柄未释放（上限 64） | 提示重开 tab，并记录为缺陷 |
| `DRAFT_SAVE_FAILED` | 草稿超配额/写入失败 | 提示无法自动救援；不阻止手动保存 |
| `BINDING_REQUIRED` | 连接未绑定 | 引导选择本机连接 |
| `BINDING_AMBIGUOUS` | 多个同名/同型候选连接 | 让用户显式选择，不自动挑 |
| `BINDING_MISMATCH` | 连接 dbType/database/schema 不符 | 禁止执行，显示差异，不提供“仍然使用” |
| `ABANDONED` | 用户停止等待 | “已停止等待，数据库可能仍在执行” |
| `FORMAT_VERSION_UNSUPPORTED` | 文档 major 过高 | 只读提示/拒绝，不迁移 |
| `STORAGE_QUOTA` | 偏好/草稿超限 | 清理提示；不写业务资产 |
| `AI_UNAVAILABLE` / `AI_REFUSED` | 无模型/拒绝/超时 | 保留手工路径，可重试但限次 |

## 8. 图表渲染

- 统一 `ChartSpec`（表格/柱/折线/数值卡），由 `core/report` 产出，`ui/render` 负责映射。
- 首选 ECharts（包内、无 CDN、无 eval）；M0 实测 CSP/包体积/许可证。若不可用，退化到轻量 SVG（柱/折线/数值卡），不引入需要 worker 的方案。
- 禁止：图表配置里的函数、HTML、远程 URL、任意脚本；只接受白名单字段与枚举。
- 主题：监听 `dbxTheme`，使用宿主 CSS token；图表颜色/字体从主题读取。
- 高基数：`viewSpec.limit` 只做展示截断（`显示前 n 类（共 M 类；truncated 时不给 M）`）；不做“其他”桶；>30 类时警告并建议 SQL 聚合。
- 多序列：`y` ≤4；颜色按固定调色板顺序，不随筛选变化；图例 >8 项折叠。
- 大结果：单卡渲染上限 5000 行/点；超过由结果截断或建议聚合，不做前端抽样冒充全量；表格 >200 行窗口化（TS-10 条件）。
- 导出 PNG/SVG 不进 M1；如后续做，先验证 sandbox 下 canvas/foreignObject/字体。

## 8.1 看板布局（M2）

- `core/dashboard` 负责布局模型与校验（12 列网格约束、碰撞/紧凑、增删迁移、≤20 卡上限）；`ui/dashboard` 是 **gridstack 14 官方 Vue wrapper**（`gridstack/dist/vue`）的适配层，只做交互与渲染，不自己发明坐标。
- 适配层职责：把 `layout[]` 映射成 `GridStackWidget[]`（`reportId` 走 `useWidgetSerializer` 持久化）；响应 `change`/`dragstop`/`resizestop` 防抖写回模型；主题 token 映射到卡片容器；卸载时 `grid.destroy()`。
- 编辑模式才启用拖拽/缩放（`enable()`）；阅读模式 `setStatic(true)`，不绑定拖拽事件。
- 输入等价性：拖拽/缩放、尺寸预设（1/3、1/2、2/3、整行 × 高 3/4/6/8）、表单输入、键盘（`Alt+方向` / `Alt+Shift+方向`）四条路径写回同一个 `layout` 模型；gridstack 只管指针路径，其余三条由 UI 层补齐。
- 拖拽/缩放期间暂停图表 resize（`dragstart`/`resizestart` 禁用 `vue-echarts` autoresize），`dragstop`/`resizestop` 后统一 resize 一次；避免每帧 `chart.resize()` 打爆 §11 性能预算。
- 20 卡性能：首屏只挂可见卡的图表（IntersectionObserver），离屏卡保留 DOM 不建实例；`columnOpts` 断点（窄容器塌缩为 1 列）只影响呈现，不改资产坐标。
- 布局只影响呈现，不触发取数：改 `x/y/w/h` 不得引起 `queryData`；打开看板是否自动取数由文档配置 `dashboard.onOpenRefresh` 决定，默认 `false`。

## 9. 文件与文档 I/O

- 保存：JSON 序列化（稳定 key 顺序）→ UTF-8 字节 → `host.saveFile`；默认文件名 `{slug}.dbxreport.json`；不写入连接 id/凭据。`saveFile` **不返回路径**，因此不记录“当前文件路径”、不提供“覆盖保存”；每次保存都是另存为；取消返回 `null`，保持 dirty。
- 打开：`capabilities.fileTransfer.pick` → 逐块 `read(handleId, offset, chunk)`（1 MiB/块，最多 5 MiB）→ `finally closeFileHandle`；先看 `meta.size`，超限直接拒绝；桌面走原生对话框，web 走 input fallback；文件拖入（`onDrop`）作为增强入口，不是唯一入口。
- 解析：严格 `JSON.parse` + schema 校验；≤5 MiB、深度 ≤64；错误定位到字段/路径；未知 major 只读。
- 不自动保存；草稿见 [data-model.md](data-model.md) §7（`host.storage`，≤200 KiB，节流 3s，恢复需确认）；不把 storage 当资产库。

## 10. AI 草稿管线

1. 输入：连接摘要（脱敏）、作者目标、已确认字段词典；默认不发送任何结果行。
2. 调 `host.ai` completion（限额内），要求返回严格 JSON（schema 见 data-model）。
3. 本地校验：schema、id 唯一、引用存在、SQL 单语句/只读预检（非权威）、无 JS/URL。
4. UI 并排展示候选与当前文档；用户可拒绝、编辑、预览；预览才执行查询。
5. 用户显式确认 + 保存才落盘；记录 `aiAssisted` 标记与模型/prompt 版本（不含内容）。
6. 失败/超时/拒绝 → 手工路径不受影响；不自动重试超过 1 次。
7. 候选只写 `candidate` 对象，不改文档；应用前展示 SQL 行级 diff、字段表 diff、图表配置 diff。
8. 本地预检：`JSON.parse` 失败即拒绝；SQL 必须单条、以 `SELECT`/`WITH` 开头、≤100000 字符；未知键拒绝。
9. 保存 `provenance:{aiAssisted,appliedAt,candidateHash}`；不发送结果行/连接凭据/结果样本。

## 11. 性能与资源预算（目标，非承诺）

| 指标 | 目标 |
|---|---|
| workbench 首屏 | <1 s（本地资源） |
| 500 行表格渲染 | <200 ms；不阻塞主线程 >50 ms 连续 |
| 500 点柱/折线 | <300 ms |
| 20 卡看板首屏 | <1 s（仅渲染可见卡，图表懒挂载） |
| 20 卡拖拽/缩放 | 60 fps（拖拽期间暂停图表 resize，稳定后统一重绘） |
| 文档打开+校验（≤1 MiB） | <200 ms |
| 内存（5000 行×20 列） | <100 MB 峰值 |
| 包体积 | <5 MB（图表库另记）；超出需评审 |

## 12. 安全边界

- 唯一宿主入口：`platform/host`；所有权限/同意检查集中在此，避免散落。
- 不拼接 HTML；Vue 默认转义；禁止 `v-html` 渲染用户/AI 内容。
- 不发起任何网络请求（不申请 `host.network`）；无 CDN、无遥测。
- 文件内容不可信；限制大小/深度/字段数；拒绝 `__proto__` 等原型污染键。
- 不引入插件内本地数据库：无插件专属持久化目录，`host.storage` 只存偏好/草稿；资产读写仍走 JSON 文件（理由见 `analysis/reference-pitfalls.md` P9）。
- 不做导出：首版无 CSV/PNG/SVG/PDF 导出入口（ADR-10）；若后续重启，必须重新评审编码、公式注入、样本标注与确认框，并保持日志不打印 SQL 字面量/结果值。
- 密码/token 永不进入文档、日志、AI prompt。

## 13. 待定设计问题

语言/框架/依赖层面的选型已收敛，见 [tech-stack.md](tech-stack.md)（2026-10-22 定稿）。仍待定的设计问题：

- 图表库：ECharts 6 按需注册为暂定方案，M0 实测 CSP/体积后定稿；不通过则退化到手写 SVG（tech-stack TS-09）。
- 20 卡全刷时间预算（每卡 0.3–1.5 s、队列 ≤2）与“只刷可见”默认策略：M2 实测后定，不在 M1 承诺。
- gridstack 官方 Vue wrapper 与 Vue 3.5/Vite 8 的兼容性、主题 token 映射、包增量：M0 H7–H9 实测。
- 文档 revision/多 tab 冲突检测能做到什么程度（宿主未提供锁）。
- 指标词典的字段漂移迁移交互。
- AI 候选 diff 的展示粒度。
- 打开看板默认不自动取数（Q4 建议），M2 有性能数据后复议。
- 时间过滤的类型/粒度匹配（M2 前定）。
- 路由/状态库：已决定不引入（tech-stack TS-06/TS-13）；M2 前若出现跨视图深链需求再复议。
