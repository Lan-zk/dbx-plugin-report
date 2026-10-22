# 开发、验证与交付规则

来源：`docs/development/dev-environment.md`、`docs/development/first-slice.md`、`docs/testing/test-strategy.md`、`docs/testing/acceptance.md`、`docs/operations/release-and-security.md`、`docs/development/roadmap.md`。平台操作细节见 `../skills/dbx-plugin-dev/references/workflow.md`。

## 1. 环境与布局

- DBX 桌面端 ≥0.6.51（基线 `b160d130`）；**Node.js 22+**（`dbx-plugin dev` 硬性要求）；npm/pnpm + 全局 `@dbx-app/plugin-cli`。
- 本机 sibling：`E:\File\self\github\dbx`（宿主，只读参考）、`E:\File\self\github\dbx-report`（本插件）。宿主行号按 DBX 仓库根解析，引用前重核或固定 commit。
- SQLite 零配置优先；PostgreSQL 用于 M4 认证；Windows/macOS 均需测路径/换行差异。
- 仓库当前只有 `README.md` + `docs/`，**没有** `package.json`、插件代码、CI。任何"计划命令"不得当成可执行现状。

## 2. 工作流（M0 顺序）

1. 读 `.agents/rules/plugin-contract.md`、`data-and-security.md`、`docs/development/first-slice.md`。
2. 只在 M0 范围内动手：最小 UI-only workbench，证明"打开→执行→渲染→另存→重开→再执行"闭环（时间盒 1–3 天）。
3. 脚手架：`dbx-plugin create dbx-report --template frontend`（在临时目录或明确记录的位置执行，`first-slice.md:31` 的仓库根执行会再建子目录）。
4. dev-host 迭代 UI（`dbx-plugin dev --path . --port 5190`）；**数据路径必须真机验证**。
5. `dbx-plugin package` → 插件中心开启「Allow unsigned development packages」→ 本地安装 → 真机检查点。
6. 记录 `docs/development/records/<date>-m0.md`（目录首次需新建）。
7. 更新 `docs/development/roadmap.md` 状态与 `docs/testing/acceptance.md` 签收记录。

## 3. 命令真相

```bash
npm install --global @dbx-app/plugin-cli     # 或 cargo install --locked --path plugins/sdk/cli
dbx-plugin create dbx-report --template frontend --yes
dbx-plugin dev --path . --port 5190          # Node 22+；端口占用会回退，解析打印的 URL
dbx-plugin package .                          # dist/<id>-<version>-<target>.dbxp + .artifact.json（未签名）
```

- CLI 只有 `create|package|dev|keygen|version|help`；**没有 `build`、没有 `validate`**。原生后端由自己的工具链构建后再打包。
- dev-host 只模拟 Host API 1.0 子集，**没有 `queryData`/`getTableMetadata`/`saveFile`**，不模拟 result-view/组件库/native connection actions；诊断接口只 GET `http://127.0.0.1:5190/api/diagnostics?after=0&limit=100`。
- 插件自身命令（`pnpm install|typecheck|test|build|package`）是**计划**，当前不可执行；E2E/真机用例不进 CI。

## 4. 真机检查点（M0 必过）

`window.dbxPlugin` 存在；init 后 `capabilities.dataApi === true`；`listConnections` 只返回脱敏摘要；`queryData` 首次弹授权、拒绝后可恢复；`saveFile` 弹对话框、取消返回 `null` 且界面不显示"已保存"；无 CSP（`Refused to …`）报错、无 postMessage origin 报错、无 `unsafe-eval` 依赖。

## 5. 宿主契约测试（在 DBX 仓库根）

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

2026-10-22 实测：`Test Files 8 passed (8); Tests 155 passed (155); Duration 7.34s`（Vitest 4.1.8）。重跑前不得把它当现状，引用需注明日期/环境。

Rust 侧契约（可能触发编译，**本轮未运行 → H**）：

```bash
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled query::plugin_data
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled ai::plugin_tools
cargo test -p dbx-plugin-runtime mcp_contribution
cargo test -p dbx-plugin-runtime parses_only_strict_https_network_permissions
cargo test -p dbx-mcp plugin_tools
```

## 6. 测试分层与里程碑退出（`test-strategy.md`）

