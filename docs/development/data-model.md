# 文档数据模型 v0.1（草案）

> 状态：设计草案（I），未实现；M1 结束前冻结 v0.1。
> 修订（2026-10-22）：字段传输契约、报表口径 basis、视图限制/合计、看板过滤器定义、运行态边界；依据 [analysis/reference-pitfalls.md](../analysis/reference-pitfalls.md) P6/P10/P11/P13。v0.0 未发布，无迁移包袱，直接改为 v0.1。
> 原则：**不存结果数据、不存凭据、SQL 为计算真相、口径可追溯、未知字段不猜测。**

## 1. 顶层结构

```json
{
  "formatVersion": "0.1",
  "documentId": "01J...ULID",
  "revision": 3,
  "savedAt": "2026-10-22T14:00:00+08:00",
  "timezone": "Asia/Shanghai",
  "sourceAliases": [
    { "id": "src-sales", "label": "销售库（只读）", "dbType": "postgresql", "database": "sales", "schema": "public" }
  ],
  "datasets": [],
  "metrics": [],
  "dimensions": [],
  "reports": [],
  "dashboards": []
}
```

| 字段 | 规则 |
|---|---|
| `formatVersion` | `major.minor`；本版 `0.1`。读：同 major 接受、更高 major 拒绝；写：固定当前版本。 |
| `documentId` | 稳定 ID（ULID/UUID）；重开/另存**不变**。两个文件同 id = 同一文档的两个副本，打开时提示可能分叉。 |
| `revision` | 每次保存 +1；用于提示覆盖冲突，不作为并发锁。 |
| `savedAt` | 保存时间，ISO 8601 带时区；仅展示，不参与口径。 |
| `timezone` | 报表时区（IANA，如 `Asia/Shanghai`）；首次保存时取本机时区写死；只影响显示与时间过滤解释，不改变 SQL 与结果值。 |
| `sourceAliases` | 逻辑连接别名，**不含连接 id、主机、账号、密码**；打开时由用户显式绑定本机连接。 |
| `datasets/metrics/dimensions/reports/dashboards` | 见下；所有引用必须存在，ID 全局唯一。 |

## 2. 数据集 Dataset

```json
{
  "id": "ds-sales-monthly",
  "name": "月度销售额",
  "version": {
    "queryHash": "sha256:…",
    "fieldsHash": "sha256:…",
    "confirmedAt": "2026-10-22T14:00:00+08:00"
  },
  "query": {
    "sourceAliasId": "src-sales",
    "sql": "SELECT date_trunc('month', paid_at) AS month, sum(amount) AS revenue FROM orders WHERE status='paid' GROUP BY 1 ORDER BY 1",
    "maxRows": 500,
    "timeoutMs": 30000,
    "dialectProfile": "postgresql@1"
  },
  "rowGrain": "month",
  "fields": [
    { "name": "month", "transport": "date_string", "nullable": false },
    { "name": "revenue", "transport": "decimal_string", "nullable": true, "precision": 18, "scale": 2 }
  ],
  "metricIds": ["m-revenue"],
  "dimensionIds": ["d-month"]
}
```

规则：

- `sql` 必须是**单条只读语句**、无参数占位、无多语句；插件只做预检，最终由宿主分类器裁决。
- `fields` 是**作者确认的输出契约**：`transport` 描述值经 JSON 到达前端后的形态，是渲染/格式化的唯一依据；缺省为 `unknown`（首次确认时必须选择，否则只能按原样显示）。
- `transport` 枚举：`number` / `decimal_string` / `integer_string` / `date_string` / `timestamp_string` / `boolean` / `unknown`。声明 `number` 时若观测到绝对值 > `9007199254740991` 或 `scale>15`，UI 显示精度风险提示，不擅自转字符串。
- `version.queryHash` 覆盖 `sql + maxRows + timeoutMs + dialectProfile + sourceAliasId`；`fieldsHash` 覆盖有序字段的 `{name,transport,nullable,precision?,scale?}`。任一变化即新版本。
- `maxRows` 1–5000；默认 500；超 2000 时 UI 警告（8 MiB 与渲染风险）；实际截断以宿主响应 `truncated` 为准。
- 不保存结果 rows、列统计、预览快照。

