# DBX 宿主能力（插件可用）

> **事实基线**：DBX `b160d130`（0.6.51），Host API `1.4.0`，manifest v1，sidecar protocol v1。  
> **约定**：F＝可从下方源码/契约测试核对；I＝对插件的含义。所有“可用”都以 `capabilities` / `host.features` 与权限实际探测为准，不能只凭版本号推断。

## 1. 两条执行通道

```
插件 UI（iframe, sandbox=allow-scripts, opaque origin）
   │  window.dbxPlugin / postMessage
   ▼
DBX frontend bridge（权限检查、consent、tab/文件/存储/AI 适配）
   │
   ▼
DBX core（连接池、SQL 执行、元数据、设置、AI provider）

插件 sidecar（可选，stdio JSON-RPC）
   │  host→sidecar: connection/*, filesystem/*, media/*, mcp/*, jdbcSession/*, invoke
   └─ sidecar→host: 仅 host/requestUserInput（反向 API 极窄）
```

- **UI 通道**：所有插件都有。能力受 manifest `permissions` 白名单与运行时 `capabilities` 双重约束。
- **sidecar 通道**：可选原生进程，不是 OS 沙箱；不能代查宿主连接、不能读写宿主存储。首版 BI 不使用。

## 2. 贡献点与载体

manifest v1 可声明（schema 中出现的类型）：`connection-provider`、`workbench`、`filesystem-provider`、连接右键菜单 `context-menu` / `open-workbench`、`result-view`、`command`、`menus`、`mcp`。

| 载体 | 能力 | 对 BI 的含义 |
|---|---|---|
| workbench | 插件自有 tab；可带 connection/context；默认按 plugin+contribution+connection 复用 tab | 首版主载体：作者工作台、文档编辑器 |
| result-view | 查询结果工具栏入口；打开插件 tab，附 SQL/连接/schema/列/最多 500 行快照；无自有 UI | “从当前查询创建报表”的入口 |
| dock | command 驱动的面板，可用 instance_key 复用 | 后续只读预览；不是 BI 卡片布局引擎 |
| 浮窗 | 桌面端；同插件+workbench contribution 复用窗口，可更新 context；不接受 result-view 替代 | 后续“一个浮窗切换看板”；web 退回 tab |
| context-menu / open-workbench | 连接右键动作，打开带连接的 workbench | 可选入口：从连接直接建报表 |
| command / menus | 插件命令与菜单声明 | 打开工作台、切换文档、导出 |
| filesystem-provider | 声明虚拟文件系统（如 S3/SFTP）供宿主文件浏览器使用 | 与本 BI 无关（不做驱动） |
| mcp | 暴露 sidecar 工具给 Agent/外部 MCP；每插件最多一个 | MVP 不声明；后续 AI 工具化再评估 |

**I：** workbench 只是窗口，不是资产；tab 标题不是报表 id；不要为每份报表动态增加 manifest 贡献。

## 3. Host API 清单（按权限/能力）

### 3.1 基础与 UI

| 方法/能力 | 权限 | 说明 |
|---|---|---|
| `ready`、`init`（context/theme/locale/pluginId/contributionId/permissions/capabilities） | 无 | 初始化必须等 `ready`；`contributionId` 在 `ready` 后可读 |
| `notify` / `onEvent` | `host.events` | 宿主事件广播 |
| `sendBinary` / `onBinary` | `host.binary` | 二进制消息（8 MiB 级） |
| `copy` | 无 | 写剪贴板 |
| `clipboardRead` | `host.clipboard:read` | 1.3 新增；有频率限制与审计，不应滥用 |
| `getTitle` / `setTitle` | 无/基础 | 设置 tab 标题（不是资产主键） |
| `openWorkbench` | `host.workbench` | 打开/复用 workbench；默认复用键含 plugin、contribution、connection |
| `host.network:https://host[:port]` | 该权限 | 运行时最多 8 个 origin；只影响 iframe CSP `connect-src`，不是宿主代理 |

### 3.2 连接与数据

