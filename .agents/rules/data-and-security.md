# 数据路径与安全规则

来源：`docs/host/capabilities.md`、`docs/host/limits.md`、`docs/development/architecture.md`、`docs/operations/release-and-security.md`、`docs/testing/test-strategy.md`。数值均为 F（宿主合同），行为约束为 I。

## 1. queryData 合同（F）

请求：`{ connectionId, database?, schema?, sql, maxRows?, timeoutMs? }`；响应：`{ dbType, columns:{name,dataType?}[], rows:unknown[][], truncated, elapsedMs }`（`docs/host/capabilities.md:62-73`、`crates/dbx-core/src/query/plugin_data.rs`）。

| 限制 | 数值/规则 | 后果 |
|---|---|---|
| 连接 | 一次一个 `connectionId`，必须已打开 | 不能跨连接 JOIN；不能替用户自动连接 |
| 语句 | 一条，被分类器判为只读 | 不能多语句/临时表/写；SELECT 也可能有副作用 |
| 返回行 | 默认 500，最高 5000 | 明细无法全量展示；大表靠数据库聚合 |
| 结果字节 | 序列化 rows 累计 **8 MiB** | 宽列/大 cell 提前截断 |
| SQL 长度 | **100000 字符** | 正常报表不会触及 |
| 超时 | 执行 timeout 配置上限 **60 s**，非端到端 deadline | 慢查询排队/超时；关窗不取消服务端 |
| 并发 | 每 bridge **4 个** data query | 插件内队列 ≤2；最多 4 卡；显式排队状态 |
| 取消 | 无 `cancel`/`executionId` | "停止"只丢弃旧响应并停调度，不能声称数据库已停 |
| 分页 | 无 cursor | 不做分页明细/全量导出 |
| 参数绑定 | 无 bind | SQL 只能字符串内嵌；首版不支持参数 |
| 只读判定 | 分类器可能 fallback；函数黑名单有限 | 只读不是无副作用证明；必须配只读账号 |

- 授权：`host.data:read` + 每（插件, 连接）用户授权；首次查询弹宿主对话框点名插件与连接；拒绝记在本 workbench 会话；每次查询后端重校验；撤销返回 `PLUGIN_DATA_ACCESS_NOT_GRANTED: …`。
- **禁止**用 `LIMIT` 分批绕 5000 行上限；`truncated=true` 不提供总行数或原因（`capabilities.md:82`）。
- 插件并发上限：文档内查询队列 2；同一 dataset 新请求 generation+1 并丢弃旧响应；看板顺序队列 ≤2；排队中显示"排队中"，禁止隐式定时刷新（`architecture.md:89-93`）。

## 2. 元数据（F）

- `getTableMetadata` 只能按**已知表**取列：不能枚举表/库/schema，不能发现主外键/关系 → 不做自动建模（`docs/host/limits.md:24-29`）。
- 要求连接已打开且已有 metadata pool（不会为插件隐式建池）→ 失败要明确提示。
- 列只有 `name/dataType/nullable/length/precision/scale/default`；没有业务含义/单位/时间口径；`unknown` 就展示"未知"，不猜。

## 3. 资产、文件与存储（F）

- workbench 复用键含 connection、**不含报表 id** → 文档 id 与 tab id 分离，一次只编辑一个文档。
- `result-view` 快照 500 行、2 MiB，只是"创建草稿"入口；保存前必须用 `queryData` 重新验证。
- 浮窗：同插件+workbench 只有**一个**窗口，不是每份报表一个；首版不做 dock。
- `host.storage`：**256 KiB/值、1 MiB 总量、1024 键、无 CAS**；不是资产库，只存偏好/有限草稿。
- `saveFile`：单次 ≤512 MiB，每次弹对话框，取消返回 `null`，**无读取回 API**；web 端是下载。
- 无资产 API、无版本事务、无调度/通知 API。
- 打开文档大小 ≤5 MiB、JSON 深度 ≤64、单字段字符串 ≤1 MiB；严格 `JSON.parse` + schema 校验；拒绝 `__proto__`/原型污染构造。

## 4. 结果展示与导出

- 结果只与 `(connectionId, queryHash, generation)` 绑定；错代响应不得写入状态（`architecture.md:77-85`）。
- `truncated=true`：可标"样本/已截断"、可预览；**不可**计算"总计/占比"并宣称完整，不可导出全量。
- 每张卡显示独立取数时间；部分失败标"部分成功"，不用单一"数据截至"时间（产品不变量 7）。
- CSV 导出：带时间/查询版本/范围；对 `=`、`+`、`-`、`@` 开头单元格做公式注入转义；UTF-8/BOM 正确；只导出当前已验证结果。
- 精度：decimal 用字符串/定点传输，禁止 JS number 精度丢失后显示"精确"。

## 5. AI（F + 约束）

- 能力：`ai.generateText` prompt ≤100000 字符、返回 ≤16000 字符、`maxTokens=2048`、无工具、同 workbench 单飞、逐次确认（"不再询问"仅内存）；AI 对话不回传内容。
- 定位：只能生成单报表候选 JSON，不能当 Agent 执行器/大看板生成器；候选经 schema/字段/版本/语法检查 → UI 审阅 → 用户点"预览"才执行 `queryData` → 用户点"保存"才落盘。
- 默认不发送业务行；只发送连接类型、字段名/类型、目标描述；发送前逐次告知；拒绝不影响手工流程。
- 不自动发布、不自动查未授权连接、不自动扩大权限（ADR-03 暂定，V4 未达标则移除 AI 承诺）。
- 不把模型输出拼进 HTML/SQL；不信任模型给的字段/版本/引用。