## 3. 指标 Metric

```json
{
  "id": "m-revenue",
  "datasetId": "ds-sales-monthly",
  "outputColumn": "revenue",
  "label": "销售额",
  "definition": "已支付订单金额之和；不含退款",
  "unit": "currency",
  "currency": "CNY",
  "additivity": "additive",
  "nullPolicy": "treat_as_zero",
  "timeGrain": "month",
  "timezone": "Asia/Shanghai",
  "format": { "decimals": 2, "grouping": true, "unitSuffix": "tenThousand", "percent": false }
}
```

- `additivity`：`additive` / `semi_additive` / `non_additive`（如比率、去重计数）/ `ratio`。
- `nullPolicy`：`treat_as_zero` / `exclude` / `preserve`；只影响解释与展示，不生成 SQL。
- `format`：显示规格（`decimals` 0–6、`grouping`、`unitSuffix` ∈ `none|thousand|tenThousand|million|hundredMillion|billion`、`percent`）；**只用于渲染**，CSV/复制/资产一律存原始值。
- 指标不生成 SQL、不推导聚合、不做跨数据集运算；`definition` 是人读口径。
- **非可加指标禁止跨卡求和/汇总**；UI 只展示作者确认的聚合值。

## 4. 维度 Dimension

```json
{
  "id": "d-month",
  "datasetId": "ds-sales-monthly",
  "outputColumn": "month",
  "label": "月份",
  "type": "time",
  "timeGrain": "month",
  "timezone": "Asia/Shanghai",
  "format": { "datePattern": "yyyy-MM" }
}
```

- `type`：`time` / `category` / `ordinal`；时间维度必须写 `timeGrain` 与 `timezone`。
- 字符串维度不臆造层级（无自动上卷/下钻）；`timeGrain` 只用于标注与校验，不生成 SQL。
- `format.datePattern` 可选；未指定时按报表时区用 `Intl.DateTimeFormat` 的等效格式，不做值的时区换算。

## 5. 报表 Report

```json
{
  "id": "r-monthly-revenue",
  "title": "月度销售额",
  "datasetId": "ds-sales-monthly",
  "basis": {
    "queryHash": "sha256:…",
    "fieldsHash": "sha256:…",
    "confirmedAt": "2026-10-22T14:00:00+08:00"
  },
  "viewSpec": {
    "type": "bar",
    "x": { "dimensionId": "d-month" },
    "y": [{ "metricId": "m-revenue" }],
    "limit": { "mode": "all" },
    "totals": { "mode": "none" },
    "sort": { "by": "x", "direction": "asc" },
    "allowedControls": { "filter": false, "sort": true }
  },
  "notes": "口径见指标定义；数据为月末快照"
}
```

- `viewSpec.type`：`table` / `bar` / `line` / `number`（M1 支持 table/bar；line/number 后置）。
- `basis` 是报表确认时的数据集口径指纹：运行时与 `dataset.version` 的 `queryHash`/`fieldsHash` 比较，不一致 → 报表 `stale`（可查看旧配置，但必须重新确认后才能作为“已确认报表”使用）；`confirmedAt` 只展示口径确认时间，不参与比对。
- `limit`：`{mode:"all"}` 或 `{mode:"top_n", n:5..50, byMetricId}`。`top_n` 只做**展示截断**，标注 `显示前 n 类（共 M 类，M 由 SQL 行数得出；truncated 时不给 M）`；**不做“其他”桶**（要在 SQL 里 `CASE`）。
- `totals`：`{mode:"none"}` 或 `{mode:"sql_marker", marker:{column,value}}`。`sql_marker` 要求结果中恰有一行满足 `row[column]===value`；找不到就显示 `未找到合计行` 并禁止合计展示，**前端绝不求和**。
- `y` 最多 4 个指标；多序列按固定调色板顺序着色，不随筛选变化；图例 >8 项折叠。
- `allowedControls`：作者预设读者可用的交互（`filter`/`sort`）；缺省 `{filter:false,sort:true}`。过滤只能作用于已取回行（见 §14）。
- 字段引用只能指向该 dataset 的已确认字段/指标/维度；不存在的引用 = 校验失败。
- 报表不保存数据，只保存“怎么查、怎么显示、口径说明”；不保存格式化后的值。
- `provenance`（可选，M3）：`{aiAssisted:boolean, appliedAt?, candidateHash?}`；不存 prompt 正文或结果内容。

