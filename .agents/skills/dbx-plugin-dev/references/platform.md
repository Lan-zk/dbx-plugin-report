# DBX 插件平台合同（manifest v1 / Host API 1.4）

基线：DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（0.6.51），Host API 1.4.0，sidecar protocol v1。行号会漂移，引用前重核。权威顺序：runtime > manifest.schema.json > plugins/*.md > docs/content MDX。

## 1. manifest v1

必填顶层：`manifest_version`（必须为 `1`）、`id`、`name`、`version`、`publisher`、`engines`。

- 根对象与嵌套对象均为 `additionalProperties:false`；未知顶层字段报错 `Plugin manifest contains unknown top-level field(s): …`（`plugins/manifest.schema.json:6,21,40,51`；`crates/dbx-plugin-runtime/src/plugins/manifest.rs:1089-1094`）。
- `id`：`^[a-z0-9][a-z0-9._-]*$`，≤128 字符，发布后不可改（`manifest.rs:1097-1099`）。
- `version`：严格 semver（`manifest.rs:1113-1115`）。
- `publisher`：v1 必填，缺失报错 `Manifest v1 plugins must declare a publisher`（`manifest.rs:1116-1118`）。
- `engines`：必填；`host_api` 是兼容下限，`dbx` 约束产品版本（`manifest.schema.json:21-22`、`plugins/README.md:930`）。当前宿主实现 `host_api 1.4.0`、protocol `1`（`manifest.rs:21,23,24`）。
- v1 禁止 `executable`/`drivers`；`protocol_version` 不可覆盖；v0 仅用于迁移（`manifest.rs:1088,1104-1112`）。
- 入口路径必须非空相对路径；拒绝 `..`、绝对路径、前缀逃逸（`manifest.rs:1296-1308`）。`icon`/UI 路径禁止前导 `/`、`..`、反斜杠、`//`；`ui.entry` 必须在 `ui.root` 内（`docs/content/docs/plugin-development.mdx:92`）。

## 2. 贡献点（8 类，schema 强制）

| 类型 | 必需入口 | 说明 |
|---|---|---|
| `connection-provider` | backend | 数据库连接提供者（Java JDBC agent 形态） |
| `workbench` | UI | 插件主工作台（iframe 页面）；首版主载体 |
| `filesystem-provider` | backend | 自定义文件系统 |
| `context-menu` | backend | 右键菜单项；**不能使用 `options_action`** |
| `result-view` | UI | 从查询结果创建草稿的入口 |
| `command` | UI | 命令面板命令 |
| `menus` | — | 菜单扩展；组 `navigation/primary/secondary/destructive`，≤64 项，≤16 条件子句，命令 context ≤64 KiB，`visible_when`/`required_when` 嵌套 ≤8 层 / 64 节点 |
| `mcp` | backend | MCP 工具；最多 1 个，需用户 opt-in |

- UI/backend 耦合由 runtime 强制：workbench、result-view、command 需要 UI；context-menu、filesystem-provider、mcp 需要 backend（`manifest.rs:1418,1433,1449,1495,1505,1573`）。
- 同一 workbench 贡献只有**一个**窗口实例（tab/dock/floating 共享复用键，键含 connection 不含报表 id）；不要为每份报表动态新增贡献点。

## 3. 权限

运行时白名单 11 个字面量：`host.events`、`host.binary`、`host.workbench`、`host.filesystem`、`host.plans:read`、`host.schema:read`、`host.storage`、`host.ai`、`host.clipboard:read`、`host.data:read`、`host.connections:read`。

- 动态项：`host.network:https://<host>[:port]`，只允许 https、无 path/query/fragment，最多 **8** 个 origin，重复权限报错（`manifest.rs:29-46,1132-1160`）。
- `host.connections::read`（双冒号）被 schema 与 runtime 同时接受（`manifest.schema.json:33`、`manifest.rs:41`），按契约对待。
- 权限 ≠ 授权：`queryData` 每次调用重校验 permission 与 per-(plugin, connection) grant；撤销后返回 `PLUGIN_DATA_ACCESS_NOT_GRANTED`（`plugins/README.md:672`）。
- 高程权限语义（`plugins/README.md:885`）：`plans:read` 不执行 SQL/写/DDL；`schema:read` 不给任意 SQL/写/重连；`data:read` 不给写/DDL/加锁读/切库/重连；`connections:read` 不给密码/凭据/连接串。
- 文件保存/选择没有独立 manifest 权限，不要虚构。
- 没有真实业务需要就不申请 `host.network`、`host.clipboard:read`、`host.filesystem`、`host.binary`。

## 4. UI 沙箱

- iframe `sandbox="allow-scripts"`、opaque origin、CSP `default-src 'none'`；`connect-src` 只含声明的 https origin；无 Tauri 对象、无父 DOM、无直接网络（`plugins/README.md:359,385`）。
- 无 worker / 嵌套 iframe / form；`eval` 仅图形引擎可选开启；构建不得依赖 `unsafe-eval`。
- `localStorage`/`sessionStorage` 在 opaque origin 下抛异常 → 用 `window.dbxPlugin.storage`（`plugin-development.mdx:646-653`）。
- 构建产物用相对 URL（Vite `base: "./"`），否则 code-split 404（`plugin-development.mdx:839`）。
- `<link rel="stylesheet">` 会被改写为 `<style>`，`disabled` 状态丢失，需要重新应用（`plugin-development.mdx:843`）。
- `requestFullscreen()` 需要宿主 Permissions-Policy 委托，先探测 `document.fullscreenEnabled`（`plugin-development.mdx:847`）。
- UI 资源 `readAsset`/`readAssetUrl` 单个 ≤32 MiB。
- 两个 workbench 表面（tab + dock/浮窗）可能同时打开，状态需经 storage 或 sidecar 传递，不能假设单实例内存共享。

## 5. Host API（`window.dbxPlugin`）

| 方法 | 权限 | 关键合同 |
|---|---|---|
| `ready`/`context`/`locale`/`theme` | — | locale 如 `en`/`zh-CN`；context UTF-8 ≤2 MiB；宿主注入保留字段 `workbenchId`、`restored`、`surface`（`tab`/`dock`/`window`） |
| `onContext`/`onEvent`/`onBinary` | `host.events` / `host.binary` | 无权限不转发 |
| `invoke`/`notify` | — | JSON-RPC 只到自己 sidecar；bridge 参数上限 2 MiB |
| `sendBinary(channel, data)` | `host.binary` | UI 单向 8 MiB/条，超出分块 |
| `readAsset`/`readAssetUrl` | — | 单个资源 ≤32 MiB |
| `openWorkbench`/`setTitle`/`getTitle`/`executeCommand` | `host.workbench` | 每个贡献点一个实例；tab/panel 两种呈现 |
| `openFilesystem` | `host.filesystem` | dev-host 未实现 → 报错；只属 filesystem-provider，报表打开不用它 |
| `fileTransfer.pick/read/beginSave/write/finish/closeFileHandle`、`onDrop`/`onDragState` | — | **无 manifest 权限**：pick/beginSave 由原生对话框触发，drop 由 OS 拖入触发；读块 ≤8 MiB、句柄上限 64、drop 展开 ≤2000 文件/8 层；web 端 pick=input、beginSave=下载；dev-host 未实现，须真机验证 |
| `getPlanCapabilities`/`explainPlan` | `host.plans:read` | Host API 1.2；`maxPlanBytes` 4 MiB、`maxTimeoutMs` 60000；插件不提供 SQL |
| `getTableMetadata` | `host.schema:read` | Host API 1.3；字段仅 `name,dataType,nullable,length,precision,scale,default`；只对已知表；可能返回 `unknown` |
| `queryData` | `host.data:read` | Host API 1.4；一次只读语句；每（插件,连接）授权；上限见 `data-and-security.md` |
| `storage.get/set/delete` | `host.storage` | 单值 ≤256 KiB、总量 ≤1 MiB，落在 `plugin-data/<id>`；无 CAS |
| `ai.openConversation` | `host.ai` | title ≤200、prompt ≤32000、context ≤2 MiB |
| `ai.listProviders`/`discoverModels` | `host.ai` + `capabilities.aiModelDiscovery` | 凭据留在宿主 |
| `ai.listModels` | `host.ai` + `capabilities.aiCompletion` | 只返回 `{configId,name,model,isDefault}` |
| `ai.generateText` | `host.ai` + `capabilities.aiCompletion` | prompt ≤100000 字符、返回 ≤16000 字符、同一 workbench 单飞、逐次确认 |
| `ai.setRecommendations`/`clearRecommendations` | `host.ai` | ≤5 条可见、不持久化 |
| `capabilities` | — | `{downloadFile,planApi,schemaMetadataApi,dataApi,connectionsApi,storage,ai,aiModelDiscovery,aiCompletion,aiRecommendations,fileTransfer:{pick,beginSave,read,drop,folderExpansion}}`；调用前先门控 |
| `host.requestUserInput`（sidecar→host） | Host API 1.1 | prompt ≤2000、title ≤200、default ≤1000、options ≤8×200、timeoutSecs 5–600（默认 300）、**最多 4 个同时打开**，错误码 `-32001`/`-32602`/`-32601` |

能力探测规则：声明 `engines.host_api` 下限，同时运行时读 `capabilities`/`host.features`；缺 `dataApi` 禁止刷新并提示升级；缺 `aiCompletion` 保留完整手工流程；未知能力一律视为不支持；不要用 try/catch 探测代替能力声明；版本号相同不代表能力相同（desktop/web 有差异）。

消息上限：JSON 消息 ≤8 MiB（`8388608`），binary frame ≤64 MiB（`67108864`）；超出宿主直接断连（`crates/dbx-plugin-runtime/src/plugins/runtime.rs:51-52,399-400,590-591`）。

## 6. 打包、签名、安装

- `.dbxp` 是 ZIP，`manifest.json` 在包根；只有 `[package].include` 声明的目录会被 staging（模板默认 `["assets","ui"]`）。
- packager 限制：包 512 MiB、解压后 1 GiB、单文件 256 MiB、最多 10000 条目；拒绝 symlink、路径穿越、输出在源目录内、非 `.dbxp` 输出、缺 `manifest.json`（`plugins/sdk/packager/src/main.rs:12-15,105-140`）。
- `dbx-plugin package` **永远**产出未签名候选 + `.artifact.json`（不含 `signingKeyId`）。
- 签名是仓库级 Ed25519，一个包一个签名；v1 没有作者签名；作者不持有商店密钥；`dbx-plugin keygen` 只用于自定义/私有仓库（`plugins/SIGNING.md:3,19-31`）。
- 未签名安装只在 `LocalDevelopment` 策略下被接受（插件中心「Allow unsigned development packages」）；官方市场永不放宽（`crates/dbx-plugin-runtime/src/plugins/installer.rs:887,901-902`）。
- `id` + `version` 不可覆盖，升级必须新 semver + 新资产；商店目录是 `t8y2/dbx-store`（catalog payload ≤4 MiB）。
- 签名只证明"谁签了这些字节"，不等于安全或已审核；商店 `license` 字段只是字符串，不等于 SPDX 合规。

## 7. sidecar 协议 v1（本仓库 M0–M2 不引入）

- 常驻子进程；**stdin/stdout 只走协议，诊断日志写 stderr**（stdout 乱写会破坏握手）。
- 传输：`stdio-jsonl`（每行一个 JSON，≤8 MiB/消息）；`stdio-framed` 5 字节头 `kind:u8 | len:u32 big-endian | payload`，kind `0`=UTF-8 JSON，kind `1`=binary（`channel_length:u16 | channel | binary`），binary ≤64 MiB/frame。
- JSON-RPC 2.0；支持并发 in-flight 请求、每请求超时、严格校验、崩溃传播、握手/协议/输出失败自动终止子进程。
- `plugin/initialize`：host `{dbxVersion, hostApiVersion, protocolVersions:[1]}` + plugin `{id, version}` + `permissions[]`；sidecar 回复 `protocolVersion: 1` + capabilities；不匹配即拒绝。
- 生命周期：按需 spawn 一次，按**插件进程**共享（不是每 tab 一个）；卸载时若仍有保存的连接引用该插件会被阻止。
- 边界：不是 OS 沙箱，以当前用户权限运行，文件系统/网络访问"无法被完全中介"；拿不到宿主 driver/pool/凭据/连接串；不能跨插件、不能访问宿主 DOM；反向只有 `host/requestUserInput`。

## 8. 兼容与版本

- `manifest_version` 只在旧 DBX 无法解释的形状变更时 bump；sidecar protocol 只在 wire 层不兼容时 bump。
- 同一 host API major 内新增字段保持可选；已保存的插件连接必须跨插件升级可读（provider 自有的 `external_config` 由后端迁移）。
- `engines.host_api` 是兼容下限而不是版本声明；需要更高 API 时同时读 capability flag，因为旧宿主没有该 flag。
- Host API 级别：1.0 基础；1.1 `requestUserInput`；1.2 plans；1.3 schema metadata + clipboard read；1.4 data queries；当前宿主最大 1.4.0。
- 没有正式的权限/方法弃用时间表（未在文档中找到），不要依赖弃用承诺。