| 方法/能力 | 权限 | 说明（关键限制） |
|---|---|---|
| `listConnections` / `getConnections` | `host.connections:read` | 返回脱敏摘要：id、name、dbType、dialect（实现里等于 `db_type`）、connected、readOnly、database、schema、providerId、connectionType、workbenchTitles。**列出不等于已授权查询。** |
| `queryData` | `host.data:read` + 每（插件, 连接）用户授权 | 单连接、单条被分类为只读的语句；默认 500 / 最高 5000 行；序列化行 8 MiB；SQL 100000 字符；执行 timeout 配置上限 60 秒；每 bridge 4 并发；连接必须已打开。无 bind、cursor、executionId、cancel。 |
| `getTableMetadata` | `host.schema:read` | 1.3 新增。只接受已指定的单表；要求连接已打开且已有 metadata pool（不会为插件隐式建池）；返回列名、类型、nullable、length/precision/scale/default 及字段能力（supported/unsupported/unknown），**无主外键、无表枚举、无业务含义**。 |
| `getPlanCapabilities` / `explainPlan` | `host.plans:read` | 1.2 新增；估计计划，不是实际运行计划；见 `plugins/README.md` |

`queryData` 请求/响应（F，`crates/dbx-core/src/query/plugin_data.rs`）：

```ts
// request
{ connectionId: string, database?: string, schema?: string, sql: string, maxRows?: number, timeoutMs?: number }
// result
{ dbType: string, columns: { name: string, dataType?: string }[], rows: unknown[][], truncated: boolean, elapsedMs: number }
```

授权流程（F，bridge + plugin_data）：
1. 首次查询弹宿主对话框，点名插件与连接；
2. 允许后写入 `app_settings.plugin_data_grants`，插件中心可撤销；
3. 拒绝在本 workbench 会话内记住；
4. 每次查询后端重新校验 manifest 权限 + grant；
5. 撤销后返回 `PLUGIN_DATA_ACCESS_NOT_GRANTED: …`，下次查询重新询问。

**I：** 5000 限制的是返回行，不是数据库参与聚合的源行；`truncated` 只表示行/字节/驱动截断，不提供总行数或原因；不要用 LIMIT 分批绕上限。

### 3.3 文件、存储、导出

| 方法/能力 | 权限 | 说明 |
|---|---|---|
| `saveFile` | 无独立 manifest 权限（API 可用即可） | 插件生成字节，桌面每次保存弹对话框；web 下载；取消返回 null；单次保存字节上限 512 MiB；不是报表导出引擎 |
| `downloadFile` | 无独立权限（视 API） | 带进度下载；与保存类似 |
| `fileTransfer`：`pick` / `read` / `beginSave` / `write` / `finish` / `closeFileHandle`，`onDrop` / `onDragState` | 无独立 manifest 权限；用 `capabilities.fileTransfer.{pick,beginSave,read,drop,folderExpansion}` 探测 | 打开/保存本地文件的唯一通道；句柄只在用户原生对话框选择或把文件拖入后产生；读取按 `offset/length` 分块（桥二进制上限 8 MiB/块，建议 1 MiB）；句柄上限 64；`beginSave` 取消返回 `null`；拖入展开上限 2000 文件/8 层并带 `truncated`；web 端 `pick` 退化为浏览器 input、`onDrop` 不触发 |
| `openFilesystem` / 资源读取 | `host.filesystem` | 仅声明 `filesystem-provider` 的插件需要；按 manifest 声明的 FS 根与 asset 路径；本 BI 不使用 |
| `storage.get/set/delete` | `host.storage` | 单值 256 KiB、总 1 MiB、1024 键；原子单次写，但**无 CAS、无多键事务**；web 端是 localStorage，不等价 |

### 3.4 AI

| 方法/能力 | 权限 | 说明 |
|---|---|---|
| `generateText` / 流式生成 | `host.ai` + `capabilities.aiCompletion` | 固定 system prompt，无工具；prompt ≤100000 字符；`maxTokens=2048`；输出 ≤16000 字符；同一 workbench 一次一个生成；每次发送需用户确认（可在本 workbench “不再询问”，仅内存） |
| 模型发现 | `host.ai` | `listAiProviders` / `discoverAiModels` / `listAiModels`；provider 由用户配置 |
| `openAiConversation` | `host.ai` | 打开宿主 AI 对话（Ask/Agent），附 2 MiB 快照；**返回 null，不回传对话内容**；不能假定用户说“保存”就触发插件持久化 |

### 3.5 Agent / MCP（了解即可，MVP 不用）

- `mcp` contribution 最多 1 个，需要 backend；插件自带工具不会自动出现在内置 Agent 中，需用户在插件中心 opt-in，且本插件连接在运行。
- 内置 Agent（agent 模式）会合并数据库工具与已打开插件的工具；非只读工具逐次审批。
- 外部 `dbx` MCP 与内置 Agent 是不同通道；`external_tools: true` 才向外部暴露。
- 插件 sidecar 反向 API 只有 `host/requestUserInput`：**不能直接查宿主连接/schema/storage**。

## 4. 权限白名单（F）