## 6. 看板 Dashboard

```json
{
  "id": "dash-overview",
  "title": "销售概览",
  "onOpenRefresh": false,
  "reportRefs": [
    { "reportId": "r-monthly-revenue" },
    { "reportId": "r-top-products" }
  ],
  "layout": [
    { "reportId": "r-monthly-revenue", "x": 0, "y": 0, "w": 6, "h": 4 },
    { "reportId": "r-top-products", "x": 6, "y": 0, "w": 6, "h": 4 }
  ],
  "filters": [
    {
      "id": "f-month",
      "label": "月份",
      "type": "category",
      "source": { "datasetId": "ds-sales-monthly", "field": "month" },
      "required": false,
      "defaultValue": [],
      "options": "from_result"
    }
  ],
  "filterMappings": [
    { "filterId": "f-month", "reportId": "r-monthly-revenue", "targetField": "month" }
  ]
}
```

- `reportRefs` 最多 **20**（UI 建议 ≤12；超过拒绝加载并提示拆分看板）；同一连接（`sourceAliasId` 相同）才允许组合。
- `layout` 是 **12 列网格**坐标（单位是格，不是像素）：列宽由容器宽度自适应，行高/gap 是 UI 常量，不写入资产。
- 约束：`x≥0, y≥0, w≥2, h≥3, x+w≤12`；`layout` 项与 `reportRefs` **一一对应**；**禁止重叠**；允许空白格，不自动压成密集网格。校验失败拒绝打开并给出冲突坐标。
- 编辑入口等价：拖拽/缩放与表单、键盘写同一模型；像素坐标不进入资产。布局只影响呈现，**任何布局变化不触发取数**。
- `filters`：过滤器**完整定义**（类型/来源/必填/默认值/选项来源）；`type` ∈ `category|number_range|time_range`；`source` 必须指向同文档内已确认 dataset 的输出字段；`required=true` 时未选值不默认全选，卡片显示“未应用筛选”；`options` ∈ `from_result|literal`（`literal` 时提供 `literals:string[]`；`from_result` 从已取回结果去重生成并标“仅来自样本”）；`defaultValue` 只能取候选值。
- `filterMappings`：作者显式确认的映射（同一 dataset + 同名字段可建议，但**不自动落盘**）；未映射的卡显示“不受筛选影响”角标；运行期筛选状态不入资产。
- 首版不做联动/钻取/跳转/跨看板继承；筛选只作用于各卡**已取回结果**。
- 看板不保存查询结果；每次打开/刷新重新取数。
- `onOpenRefresh`：默认 `false`；为 `true` 时打开看板自动刷新可见卡（仍受队列 ≤2 与逐卡状态约束）；写入资产并参与校验。

## 7. 身份、保存与草稿

- 所有实体 ID：小写 slug，文档内唯一，创建后不变；展示名可改。
- `documentId` 与文件路径解耦；宿主 `saveFile` 不返回路径，因此**不记录“当前文件路径”**，只记录最近保存的文件名与时间（偏好，不是资产）。
- 保存 = 另存为（每次弹框、取消返回 `null`）；取消不改变 `savedAt/revision`，文档保持 dirty；不存在“写回原文件”。
- 另存为不改变 `documentId`；打开时若检测到同 `documentId` 已在其它 tab 打开，提示“同一文档的另一个副本已打开，继续编辑会产生分叉”。
- 草稿：`host.storage` 键 `draft:{documentId}`，内容为本会话未保存文档快照（UTF-8 压缩后 ≤200 KiB，超限不写并提示），节流 3 秒；只用于恢复，**恢复是显式操作**，恢复后仍为 dirty；保存成功后删除草稿。
- 无版本历史、无 `.bak` 文件；需要对照/回退时由用户保存副本。
- 内容 hash（可选）：对规范化 JSON（去 `savedAt/revision`）计算 SHA-256，用于冲突提示；不用于安全签名。

