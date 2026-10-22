# 证据索引（E01–E15）

> 基线：DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（0.6.51）。  
> 路径均相对 DBX 仓库根；从本文件出发的链接写作 `../../../dbx/<path>#Lxx`，指向本机 sibling checkout `E:\File\self\github\dbx`。  
> 行号会漂移；引用前按当前 HEAD 重核。完整证据描述与范围见 [feasibility-report.md](feasibility-report.md) 第 8 节附录 A。

| ID | 证据入口 | 证明内容 |
|---|---|---|
| E01 | [manifest.rs:7](../../../dbx/crates/dbx-plugin-runtime/src/plugins/manifest.rs#L7)、[manifest.schema.json:28](../../../dbx/plugins/manifest.schema.json#L28)、[bridge:1101](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L1101) | API/protocol/manifest 版本、权限白名单、网络 origin、双冒号别名 |
| E02 | [plugin_data.rs:32](../../../dbx/crates/dbx-core/src/query/plugin_data.rs#L32)、[bridge:862](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L862) | 查询 DTO 无 bind/cursor/cancel；grant、读门、支持 SQL、行/字节、并发 |
| E03 | [plugin_metadata.rs:23](../../../dbx/crates/dbx-core/src/schema/plugin_metadata.rs#L23)、[schema 契约测试:73](../../../dbx/packages/app-tests/pluginSchemaMetadataHostApi.test.ts#L73) | 单表列 DTO、目标池要求、unknown 能力 |
| E04 | [bridge:490](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L490)、[queryStore:4141](../../../dbx/apps/desktop/src/stores/queryStore.ts#L4141)、[commandRegistry:35](../../../dbx/apps/desktop/src/lib/plugins/pluginCommandRegistry.ts#L35)、[floating:474](../../../dbx/apps/desktop/src/lib/plugins/pluginFloatingWindow.ts#L474) | capabilities、tab 复用、dock 命令、浮窗贡献级复用 |
| E05 | [ContentArea.vue:1573](../../../dbx/apps/desktop/src/components/layout/ContentArea.vue#L1573)、[pluginData.ts:3](../../../dbx/apps/desktop/src/lib/plugins/pluginData.ts#L3) | result-view 500 行、SQL/schema、snapshot 2 MiB；truncated 未表达上游完整性 |
| E06 | [pluginAiCompletion.ts:90](../../../dbx/apps/desktop/src/lib/plugins/pluginAiCompletion.ts#L90)、[bridge:652](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L652)、[aiPluginConversation:27](../../../dbx/apps/desktop/src/lib/ai/aiPluginConversation.ts#L27) | completion 文本/限额/同意记忆、Ask/Agent 分支、对话不回传 |
| E07 | [plugin_tools.rs:270](../../../dbx/crates/dbx-core/src/ai/plugin_tools.rs#L270)、[agent_loop.rs:334](../../../dbx/crates/dbx-core/src/ai/agent_loop.rs#L334)、[runtime.rs:774](../../../dbx/crates/dbx-plugin-runtime/src/plugins/runtime.rs#L774) | 插件工具 opt-in、Agent 合并、非只读审批、sidecar 反向 API |
| E07b | [manifest.rs:1068](../../../dbx/crates/dbx-plugin-runtime/src/plugins/manifest.rs#L1068)、[mcp backend:957](../../../dbx/crates/dbx-mcp/src/backend.rs#L957)、[mcp plugin_tools:158](../../../dbx/crates/dbx-mcp/src/plugin_tools.rs#L158) | 外部 MCP 缺声明探测、连接归属、connection-less 与 scope |
| E08 | [plugin_storage.rs:24](../../../dbx/src-tauri/src/commands/plugin_storage.rs#L24)、[WorkbenchHost:282](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L282)、[cloud_sync.rs:675](../../../dbx/crates/dbx-core/src/persistence/cloud_sync.rs#L675) | native 配额、原子单次写、非 CAS、web 差异、加密同步 |
| E09 | [bridge:882](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L882)、[WorkbenchHost:734](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L734) | 文件保存、512 MiB 字节 cap、保存对话框/取消、web 下载 |
| E10 | [WorkbenchHost:613](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L613)、[bridge:820](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L820) | 连接摘要脱敏、dialect 实际 db_type、元数据/plan 适配 |
| E11 | [sql_risk.rs:602](../../../dbx/crates/dbx-sql-core/src/sql_risk.rs#L602)、[query_execution_sql.rs:324](../../../dbx/crates/dbx-sql-core/src/query_execution_sql.rs#L324)、[query/mod.rs:1924](../../../dbx/crates/dbx-core/src/query/mod.rs#L1924)、[connection/mod.rs:2776](../../../dbx/crates/dbx-core/src/connection/mod.rs#L2776) | 方言/有限副作用黑名单/fallback、非 SQL 排除、字节非峰值、取消、目标池/timeout |
| E12 | [WorkbenchHost:920](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L920)、[bridge:1124](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L1124)、[runtime.rs:1133](../../../dbx/crates/dbx-plugin-runtime/src/plugins/runtime.rs#L1133) | iframe opaque sandbox、CSP/网络/eval、原生 sidecar 进程信任 |
| E13 | [installer.rs:875](../../../dbx/crates/dbx-plugin-runtime/src/plugins/installer.rs#L875)、[marketplace.rs:594](../../../dbx/crates/dbx-plugin-runtime/src/plugins/marketplace.rs#L594)、[marketplace.schema.json:83](../../../dbx/plugins/marketplace.schema.json#L83) | 哈希、Ed25519、catalog 权限一致；license 可选字符串，未等同 SPDX 合规 |
| E14 | [pluginPlanHostApi.test.ts:88](../../../dbx/packages/app-tests/pluginPlanHostApi.test.ts#L88)、[bridge tests:1562](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.spec.ts#L1562)、[plugin_data.rs:392](../../../dbx/crates/dbx-core/src/query/plugin_data.rs#L392) | 前端契约与 mock 行为；已有 SQLite 集成测试，报告未跑 Rust |
| E15 | [plugins/README.md:375](../../../dbx/plugins/README.md#L375)、[plugin_tools.rs:7](../../../dbx/crates/dbx-core/src/ai/plugin_tools.rs#L7) | 文档/注释差异的原文位置 |

## 外部一手来源

报告附录 B 列了 X1–X14（dbt MetricFlow、Cube、Vega-Lite、PostgreSQL/MySQL/SQLite 方言、WHATWG iframe sandbox、W3C CSP、OWASP ASVS、SPDX）。它们是**外部规范/竞品证据**，不是 DBX 能力证明；使用前按报告给出的固定版本/commit 复核。

## 竞品快照

报告附录 C 固定了两个竞品 commit：

- Evidence `497ade4b7c3b49c8c891c38909b447a30e579025`：查询与呈现分离、YAML 指标、人机同源。
- Metabase `49b6b75d3fbb5c92cdd89774cfa1c570187fd2bf`：报表/看板分离、显式过滤映射。

只借鉴产品结构，不移植编译器、权限、订阅或参数引擎；不作为“宿主应具备”的需求来源。

## 使用规则

1. 引用证据时写“基线 + 路径 + 行号”，并注明是否已按当前 HEAD 重核。
2. 行号不一致时以代码语义为准，更新本索引而不是删掉证据。
3. 新结论如果没有 E/X 证据，标记 H，并写验证方案；不要升级成 F。