静态项（`crates/dbx-plugin-runtime/src/plugins/manifest.rs`）：`host.events`、`host.binary`、`host.workbench`、`host.filesystem`、`host.plans:read`、`host.schema:read`、`host.storage`、`host.ai`、`host.clipboard:read`、`host.data:read`、`host.connections:read`，以及历史兼容别名 `host.connections::read`。动态项：`host.network:https://host[:port]`（仅 https、无路径/查询/片段，最多 8 个）。

`fileTransfer` **不在** manifest 权限白名单内：它的“授权”是用户每次在原生打开/保存对话框或拖入动作上的显式同意（桥源码注释：与 `host.saveFile` 同一信任级别，无 manifest 权限门）。因此“能读文件”不等于“能按路径静默读文件”。

**首版计划请求（I）**：`host.workbench`、`host.data:read`、`host.connections:read`、`host.schema:read`、`host.storage`、`host.ai`（可选）。无业务需要不申请 `network`、`clipboard`、`filesystem`、`binary`；用不到就不要声明。

## 5. 能力探测与降级规则

1. 用 `engines.host_api` 声明最低版本（首版 `^1.4`）。
2. 运行时读 init 的 `capabilities` / `host.features`；缺 `dataApi` 时禁止刷新并提示升级；缺 `aiCompletion` 时保留完整手动流程。
3. 未知能力一律视为“不支持”，不要用 try/catch 探测代替能力声明。
4. 不把版本号当能力证明：同一版本不同端（desktop/web）和不同 API 可用性可能不同。

## 6. 安全模型要点

- iframe `sandbox="allow-scripts"`、opaque origin；CSP `default-src 'none'`，`connect-src` 仅声明的 https origin；默认无 worker/iframe/form，eval 仅图形引擎可选开启。
- 权限检查主要在**前端 bridge**（`hasPermission` / `requirePermission`）；后端只对 `host.data:read` 做二次强制校验。未来升级需按此现状评估，不能假设所有权限都有后端硬门。
- `result-view` 只给 500 行快照，`truncated` 只和 500 比较，不证明源结果完整性。
- 文件读取只在用户 `pick` 或拖入后发生；插件不能按路径直读、不能静默枚举目录；句柄必须在 `finally` 关闭（上限 64）。
- sidecar 以当前 OS 用户权限运行，不是 OS 沙箱；引入 sidecar 会显著扩大信任边界与发行成本。

## 7. 源码锚点

| 主题 | 位置（DBX 仓库相对路径，基线 b160d130） |
|---|---|
| Host API / 权限白名单 | `crates/dbx-plugin-runtime/src/plugins/manifest.rs:7`、`:21`、`:29` |
| 能力通告 | `apps/desktop/src/lib/plugins/pluginHostBridge.ts:490` |
| 权限判断 + 连接别名 | `apps/desktop/src/lib/plugins/pluginHostBridge.ts:1101` |
| queryData 桥/授权/并发 | `apps/desktop/src/lib/plugins/pluginHostBridge.ts:862`、`crates/dbx-core/src/query/plugin_data.rs:32`、`:91` |
| 表元数据 | `crates/dbx-core/src/schema/plugin_metadata.rs:23` |
| workbench 复用 | `apps/desktop/src/stores/queryStore.ts:4141` |
| result-view 500 行快照 | `apps/desktop/src/components/layout/ContentArea.vue:1573` |
| 连接摘要 | `apps/desktop/src/components/plugins/PluginWorkbenchHost.vue:613` |
| 文件传输（pick/read/save/drop） | `apps/desktop/src/lib/plugins/pluginHostBridge.ts:527-534`、`:839-843`、`:882-900`、`:932-975`、`:1528-1546`；`apps/desktop/src/components/plugins/PluginWorkbenchHost.vue:227-331`；`docs/content/docs/plugin-development.mdx:601-642` |
| 存储配额 | `src-tauri/src/commands/plugin_storage.rs:24` |
| AI 生成限额/确认 | `apps/desktop/src/lib/plugins/pluginAiCompletion.ts:90`、`:115` |
| Agent 合并插件工具 | `crates/dbx-core/src/ai/agent_loop.rs:334` |
| sidecar 反向 API | `crates/dbx-plugin-runtime/src/plugins/runtime.rs:774` |
| 安装与签名 | `crates/dbx-plugin-runtime/src/plugins/installer.rs:875`、`marketplace.rs:594` |

行号随 DBX 升级会漂移；引用前先重核。完整证据见 [analysis/evidence-index.md](../analysis/evidence-index.md)。
