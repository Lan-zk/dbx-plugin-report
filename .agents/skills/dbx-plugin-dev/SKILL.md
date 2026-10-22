---
name: dbx-plugin-dev
description: "开发、调试、打包、验证 DBX 桌面端插件（manifest v1、UI-only workbench、Host API 1.4、sidecar 协议 v1、.dbxp 打包与仓库签名）。当需要新建或修改 DBX 插件、编辑 manifest.json 或权限/贡献点、接入 window.dbxPlugin、使用 dbx-plugin dev 调试、把插件打包给 DBX 插件中心安装时使用。"
---

# DBX 插件开发

DBX 插件是跑在 DBX 桌面端沙箱 iframe（UI）与可选原生 sidecar（后端）里的扩展包，以 `.dbxp` 分发。本技能给出可执行的开发流程与硬约束；本仓库（dbx-report）的产品规则在 `.agents/rules/`，上游事实源在本机 sibling 仓库 `E:\File\self\github\dbx`。

## 权威顺序（冲突时按此裁决）

1. Rust runtime：`crates/dbx-plugin-runtime/src/plugins/manifest.rs`（manifest/权限/贡献点校验）、`crates/dbx-core/src/query/plugin_data.rs`（queryData 边界）。
2. `plugins/manifest.schema.json`：创作契约，**不是安全边界**（`plugins/README.md:156`）。
3. `plugins/README.md`（平台规范）、`plugins/SIGNING.md`、`plugins/RELEASING.md`。
4. `docs/content/docs/plugin-development.mdx`（逐步教程）。
5. 本技能 `references/` 与 `.agents/rules/`（本仓库沉淀，可能滞后于源码，引用前重核）。

基线：DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（0.6.51），Host API 1.4.0，manifest v1，sidecar protocol v1。行号会漂移，引用前按当前 HEAD 重核。

## 最短可行流程

1. **先读规则**：`.agents/rules/plugin-contract.md`、`data-and-security.md`；做 dbx-report 时再读 `product-scope.md`。
2. **脚手架**：`dbx-plugin create <name> --template frontend|svelte|rust|go --yes`（frontend/svelte 是 UI-only，rust/go 带原生 sidecar）。
3. **写 manifest**：字段与权限按 `references/platform.md`，只申请真实使用的权限；id 发布后不可改。
4. **dev-host 调试**：`dbx-plugin dev --path . --port 5190`（Node 22+）。只覆盖 Host API 1.0 子集，**没有 queryData/saveFile/getTableMetadata**，数据路径必须真机验证。
5. **打包**：`dbx-plugin package .` → `dist/<id>-<version>-<target>.dbxp` + `.artifact.json`（未签名候选）。真机安装需在插件中心开启「Allow unsigned development packages」。
6. **验收**：按 `references/workflow.md` 的真机检查点逐项过；记录环境、命令、脱敏截图、失败分支。
7. **写证据**：任何"已验证"都要带命令、环境、日期；未跑过的保持假设标注。

## 十条硬规则

1. manifest v1 必填 `manifest_version(=1) id name version publisher engines`；根与嵌套对象都 `additionalProperties:false`，未知字段直接拒绝。
2. `publisher` 必填——`plugins/README.md` 的 manifest 示例漏了它，照抄必然失败。
3. `id` 匹配 `^[a-z0-9][a-z0-9._-]*$`、≤128 字符、发布后不可改；`version` 严格 semver。
4. 权限只从 11 个字面量与 `host.network:https://<host>[:port]` 里选；network 只允许 https、无 path、最多 8 个 origin。
5. `host.connections::read`（双冒号）被 schema 与 runtime 同时接受，按契约对待，不要擅自"修正"。
6. 权限 ≠ 授权：`queryData` 每次调用都重校验 (plugin, connection) grant，撤销后返回 `PLUGIN_DATA_ACCESS_NOT_GRANTED`。
7. `queryData` 只有一次只读查询：默认 500 / 最高 5000 行、rows ≤8 MiB、SQL ≤100000 字符、timeout 上限 60 s；**无 cancel、无分页、无参数绑定**。
8. UI 在 opaque-origin 沙箱 iframe：无 Tauri、无父 DOM、无网络、无 Node；`localStorage` 会抛异常，用 `window.dbxPlugin.storage`。
9. `dbx-plugin` 只有 `create|package|dev|keygen|version|help`，**没有 `build`、没有 `validate`**。
10. sidecar（若引入）不是 OS 沙箱：没有宿主 driver/凭据，不能跨插件，stdout 只能走协议，日志写 stderr。

## 参考

- `references/platform.md`：manifest、8 类贡献点、权限、Host API 表、打包/签名、sidecar 协议、兼容策略。
- `references/workflow.md`：完整命令、dev-host 边界、真机检查点、供应链与契约测试命令、footgun 清单、文档陷阱。

上游源码（本机）：`E:\File\self\github\dbx`（只读参考，不要在这里提交本仓库的改动）。
