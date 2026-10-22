# DBX 插件平台合同规则

基线：DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（0.6.51），Host API 1.4.0，manifest v1，sidecar protocol v1。权威顺序：Rust runtime（`crates/dbx-plugin-runtime/src/plugins/manifest.rs`）> `plugins/manifest.schema.json` > `plugins/*.md` > `docs/content` MDX。行号会漂移，引用前重核；操作细节见 `../skills/dbx-plugin-dev/references/platform.md`。

## 1. manifest v1

- 必填：`manifest_version`（=1）、`id`、`name`、`version`、`publisher`、`engines`。根与嵌套对象 `additionalProperties:false`；未知字段直接拒绝。
- `publisher` 必填：`plugins/README.md:137-154` 的示例漏了它，照抄安装失败（`manifest.rs:1116-1118`）。
- `id`：`^[a-z0-9][a-z0-9._-]*$`、≤128、发布后不可改；`version` 严格 semver。
- `engines.host_api: ^1.4`（首版，`docs/operations/release-and-security.md:8-11`）；`engines.dbx` 约束产品版本。
- v1 禁止 `executable`/`drivers`；`protocol_version` 不可覆盖；入口/UI 路径必须是包内相对路径，禁 `..`、绝对路径、前导 `/`、反斜杠、`//`；`ui.entry` 位于 `ui.root` 内。
- manifest 是创作契约**不是安全边界**（`plugins/README.md:156`）：权限检查主要在前端 bridge，后端只对 `host.data:read` 二次强制（`docs/host/capabilities.md:124`）。

## 2. 贡献点

- 8 类：`connection-provider`（backend）、`workbench`（UI）、`filesystem-provider`（backend）、`context-menu`（backend，**禁用 `options_action`**）、`result-view`（UI）、`command`（UI）、`menus`、`mcp`（backend，最多 1 个，需 opt-in）。
- UI/backend 耦合由 runtime 强制；schema 不允许 UI-only 插件声明需要 backend 的贡献点。
- **首版只声明 `workbench`**（可选 `result-view` 作为"从查询创建报表"入口）；不声明 mcp/filesystem-provider/connection-provider。**不得为每份报表动态新增贡献点**：同一 workbench 贡献只有一个窗口实例，复用键含 connection 不含报表 id（`docs/host/limits.md:33-42`）。
- `menus` 扩展上限：≤64 项、≤16 条件子句、命令 context ≤64 KiB、`visible_when`/`required_when` 嵌套 ≤8 层 / 64 节点。

## 3. 权限

- 只从 11 个字面量选：`host.events`、`host.binary`、`host.workbench`、`host.filesystem`、`host.plans:read`、`host.schema:read`、`host.storage`、`host.ai`、`host.clipboard:read`、`host.data:read`、`host.connections:read`。
- 动态项：`host.network:https://<host>[:port]`，仅 https、无 path/query/fragment，≤8 个 origin，重复即拒绝。
- `host.connections::read`（双冒号）被 schema 与 runtime 同时接受，按契约对待，不要"修正"。
- **首版最小集**：`host.workbench`、`host.data:read`、`host.connections:read`、`host.schema:read`、`host.storage`，可选 `host.ai`。**没有真实业务需要就不申请** `host.network`、`host.clipboard:read`、`host.filesystem`、`host.binary`（`docs/host/capabilities.md:110-112`）。
- 权限 ≠ 授权：`queryData` 每次调用重校验 (plugin, connection) grant；撤销返回 `PLUGIN_DATA_ACCESS_NOT_GRANTED`。`host.connections:read` 只给脱敏摘要，不给查询权。
- 文件保存/选择没有独立同名 manifest 权限，不要虚构。
- 权限声明变化是用户可见事件：只增不减要有理由；扩大权限必须同步更新商店 catalog 与文档。

## 4. UI 沙箱

