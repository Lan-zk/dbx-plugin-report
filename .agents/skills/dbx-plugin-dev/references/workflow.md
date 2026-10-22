# 插件开发工作流、命令与验证

## 1. 前置

- DBX 桌面端 ≥0.6.51（基线 `b160d130`），SQLite 优先、PostgreSQL 用于后续认证。
- **Node.js 22+**：`dbx-plugin dev` 对 <22 硬报错 `dev requires Node.js 22+`（`plugins/sdk/cli/src/dev.rs:183,190-191`）；npm 包装器只要求 `>=18.18`，不要据此以为 dev 可用。
- npm/pnpm，以及全局 `@dbx-app/plugin-cli`（仓库实现版本 0.1.9；文档 release workflow 固定 0.1.2，别混淆）。
- 本仓库布局：宿主在 sibling `E:\File\self\github\dbx`（只读参考），插件在本仓库；产物 `.dbxp` 不入库或按仓库规则放 `fixtures/`。

## 2. CLI 真相

子命令只有 `create | package | dev | keygen | version | help`（`plugins/sdk/cli/src/lib.rs:328-343`）。

- **没有 `build`**：原生后端由你自己的工具链构建，然后 `package` 打 `.dbxp`。
- **没有 `validate`**：所谓"校验"要么是上面 CLI 的接受/拒绝行为，要么是 DBX 仓库内的 cargo/node 检查。

```bash
# 安装 CLI
npm install --global @dbx-app/plugin-cli
# 或从源码（只在改 SDK 时）
cargo install --locked --path plugins/sdk/cli

# 脚手架：frontend | svelte | rust | go
dbx-plugin create my-plugin --template frontend --yes
dbx-plugin create my-plugin --template rust --sdk-root /path/to/dbx

# dev-host（Node 22+）；默认端口 5190，被占用自动换端口并打印 URL
dbx-plugin dev --path . --port 5190
dbx-plugin dev --path . --port 0 --data-dir .dbx-dev

# 打包：dist/<id>-<version>-<target>.dbxp + .artifact.json（未签名）
dbx-plugin package .
dbx-plugin package . --target universal --output-dir dist \
  --artifact-url https://downloads.example.com/my-plugin.dbxp
```

- `create` 参数：`-t/--template`（= `--backend`、`-l/--language` 别名）、`--id`、`--name`、`--publisher`、`--description`、`--version`、`--sdk-root`、`--force`、`-y/--yes`。usage 字符串漏了 `svelte`，但解析器与帮助都接受 4 个模板。
- 生成文件：`dbx-plugin.toml`、`manifest.json`、`README.md`、`ui/index.html`、`.github/workflows/plugin-release.yml`；rust/go 额外 `backend/`。
- 前端模板默认 `universal` target，rust/go 默认当前平台 target。
- `--port 0` 随机端口；`--port 5190` 被占用时回退到空闲端口——脚本要解析打印出的 URL，不能假设 5190。
- 环境变量：`DBX_PLUGIN_NODE`（node 可执行文件）、`DBX_PLUGIN_DEV_RUNTIME`（runtime 入口覆盖）。
- `[dev] ui_build`/`ui_watch` 是 `{exec,args}` 数组（不经 shell）；重建成功靠单独一行 `DBX_UI_BUILD_SUCCESS` 通知。UI 重建=显式 reload；backend 重建会丢会话，没有自动重放。

## 3. dev-host 的边界（不要当成完整宿主）

dev-host 只模拟 **Host API 1.0 子集**，并在浏览器里跑：

- 有：`ready`/`contributionId`/`context`/`locale`/`theme`、`invoke`/`notify`、`onInit`/`onContext`/`onEvent`/`onBinary`、`sendBinary`、资源读取、`openWorkbench`、sidecar、连接 provider 表单、workbench tab、storage、诊断面板。
- 强制权限只有 event/binary/workbench 等子集；未实现方法（如 `openFilesystem`）直接返回错误。
- **没有** `queryData`、`getTableMetadata`、`saveFile`（数据路径必须真机验证）。
- 不模拟 native connection actions、query-result contributions、DBX 组件库，也不读 DBX profile/Keychain/签名/安装/桌面生命周期。
- 诊断接口只 GET：`curl 'http://127.0.0.1:5190/api/diagnostics?after=0&limit=100'`；500 条环形缓冲，仅绑定 `127.0.0.1`，无 CORS。

## 4. 真机迭代与检查点

1. `dbx-plugin package` 得到未签名 `.dbxp`。
2. DBX 插件中心开启「Allow unsigned development packages」，从本地文件安装。
3. 打开 workbench，用 DBX 开发者工具看 iframe 控制台（CSP / 权限 / postMessage origin 报错）。
4. 准备一个已打开的 SQLite 或 PostgreSQL 连接；每次改动重新打包安装（或宿主热重载）。