## 6. MCP / Agent（后续，不属首版）

- mcp contribution 最多 1 个、需 backend + 用户 opt-in；MVP **不声明**。
- 内置 Agent 只在 agent 模式合并插件工具，Ask 模式不调用，非只读工具逐次审批；外部 MCP 的 `external_tools` 三态未验证（H）。

## 7. 错误模型（I，`architecture.md:95-115`）

- 统一 `AppError { code, message, detail?, retryable }`；文案分"用户可修复 / 需管理员 / 需升级宿主"。
- code：`HOST_API_UNSUPPORTED`、`PLUGIN_PERMISSION_DENIED`、`DATA_ACCESS_NOT_GRANTED`、`CONNECTION_NOT_OPEN`、`CONNECTION_UNSUPPORTED`、`SQL_REJECTED`、`QUERY_TIMEOUT`、`QUERY_TRUNCATED`、`RESULT_TOO_LARGE`、`SCHEMA_MISMATCH`、`FORMAT_VERSION_UNSUPPORTED`、`SAVE_CANCELLED`、`STORAGE_QUOTA`、`AI_UNAVAILABLE`/`AI_REFUSED`。
- 错误里可带 code/耗时/行数/截断标记；**不得**带 SQL 字面量、结果值、连接串、token。

## 8. 代码必须强制的 9 条不变量（`architecture.md:77-85`）

1. 没有 `host.data:read` + grant，不发起查询；拒绝后不重试轰炸。
2. 查询结果只与 `(connectionId, queryHash, generation)` 绑定；错代响应不得写入状态。
3. `truncated=true` 可预览/标样本，不可计算总计并宣称完整，不可导出全量。
4. 保存前必须通过 schema 校验；未知 `formatVersion` major 只读/拒绝，不静默迁移。
5. 文档中不出现凭据、密码、token、完整连接配置；只写连接别名与脱敏元数据。
6. 报表/看板只引用存在的 datasetVersion；删除被引用对象必须显式确认。
7. AI 候选未通过 schema/字段校验不得进入预览；未人工确认不得保存。
8. 看板刷新无跨查询事务；UI 必须逐卡显示时间，不能给单一"数据截至"时间。
9. 看板 `layout` 只存 12 列网格坐标：加载校验边界、不重叠、与 `reportRefs` 一一对应；不存像素坐标与渲染结果。

## 9. 安全不变量（`release-and-security.md:80-84`）

- 不发起任何网络请求：无 CDN、无遥测、无远程字体/图标，不申请 `host.network`。
- 不读任意文件路径；文件内容一律不可信（大小/深度/字段数/原型键）。
- 不持有、不复制连接凭据；不绕过 `host.data:read` 授权；不直接连数据库。
- AI 默认不发业务行，发送前告知；拒绝不影响手工流程。
- 所有用户/AI 字符串按不可信处理：不拼接 HTML（禁 `v-html`）、不拼接 SQL。

## 10. 威胁面（T1–T12 摘要，`release-and-security.md:65-76`）

文档/AI 注入脚本或 HTML（严格 schema、Vue 转义、禁 `v-html`、图表白名单）；图表配置外发（无网络权限、禁远程 URL）；绕过只读分类做写（只读账号 + 固定 SQL + 宿主分类器兜底）；SQL 注入（首版无参数）；截断当完整（强制徽标、禁全量导出）；AI 泄露业务行（默认不发 rows）；日志/错误泄露（只记 code/耗时/行数）；CSV 公式注入；恶意文档（5 MiB/深度 64/键白名单/拒 `__proto__`）；供应链仿冒（签名/校验和/官方目录/依赖审计）；权限过度申请；多窗口覆盖/静默丢失（显式保存、revision 提示、不自动保存）。

## 11. 禁止复述的错误说法（`docs/host/limits.md:55-62`）

1. "5000 行限制让大表聚合不可行"——错：限制返回行，数据库仍可扫描/聚合千万行。
2. "60 秒是端到端 deadline"——错：是执行 timeout 配置上限。
3. "8 MiB 是内存峰值"——错：是序列化 rows 的累计上限。
4. "只读分类通过就没有副作用"——错：函数、UDF、方言差异都可能产生副作用。
5. "列连接摘要=已授权查询"——错：`connections:read` 只给脱敏摘要，查询另需 `data:read` + grant。
6. "有 workbench 就有报表系统"——错：窗口 ≠ 资产。
7. "支持 90+ 数据库=统一 BI 方言"——错：SQL 语义/标识符/日期/数字行为差异大。

## 12. 需要新增 Host API 才能做的（进后续，`docs/host/limits.md:64-75`）

SQL 绑定参数、查询取消、分页/游标、表/对象枚举与主外键、BI 资产存储/版本/发布 API、调度/订阅/通知、团队 ACL/分享/审计、打印/PDF 排版。这些只能作为宿主路线图输入正式提出；插件侧降级或拒绝，不伪装支持。