- iframe `sandbox="allow-scripts"`、opaque origin、CSP `default-src 'none'`；`connect-src` 只含声明的 https origin；无 Tauri、无父 DOM、无直接网络、无 Node。
- 无 worker / 嵌套 iframe / form；`eval`/`new Function` 仅图形引擎可选开启——**本项目不使用**（`docs/testing/test-strategy.md:95-96`、`docs/development/architecture.md:161`）。
- `localStorage`/`sessionStorage` 抛异常 → 用 `window.dbxPlugin.storage`。
- 构建产物相对路径（Vite `base: "./"`）；`<link rel=stylesheet>` 被改写为 `<style>`，`disabled` 丢失；`requestFullscreen` 需先探测。
- UI 资源 `readAsset`/`readAssetUrl` 单个 ≤32 MiB；JSON/binary 消息分别 ≤8 MiB / 64 MiB，超限宿主断连。

## 5. 打包、签名、安装

- 产物 `.dbxp`（ZIP，`manifest.json` 在根）；`[package].include` 决定 staging 目录（模板默认 `["assets","ui"]`）。
- packager 上限：包 512 MiB、解压 1 GiB、单文件 256 MiB、10000 条目；拒绝 symlink、路径穿越、输出在源内、缺 manifest。
- `dbx-plugin package` 永远输出**未签名**候选 + `.artifact.json`；签名是仓库级 Ed25519（一人一包），v1 没有作者签名，作者不持有商店密钥。
- 未签名安装只在 `LocalDevelopment` 策略下可用（插件中心「Allow unsigned development packages」）；官方市场永不放宽。
- `id` + `version` 不可覆盖；升级/降级受来源连续性约束；商店目录 `t8y2/dbx-store`，catalog payload ≤4 MiB。
- 签名只认证"谁签了这些字节"，不等于安全或审核；`license` 字段只是字符串，≠ SPDX 合规。

## 6. sidecar（M0–M2 禁止引入）

- 不引入 sidecar 是硬边界（`docs/README.md:54`）；如后续引入必须另做信任边界评审，并且：
  - 常驻子进程，stdin/stdout 只走协议，日志写 stderr；
  - transport：`stdio-jsonl`（≤8 MiB/行）或 `stdio-framed`（5 字节头，binary ≤64 MiB/frame）；
  - 反向只有 `host/requestUserInput`；拿不到宿主 driver/pool/凭据/连接串；不能跨插件、不能碰宿主 DOM；
  - 不是 OS 沙箱（用户权限运行，文件系统/网络无法完全中介）。

## 7. 兼容与版本

- `manifest_version` 仅在旧 DBX 无法解释的形状变更时 bump；sidecar protocol 仅 wire 破坏时 bump；同 host API major 内新增字段保持可选。
- 已保存的连接/文档必须跨插件升级可读；未知 `formatVersion` major 只读拒绝，不静默迁移。
- 需要更高 Host API：声明下限 + 运行时读 `capabilities`/`host.features`；缺能力就降级，不用 try/catch 探测代替声明；版本号相同 ≠ 能力相同（desktop/web 有差异）。
- 没有正式的权限/方法弃用时间表，不要依赖弃用承诺。

## 8. 禁止清单（违反即拒绝合并）

1. 伪造 manifest 字段或照抄含错误的 README 示例。
2. 申请无业务需要的权限（尤其 `host.network`、`host.clipboard:read`）。
3. 用 localStorage/父页面通信/Tauri 取巧绕过沙箱。
4. 展示/记录凭据；把连接串、密码、token 写入文档、日志或 AI prompt。
5. 引入 sidecar 或任何未经评审的原生组件（M0–M2）。
6. 直接引用 CDN/远程字体/远程图标/遥测。
7. 在代码或 UI 中把拟定阈值写成"宿主支持"。
8. 声称 `dbx-plugin` 有 `build`/`validate` 子命令，或声称未运行的测试已通过。
9. 用自建 "manifest 校验脚本" 替代宿主行为验证（宿主行为只能真机或宿主契约测试验证）。
10. 复制其他插件/竞品实现；只借鉴结构。
