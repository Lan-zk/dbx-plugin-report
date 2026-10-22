# 对可行性报告的独立评审

> 评审对象：[feasibility-report.md](feasibility-report.md)（基线 DBX b160d130 / 0.6.51）。  
> 评审时间：2026-10-22。本文是**判断**，不是宿主事实；宿主事实看 [host/capabilities.md](../host/capabilities.md)。

## 结论

**边界清晰，开发路径不完整。** 报告是一份合格的“范围裁决”，不是可执行的“开发计划”：它能回答“做不做、做什么、不做什么、什么算失败”，不能回答“第一周做什么、先做哪条竖切、多久、谁做、怎么验收”。

| 维度 | 清晰度 | 判断 |
|---|---|---|
| 能力边界/范围 | 清晰 | 源码级证据 + 三栏（MVP/后续/不做）+ kill criteria，可作评审基线 |
| 产品裁决 | 清晰 | 纯 SQL 作者工具、本机 JSON、AI 只草稿、语义层/自助/共享/自动发布不进首版 |
| 技术路径 | **不清晰** | 缺模块设计、状态机、JSON Schema、渲染抽象、迁移实现 |
| 验证路径 | 方向清晰 | V1–V8 是方案，不是可执行用例；V2–V8 未跑 |
| 交付路径 | **不清晰** | 缺里程碑、依赖、估算、上架/支持矩阵计划 |

## 可信度核对

在 `b160d130` 上抽查 10 处引用，全部与源码一致：

| 引用 | 核对结果 |
|---|---|
| `pluginHostBridge.ts:1101` | `hasPermission` 支持 `host.connections::read` 别名，与报告权限白名单一致 |
| `pluginHostBridge.ts:490` | init 通告 `capabilities`（dataApi/storage/ai/…），缺项即不支持 |
| `pluginHostBridge.ts:862` | `host.queryData` 先 `requirePermission` + `ensureDataAccess`，再限并发，再执行 |
| `pluginAiCompletion.ts:115` | 逐次确认，“本工作台不再询问”只存内存 |
| `queryStore.ts:4141` | workbench 复用键为 plugin + contribution + connection，不含报表 id |
| `ContentArea.vue:1573` | result-view 只传前 500 行快照，`truncated` 仅比较 500 |
| `PluginWorkbenchHost.vue:613` | 连接摘要 `dialect` 实际填 `db_type` |
| `plugin_data.rs:91` | 先校验 grant 再解析连接；行/字节/SQL 长度常量在 `:36–40` |
| `agent_loop.rs:334` | 插件工具只在 agent 模式合并，Ask 模式不加入 |
| `manifest.rs:1068` | `external_tools_excluded` 在无 mcp 声明时返回 false（报告指出的文档/代码差异成立） |

关键限制与独立调研一致：Host API 1.4.0、500/5000 行、8 MiB、100k 字符、60 秒、每 bridge 4 并发、无 bind/cursor/cancel、单表元数据、result-view 500 行、storage 256 KiB/1 MiB/1024 键、saveFile 512 MiB、sidecar 反向仅 `host/requestUserInput`、MCP 最多 1 个且需 backend/opt-in。

**未核实**：报告所称 155 项测试通过（本轮未重跑）；外部竞品文档未逐条复核；商店审核/签名流程耗时未验证（H7）。

## 可信的原因

1. 边界由宿主硬限制反推，不是竞品功能清单推导。
2. 把宿主没有的能力写成“降级/否决 + 复议条件（需新增 Host API）”，而不是假装存在。
3. 文档与代码差异标成 H 待验证（MCP external 默认、data API 建池、storage web 差异）。
4. 三栏 + kill criteria + V1–V8，能防止“下一小步”偷渡范围。

## 路径缺口（按阻塞程度）

1. **没有第一切片和里程碑。** MVP 仍是组合包（SQLite+PostgreSQL、≤4 卡看板、CSV、AI 草稿、版本化资产）。按报告自己“做透不做大”的标准，首个竖切应只做：单文档、单数据集、一条固定 SQL、一种图、SQLite、JSON 保存/重开。
2. **最高风险仍是 H1/H2/H3 未实测。** UI-only 沙箱能否稳定完成“查询→图表→保存→重开”、两库正确性、Agent 组合都未验证；V2–V8 全未跑。没有 walking skeleton，路径只是验收愿望。
3. **没有技术设计。** 模块划分、状态机（draft/confirmed/stale）、错误模型、刷新/并发队列、图表渲染抽象、JSON Schema（只有字段表）、格式迁移实现都缺。
4. **没评估 dev-host。** `plugins/sdk/dev-host` 明确是 Host API 1.0 subset，不模拟 queryData/result-view/connection actions/组件库；能加速 UI/工作台/存储迭代，撑不起数据闭环。报告未提“是否给 dev-host 加 queryData mock”这个效率决策。
5. **验收不可执行。** V1–V8 是方案；155 项测试只覆盖宿主契约。V3/V4/V6 需落成黄金 SQL、40+20 AI 任务集、round-trip/取消保存测试，并指定负责人/时间。
6. **5 项决策未拍板 + 无估算/发布计划。** 见 [product/decisions.md](../product/decisions.md)；商店签名/审核/依赖 SPDX/支持矩阵成本未进计划。
7. **工程遗漏。** 主题/i18n/a11y、图表库选型与许可证、decimal/大整数 JSON 序列化约定、多 tab/多窗口同文档冲突策略、浏览器端文件/存储差异 UX、错误码/日志/遥测、冷启动/包体积预算、指标字段漂移失效提示。

## 分歧与建议

- **MVP 再砍一半**：看板、AI、PostgreSQL、CSV 后置；首发只证明“报表可重复打开”。（已体现在 [roadmap](../development/roadmap.md)）
- **AI 不进首发门槛**：V4 的 40+20 任务集与 ≥95%/≥90% 阈值成本高；先做 M3 实验特性，不阻塞手工闭环。
- **图表库先定一个**（ECharts 或轻量 SVG），在 M0 实测 CSP/包体积/许可，不先绑 Vega-Lite。
- **bind/cancel/分页/资产 API 作为宿主路线图输入**，不要只写成插件侧降级；否则下一代仍做不了真 BI。
- **MCP/Agent 结论保留**：声明 mcp ≠ 工具可用；sidecar 不能复用宿主连接；native Agent + 插件工具条件可行但未实装。这点比其他分析冷静。

## 判定与下一步

**现在适合立项评审/决定做不做，不适合直接开工。** 下一步按 [development/first-slice.md](../development/first-slice.md) 做 M0 walking skeleton：1–3 天，最小 `.dbxp` + 原生图表 + `queryData` + `saveFile`，真实 DBX 跑“打开→选连接→执行→渲染→另存 JSON→重开”，产出 go/no-go 记录。