## 8. 校验规则（加载时全部执行）

1. `formatVersion` major 支持；未知字段保留但忽略（写回时保留，避免破坏未来字段）。
2. 所有 ID 唯一且非空；`sourceAliases` 至少 1 个（除非纯草稿）。
3. 引用完整性：dataset.sourceAliasId 存在；metric/dimension.datasetId 存在；report.datasetId 存在；dashboard.reportRefs 存在且 ≤20；dashboard.layout 与 reportRefs 一一对应，网格边界（`x+w≤12`、最小 2×3）合法且无重叠；filterMappings 的 filterId/reportId/targetField 均存在；`filters[].options` 与 `literals` 一致（`literal` 时 `literals` 非空，`from_result` 时不得出现 `literals`）。
4. 报表 `basis` 与 dataset.version 不一致 → **不是校验失败**，而是加载为 `stale`，提示重新确认；引用不存在的字段/指标/维度才是失败。
5. SQL：非空、无参数占位、单语句、长度 ≤100000；不做“只读”最终裁决。
6. `maxRows` 1–5000；`timeoutMs` 0–60000。
7. 字段契约：`transport` 合法；report 引用的 outputColumn 必须在 dataset.fields 中；`number` 与 `decimal_string` 等类型不兼容时拒绝。
8. 禁止键：`password`、`token`、`secret`、`connectionId`（作为持久化字段）等出现即拒绝/剥离；`__proto__` 等原型污染键拒绝。
9. 文件大小 ≤5 MiB；JSON 深度 ≤64；字符串长度上限（单字段 ≤1 MiB）。

## 9. 指标词典规则（防口径错误）

| 场景 | 规则 |
|---|---|
| 比率/率值 | 标 `non_additive`/`ratio`；禁止跨卡求和；展示分母说明 |
| 去重计数 | 标 `non_additive`；禁止把多卡数相加 |
| 合计 | 只能由 SQL 输出标记行（`totals.sql_marker`）；前端不求和、不计平均 |
| 占比 | 只能由 SQL 输出比例列；前端不计算 |
| 货币 | 必须写 currency；跨币种不自动换算（首版不做） |
| 时间 | 必须写 grain/timezone；夏令时/跨时区在数据侧处理，前端不猜、不换算 |
| NULL | 明示 policy；不默认把 NULL 当 0；`NaN/Infinity` → 显示 `—` 并记录 |
| 精度 | decimal/bigint 用字符串/定点传输，禁止 JS number 精度丢失后显示“精确” |
| 口径变更 | 只能改 dataset（生成新 queryHash/fieldsHash）；旧报表 basis 不匹配 → stale，不静默指向新口径 |

## 10. 字段漂移

- SQL/字段变更 → dataset.version 新 `queryHash`/`fieldsHash`；报表 basis 不匹配 → `stale`，不能静默指向新版本。
- 打开时运行查询后比对：列名集合、`transport` 兼容性、列顺序变化（顺序变化记录但不报错）、重复列名（拒绝并要求 SQL 用 `AS` 起唯一别名，不自动加后缀）。
- 漂移时：报表 `stale`，显示 `字段契约与本次查询结果不一致（缺少 revenue；类型从 integer_string 变为 decimal_string）`，提供 `更新字段契约（需重新确认口径）` / `回滚 SQL`；不自动更新。
- 删除/重命名输出列：列出受影响报表；提供“重新映射”人工操作，不猜。
- 不保存旧结果用于“对照”；对照用独立查询在 DBX 中做。

## 11. 版本迁移

- `formatVersion` 用 `major.minor`；minor 只加可选字段；major 才允许改语义。
- 迁移函数按版本链式执行；每个迁移有测试夹具（旧 JSON → 新 JSON → 校验）。v0.0 未发布，直接从 0.1 开始；若出现 v0.0 草稿，按“无 sourceAliases/无 transport”的显式迁移处理。
- 未知 major：只读展示关键元信息，禁止保存覆盖。
- 迁移不可逆时保留副本（通过另存实现，不覆盖原文件）。

