# M0：walking skeleton 任务书

> 目标：用最小插件证明“UI-only 沙箱内，查询→图表→保存→重开”闭环可行。  
> 时间盒：**1–3 天**。不追求产品化，不写完整文档格式，不做看板/AI/多数据库。  
> 前置：DBX ≥0.6.51（基线 `b160d130`）、一个已打开的 SQLite 或 PostgreSQL 连接、Node.js 22、`@dbx-app/plugin-cli`。

## 1. 非目标

- 不做完整报表编辑器、不做指标词典、不做看板、不做 AI。
- 不引入 sidecar、不新增宿主 API、不申请 `host.network`、不读写任意文件系统。
- 不优化视觉；用宿主 `dbx-*` 样式即可。

## 2. 最小能力集

| 能力 | 用什么 | 权限 |
|---|---|---|
| 打开 tab | manifest `workbench` contribution | `host.workbench` |
| 列连接 | `listConnections` / `getConnections` | `host.connections:read` |
| 执行 SQL | `queryData`（固定 SQL，无参数） | `host.data:read` + 用户授权 |
| 渲染 | 表格 + 一种图（柱状或折线），图表库打包进 UI | 无 |
| 保存 | `saveFile` 写 JSON 定义 | 无独立权限 |
| 重开 | 拖入 JSON（`onDrop`）或 `host.openFilesystem`（按实际 API） | 视 API；能不用 filesystem 就不用 |
| 偏好 | 可选 `host.storage` | `host.storage` |

## 3. 步骤与验收

### Step 0：脚手架与真机安装

```bash
npm install --global @dbx-app/plugin-cli
dbx-plugin create dbx-report --template frontend
dbx-plugin package --path ./dbx-report
```

在 DBX 插件中心从本地 `.dbxp` 安装，打开 workbench。  
**验收**：tab 能打开，iframe 无 CSP 报错，`window.dbxPlugin` 可用。

### Step 1：连接选择 + `queryData`

- UI：连接下拉（`listConnections`，显示 name/dbType/connected/readOnly）；SQL 文本框；Run 按钮。
- 必须先确认连接 `connected=true`；未连接时提示用户先在 DBX 中打开。
- `queryData({ connectionId, sql, maxRows: 500 })`；显示 `columns`/`rows`/`truncated`/`elapsedMs`。
- 首次运行会弹授权；拒绝时显示可恢复错误，不崩溃。

**验收**：固定 SQL 返回预期行；`truncated` 能展示；拒绝授权有明确状态；点 Run 期间 UI 不阻塞 >1 秒。

### Step 2：图表渲染（最高风险）

- 先试 **ECharts**（打包进 UI，不走 CDN）渲染柱状图；检查 CSP 是否允许、是否需要 eval/worker、包体积。
- 若 ECharts 被 CSP/体积/许可证卡住，退化到轻量 SVG 柱状图（手写 50 行以内），记录结论。
- 图表数据只来自当前返回结果；不抓明细、不前端聚合全量。

**验收**：图表在真机 iframe 内正常显示；无 `unsafe-eval` 依赖；包体积可接受（记录数值）。

### Step 3：保存 JSON

- 定义最小对象：`formatVersion`、`documentId`、`savedAt`、`connectionAlias`、`dataset { sql, maxRows }`、`report { chartType, xField, yField }`；**不含凭据/连接 id 之外的业务数据**。
- `saveFile` 写 UTF-8 字节；默认文件名 `report.json`。
- 用户取消保存 → 不显示“已保存”；保存失败 → 显示错误。

**验收**：桌面弹出保存对话框；取消路径正确；生成文件可被独立打开并解析。

### Step 4：重开并重新取数

- 通过拖入 JSON 或文件选择读取定义；校验 `formatVersion`；未知 major 拒绝并提示。
- 重新映射当前连接（保存的是别名，不是本机 id）；重新授权；重新执行；渲染。
- 不保存结果数据，不假设保存时的连接仍存在。

**验收**：换一个 DBX 实例/重启后仍能重开并取数；字段漂移/连接缺失有明确错误。

### Step 5：记录与 go/no-go

在 `docs/development/records/<date>-m0.md` 记录：

- 环境：DBX 版本、OS、数据库版本、插件版本；
- 命令与截图（脱敏）；
- CSP 报错、权限报错、`queryData` 响应样例（去数据）；
- 图表库结论、包体积、保存/重开耗时；
- 失败分支与绕行方案；
- **go/no-go**：是否进入 M1；若 no-go，写清阻断点与需要的宿主变化。

## 4. Go/No-Go 标准

全部满足才进入 M1：

- [ ] 真机安装/打开/授权/查询/渲染/保存/重开全链路跑通；
- [ ] 无未解决的 CSP/权限/沙箱阻塞；
- [ ] 图表库可在无 `unsafe-eval`、无外部网络下工作，包体积可接受；
- [ ] 保存取消、连接缺失、截断、SQL 被拒绝都有明确状态；
- [ ] 全流程不产生业务数据落盘（除用户主动保存的定义文件）；
- [ ] 2 名评审者能在 5 分钟内复现。

## 5. 失败分支

| 现象 | 处理 |
|---|---|
| 图表库依赖 eval/worker 被 CSP 阻止 | 换轻量 SVG；仍不行则升级为“需宿主/渲染方案裁决”，不降低安全门槛 |
| `queryData` 在真机不可用（capabilities 缺 dataApi） | 记录宿主版本/配置；确认是否版本过低或桌面/web 差异；必要时升级 DBX |
| 保存对话框体验/文件重开不可接受 | 记录并触发 D2 复议；不要偷偷改用 storage 当资产库 |
| 查询/渲染阻塞 UI | 记录耗时；拆分渲染或用 requestIdleCallback；仍不行则暂停 M1 设计 |
| dev-host 无法覆盖数据路径 | 决定是否加 queryData mock；否则接受真机迭代成本 |

## 6. 产出

- 可安装的最小 `.dbxp`（不入库或放 `fixtures/`，按仓库规则）；
- M0 记录（含 go/no-go）；
- 对 [roadmap.md](roadmap.md) 的时间/风险修正；
- 图表库选型结论（ECharts / SVG / 其他），写入 [architecture.md](architecture.md)。