- L0 宿主契约（本文第 5 节）；L1 单元（schema/hash/队列/错误映射/格式化/CSV 转义，Vitest jsdom，不碰宿主）；L2 真机集成（授权/queryData/saveFile/result-view/workbench 复用，手工脚本 + 截图/日志）；L3 数据正确性（黄金 SQL vs `sqlite3`/`psql`）；L4 AI 评估；L5 安全；L6 发布。
- V1 宿主契约；V2 安装/权限/授权/运行/保存；V3 数据正确性（A01–A16，PG 追加 P01–P07）；V4 AI 门槛；V5 Agent/MCP（M4+）；V6 文档格式与兼容；V7 资源与会话；V8 安全与许可。
- 退出：M0 = V1 + V2 最小闭环无 P0；M1 = V2/V3（A01–A16）/V6 round-trip/V8 子集 + 2 名作者演练；M2 = V2 多卡/部分失败 + V7；M3 = V4 全门槛（否则移除 AI）；M4 = V3 PG 全量 + V6/V8 全量 + 发布检查 + 商店审核（V5 仍无里程碑承接，属未决）。
- **"单测绿"≠"集成通过"**；真实 DBX UI 不在 CI 跑；不得用"没报错"替代安全验证。

## 7. 证据与记录

- 任何"已验证"必须附：命令、环境（DBX 版本/OS/数据库版本/插件版本）、日期；未运行保持 H。
- M0 记录字段：环境、命令与脱敏截图、CSP/权限报错、`queryData` 响应样例（去数据）、图表库结论/包体积/耗时、失败分支、go/no-go。
- 验收签收字段（`acceptance.md:83-91`）：里程碑 / 日期 / 执行人 / 环境 / 结果（通过·有条件通过·不通过）/ 逐项证据 / 遗留问题 / 决定 / 签名。
- 日志只输出 code/耗时/行数/截断标记；不输出 SQL 字面量、结果值、连接串、token。

## 8. 文档维护（`docs/README.md:64-70` + `decisions.md:4`）

1. DBX Host API/权限/限制变化 → 更新 `docs/host/` 与 `docs/analysis/evidence-index.md`，并更新 `docs/README.md` 基线 commit。
2. 范围变化 → 先改 `docs/product/decisions.md`（新增 ADR 或修订待拍板项），再改 `docs/development/roadmap.md`；禁止在里程碑里悄悄扩大范围。
3. 每个里程碑结束 → 更新 `docs/testing/acceptance.md` 签收记录与 `docs/development/roadmap.md` 状态。
4. "已验证"结论必须附命令、环境、日期；未运行保持 H。
5. 决策改动必须写日期、理由、替代方案与复议条件；影响范围的决策同步更新 scope 与 roadmap。
6. 新增/修改文档遵循 F/I/H 与"拟定不是现状"；不复制其他目录的重复内容。

## 9. 发布检查（M4 门，`release-and-security.md:15-25`）

单测/typecheck/build/package 无遗留；真机 V2/V3/V6/V8 留证；权限最小化；manifest 字段正确、id 不改；无凭据/测试数据/内部路径；SPDX/NOTICE 无 copyleft 冲突；文档与商店描述一致；无 `v-html`/`unsafe-eval`/远程 URL；可安装/卸载、卸载清 grants；有回滚方案与支持渠道。发布门 7 项（`acceptance.md:72-78`）：版本 semver + CHANGELOG、权限最小化、文档覆盖、已知限制公开、无 P0/P1、许可证/NOTICE、支持渠道。

## 10. 基线升级纪律（`dev-environment.md:109-112`）

1. 先跑宿主契约测试（第 5 节）。
2. 再跑 M0/M1 手工回归：安装 → 授权 → queryData → saveFile → result-view。
3. 最后更新文档与证据行号；不跟随 DBX main 每日漂移，以 release/tag 为节点。
4. 基线 commit 变化必须同步 `docs/README.md`、本目录与 `../skills/dbx-plugin-dev/` 的基线说明。

## 11. 交付格式

按需报告 **Changes**（新增/修改/删除及影响）、**Verification**（实际跑过的检查与结果）、**Documentation**（注释/README/文档同步状态）、**Remaining Issues**（限制、阻塞、未验证项）。不适用项省略，不写空节；结论附路径/命令；不臆测、不夸大、不编造。