## 12. 示例（最小可打开文档）

```json
{
  "formatVersion": "0.1",
  "documentId": "doc-demo-001",
  "revision": 1,
  "savedAt": "2026-10-22T14:00:00+08:00",
  "timezone": "Asia/Shanghai",
  "sourceAliases": [{ "id": "src-1", "label": "本地 SQLite", "dbType": "sqlite" }],
  "datasets": [{
    "id": "ds-1",
    "name": "示例",
    "version": { "queryHash": "sha256:pending", "fieldsHash": "sha256:pending", "confirmedAt": "2026-10-22T14:00:00+08:00" },
    "query": { "sourceAliasId": "src-1", "sql": "SELECT 1 AS k, 'ok' AS v", "maxRows": 500 },
    "rowGrain": "row",
    "fields": [
      { "name": "k", "transport": "integer_string", "nullable": false },
      { "name": "v", "transport": "unknown", "nullable": true }
    ],
    "metricIds": [],
    "dimensionIds": []
  }],
  "metrics": [],
  "dimensions": [],
  "reports": [{
    "id": "r-1",
    "title": "示例报表",
    "datasetId": "ds-1",
    "basis": { "queryHash": "sha256:pending", "fieldsHash": "sha256:pending", "confirmedAt": "2026-10-22T00:00:00+08:00" },
    "viewSpec": { "type": "table", "columns": ["k", "v"], "limit": { "mode": "all" }, "totals": { "mode": "none" } }
  }],
  "dashboards": []
}
```

## 13. 待定问题

- 指标 vs 维度的边界（时间列是否可同时是维度/指标）——按“字段角色”显式声明，不靠类型猜。
- 多数据集看板是否永远禁止；当前只允许同连接多数据集，但 M2 先单数据集。
- 时间过滤的类型/粒度匹配规则（`time_range` 与 `timeGrain` 的关系）——M2 前定。
- 文档内是否保存 AI 辅助记录（建议只存布尔/模型版本 hash，不存 prompt 正文/结果）。
- Markdown/富文本说明是否允许（首版纯文本，禁 HTML）。
- 同 `documentId` 双开检测能做到什么程度（storage 无 CAS）——M0 实测后定。
- 导出能力：首版不做（ADR-10）；若重启，再评审元数据承载（文件名/确认框/页内提示）与安全约束。

## 14. 运行态（不落盘，不进资产）

| 状态 | 字段 | 规则 |
|---|---|---|
| 文档 | `state: empty|loaded|dirty|saving|saved`、`lastSavedAt`、`lastSavedFileName`、`dirty` 由内容 hash 判定 | 保存成功才置 saved；取消/失败回 dirty |
| 连接绑定 | `sourceBinding: {aliasId, status: unmapped|ambiguous|mismatch|not_open|unauthorized|mapped, connectionId?, connectionLabel?}` | `connectionId` 只在内存；打开时用户显式选择；mismatch 禁止执行 |
| 数据集验证 | `{queryHash, fieldsHash, status: unverified|running|verified|stale|error, lastRunAt, truncated, elapsedMs}` | 不存 rows；stale 由 basis 对比产生 |
| 报表视图 | `filterState: {column, op, values[]}`、`filteredRowCount`、`sortState` | 只作用于本次取回行；不持久化 |
| 看板卡 | `state: idle|queued|running|ok|ok_truncated|error|stale|abandoned`、`lastQueriedAt`、`lastSuccessAt`、`durationMs`、`queuePosition`、`errorCode` | 逐卡显示；失败保留上次成功数据并标旧；`abandoned` = 已停止等待 |
| 队列 | `pending[]`、`running[]`（≤2）、按 `queryHash` 去重 | 可见卡优先；同一 queryHash 只执行一次并复用结果 |
| 草稿 | `{key, savedAt, bytes}` | 只存文档快照，不含结果；≤200 KiB；TTL 7 天 |
