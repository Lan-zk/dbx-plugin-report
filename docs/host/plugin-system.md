# 插件系统、打包与开发环境

> 基线 DBX `b160d130`（0.6.51）。本文只覆盖插件作者需要的事实；宿主内部实现细节以源码为准。

## 1. manifest v1

必需字段：`manifest_version`（=1）、`id`、`name`、`version`、`publisher`、`engines`。常用可选字段：`icon`、`description`、`source`、`homepage`、`permissions`、`entrypoints`、`contributions`、`localizations`。

- `id`：`^[a-z0-9][a-z0-9._-]*$`，最长 128，全局稳定，发布后不可改。仓库/展示名与 id 分开。
- `version`：`major.minor.patch`，同 id+version 的正式包不可覆盖。
- `engines`：至少含 `host_api`，首版 `^1.4`。
- `permissions`：最小集合；见 [capabilities.md](capabilities.md#4-权限白名单f)。
- `entrypoints`：UI 与/或 sidecar；纯 UI 插件只需 UI。
- `contributions`：workbench、result-view、command、menus、mcp 等；声明什么才有什么。
- `localizations`：按 locale 覆盖 name/description/贡献点/字段/动作文案。

**能力探测**：init 的 `capabilities`（如 `dataApi`、`storage`、`aiCompletion`）与 `host.features`；缺项视为不支持，不要靠 try/catch 探测。

## 2. UI 打包约束（重要）

- UI 必须是包内静态资源，不能把 Vite dev server 或 CDN 地址写进发行包。
- 宿主把入口/资源转换为沙箱可加载内容；路径必须落在 manifest 的 `ui.root` 内。
- iframe：`sandbox="allow-scripts"`，opaque origin；CSP `default-src 'none'`；无网络除非声明 `host.network:https://…`；默认无 worker/iframe/form；eval 仅图形引擎可选开启。
- 图标/资源路径必须是包内相对路径；远程 URL 与越界路径被拒绝。
- 插件 UI 应使用宿主主题 token（`document.documentElement.dataset.dbxTheme`、`var(--color-*)`）与 `dbx-*` 组件类，避免硬编码主题。

## 3. sidecar（首版 BI 不使用）

- manifest 声明 backend（Rust/Go）+ `entrypoints`；stdio JSON-RPC，protocol v1；JSONL 8 MiB / framed binary 64 MiB。
- 宿主 → sidecar：连接生命周期、filesystem、media/download、`mcp/tools`/`mcp/call`、`jdbcSession/*`、`invoke`。
- sidecar → 宿主：仅 `host/requestUserInput`。**不能查宿主连接、schema、storage。**
- sidecar 以当前用户权限运行，不是 OS 沙箱；引入它会显著扩大发行、信任与杀软/商店审核成本。

## 4. 安装、签名、商店

- 发行包 `.dbxp`；安装时校验 SHA-256 与 Ed25519 签名；版本不可变，升级/降级受来源连续性约束。
- 官方目录由 DBX 内置受信公钥验证；自定义仓库用用户管理的仓库密钥；官方目录只接受 DBX 管理的密钥。
- 商店 catalog 会核对包内 manifest 的 id/version/permissions 与条目一致；`license` 是可选字符串，不等于 SPDX 合规。
- 发布 PR 走 `t8y2/dbx-store`；插件源码留在作者自己的仓库。商店人工审核/签名/权限审查的耗时未验证（H7）。
- 插件中心可见 `host.data:read` 的每连接授权，可撤销；卸载插件会删除其 grants。

## 5. 开发环境

### 5.1 脚手架与打包

```bash
npm install --global @dbx-app/plugin-cli
dbx-plugin create my-ui-plugin --template frontend
dbx-plugin package --path ./my-ui-plugin
```

（命令以当前 CLI 为准；`plugins/README.md` 有完整说明。）

### 5.2 真机迭代（必须）

1. 在 DBX（版本 ≥0.6.51）中从本地 `.dbxp` 安装；
2. 打开 workbench，用开发者工具看 iframe 控制台/CSP 报错；
3. 准备 SQLite/PostgreSQL 只读连接，验证 `queryData`、授权弹窗、截断、取消保存；
4. 每次改动重新打包安装（或使用宿主允许的热重载方式，若有）。

**M0 必须真机验证**，因为 dev-host 不模拟数据 API/result-view/组件库。

### 5.3 dev-host（可加速 UI，但不覆盖数据闭环）

`plugins/sdk/dev-host` 提供 `dbx-plugin dev --path <plugin> --port 5190`，文档明确写着：

- **Host API 1.0 subset**：ready/contributionId/context/locale/theme/request/invoke/notify/onInit/onContext/onEvent/onBinary/sendBinary/资源读取/openWorkbench。
- 权限只强制 event/binary/workbench 等；未实现的方法（如 `host.openFilesystem`）返回错误。
- **不模拟**：native connection actions、query-result contributions、DBX 组件库；无 `queryData`、无 `getTableMetadata`、无 `saveFile`。
- 支持 sidecar（JSONL/framed）、连接 provider 表单、workbench tab、storage、诊断面板（500 条）、`127.0.0.1` 限制。

**决策（待 M0 验证）**：是否为 dev-host 增加 `queryData`/`saveFile` 的 mock 或 fixture 层。若成本低于 1 人日，优先做，能显著加快报表 UI 迭代；否则 UI 用 dev-host、数据闭环用真机。

### 5.4 测试命令（宿主契约，非插件测试）

报告使用的 155 项宿主契约测试（基线 b160d130，Vitest 4.1.8）：

```bash
pnpm exec vitest run \
  packages/app-tests/pluginPlanHostApi.test.ts \
  packages/app-tests/pluginSchemaMetadataHostApi.test.ts \
  packages/app-tests/pluginResultViewExample.test.ts \
  apps/desktop/src/lib/plugins/pluginHostBridge.spec.ts \
  apps/desktop/src/lib/plugins/pluginAiCompletion.spec.ts \
  apps/desktop/src/lib/ai/__tests__/aiPluginConversation.spec.ts \
  apps/desktop/src/stores/__tests__/queryStore.openPluginWorkbench.spec.ts \
  apps/desktop/src/components/layout/__tests__/ContentArea.pluginResultView.spec.ts \
  --maxWorkers 4
```

Rust 侧契约测试（可独立复现；本轮报告未运行，是否触发编译需评估）：

```bash
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled query::plugin_data
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled ai::plugin_tools
cargo test -p dbx-plugin-runtime mcp_contribution
cargo test -p dbx-plugin-runtime parses_only_strict_https_network_permissions
cargo test -p dbx-mcp plugin_tools
```

这些测试证明宿主契约，不证明 BI 插件正确；插件测试计划见 [testing/test-strategy.md](../testing/test-strategy.md)。

## 6. 版本与升级纪律

- 固定 DBX 基线（文首 commit）；每次升级重跑宿主契约测试 + 手工回归 V2/V3。
- 监听 Host API 版本与 `capabilities` 变化；新增能力不应改变已有字段语义。
- 文档格式用独立 `formatVersion`；未知 major 只读说明/拒绝运行，不静默迁移。
- 记录依赖许可证与版本，发布前生成 SPDX/NOTICE。