检查点（全部要过）：

- `window.dbxPlugin` 存在；init 后 `capabilities.dataApi === true`。
- `listConnections` 只返回脱敏摘要，看不到密码/连接串。
- `queryData` 首次弹授权对话框；拒绝后可恢复、不重试轰炸。
- `saveFile` 弹保存对话框，取消返回 `null`，界面不得显示"已保存"。
- 无 `Refused to …` CSP 报错、无 postMessage origin 报错、无 `unsafe-eval` 依赖。

## 5. 宿主契约测试（在 DBX 仓库根执行）

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

分析时实测输出：`Test Files 8 passed (8); Tests 155 passed (155); Duration 7.34s`（Vitest 4.1.8）。重跑前不要把它当现状引用。

Rust 侧契约（可能触发编译，分析时未跑）：

```bash
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled query::plugin_data
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled ai::plugin_tools
cargo test -p dbx-plugin-runtime mcp_contribution
cargo test -p dbx-plugin-runtime parses_only_strict_https_network_permissions
cargo test -p dbx-mcp plugin_tools
```

本仓库插件自身命令目前是**计划**（无 `package.json`，不可执行）：`pnpm install | typecheck | test | build | package`。E2E/真机用例不进 CI，按 `docs/testing/acceptance.md` 手工执行并留证。

## 6. 上游仓库内的校验（改 SDK/示例时）

```bash
cargo test -p dbx-core --no-default-features plugins::
cargo check -p dbx-web --no-default-features
cargo test --manifest-path plugins/sdk/rust/dbx-plugin-sdk/Cargo.toml
cargo check --manifest-path plugins/sdk/packager/Cargo.toml
node plugins/examples/hello-workbench/package.mjs
node plugins/examples/hello-workbench/smoke.mjs
npm test --prefix plugins/sdk/dev-host
cargo test --locked --manifest-path plugins/sdk/cli/Cargo.toml
npm test --prefix packages/plugin-cli
```

参考插件 `plugins/examples/hello-workbench/`（id `dbx.example.hello`）：可直接跑 `package.mjs`/`smoke.mjs`，安装需开 unsigned 开发策略。release workflow 会拒绝包含 `signature.json` 或 metadata 含 `signingKeyId` 的候选。

## 7. Footgun 清单

| 现象 | 真相 |
|---|---|
| 照抄 `plugins/README.md:137-154` 的 manifest 安装失败 | 示例漏了必填 `publisher`；以 schema:7 与 `manifest.rs:1116` 为准 |
| 以为 `host.connections::read` 是文档笔误 | schema 与 runtime 都接受，按契约处理 |
| 以为 `create` 不支持 svelte | usage 字符串漏写，解析器与 help 支持 4 个模板 |
| `localStorage` 突然抛异常 | opaque origin；改用 `dbxPlugin.storage` |
| 构建后动态 chunk 404 | Vite 等需 `base: "./"` |
| 样式 `<link>` 的 `disabled` 失效 | 宿主改写为 `<style>`，需自己标状态 |
| 全屏失败 | 缺 Permissions-Policy 委托，先探测 `document.fullscreenEnabled` |
| 浏览器里选本地文件失灵 | 浏览器宿主把文件选择变成 1 MiB 内容上传；目录选择仅桌面端 |
| `context-menu` 里写 `options_action` 被拒 | 该 action 形态没有这个字段，未知字段在 manifest 校验期拒绝 |
| 大数据量"突然卡住" | 多半是超过 8 MiB JSON / 64 MiB binary 消息上限被宿主断连 |
| 用 `LIMIT` 分批绕 5000 行上限 | 不允许；截断语义必须显式展示 |
| 用 dev-host 验证 queryData/saveFile | 它没有这些方法，必须真机验证 |
| 把 sidecar stdout 用来打日志 | 会破坏协议握手；日志写 stderr |
| 认为签名=安全 | 签名只认证签名者与字节；sidecar 不是 OS 沙箱 |
| 假设 dev-host 端口 5190 | 端口被占用会回退，解析打印的 URL |

## 8. 文档与源码不一致（引用前核对）

- `plugins/README.md` 的 manifest 示例缺 `publisher`；`plugins/RELEASING.md:68` 固定 `@dbx-app/plugin-cli@0.1.2`，仓库包是 0.1.9；`create` usage 漏 `svelte`；"concurrency 4" 实际是 `MAX_PLUGIN_PROMPTS_IN_FLIGHT`（输入提示并发），不是数据查询并发。
- 权威顺序：Rust runtime > schema > 模板 > `plugins/*.md` > `docs/content` MDX。业务决策类文档（本仓库 `docs/`）按 F/I/H 标注，不替代源码事实。
