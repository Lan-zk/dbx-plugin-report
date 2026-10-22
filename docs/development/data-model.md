# 文档数据模型 v0（草案）

> 状态：设计草案（I），未实现；M1 结束前冻结 v0。  
> 原则：**不存结果数据、不存凭据、SQL 为计算真相、版本可追溯、未知字段不猜测。**  
> 这是插件自有格式，不是 DBX 宿主格式。

## 1. 顶层结构

```json
{
  "formatVersion": "0.0",
  "documentId": "01J...ULID",
  "revision": 3,
  "savedAt": "2026-10-22T14:00:00+08:00",
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
| `formatVersion` | `major.minor`；本版 `0.0`。读：同 major 接受、更高 major 拒绝；写：固定当前版本。 |
| `documentId` | 稳定 ID（ULID/UUID），重开/另存不变；复制粘贴文档时可新建。 |
| `revision` | 每次保存 +1；用于提示覆盖冲突，不作为并发锁。 |
| `savedAt` | 保存时间，ISO 8601 带时区；仅展示。 |
| `sourceAliases` | 逻辑连接别名，**不含连接 id、主机、账号、密码**；打开时映射到本机连接。 |
| `datasets/metrics/dimensions/reports/dashboards` | 见下；所有引用必须存在，ID 全局唯一。 |

## 2. 数据集 Dataset

```json
{
  "id": "ds-sales-monthly",
  "name": "月度销售额",
  "version": { "id": "dsv-3", "queryHash": "sha256:…", "confirmedAt": "…" },
  "query": {
    "sourceAliasId": "src-sales",
    "sql": "SELECT date_trunc('month', paid_at) AS month, sum(amount) AS revenue FROM orders WHERE status='paid' GROUP BY 1 ORDER BY 1",
    "maxRows": 2000,
    "timeoutMs": 30000,
    "dialectProfile": "postgresql@1"
  },
  "rowGrain": "month",
  "fields": [
    { "name": "month", "type": "timestamp", "nullable": false },
    { "name": "revenue", "type": "numeric", "nullable": true, "precision": 18, "scale": 2 }
  ],
  "metricIds": ["m-revenue"],
  "dimensionIds": ["d-month"]
}
```

规则：

- `sql` 必须是**单条只读语句**、无参数占位、无多语句；插件只做预检，最终由宿主分类器裁决。
- `fields` 是**作者确认的输出契约**，不是自动推断的“事实”；缺失/类型变化 → 数据集 stale。
- `version.queryHash` 覆盖 `sql + maxRows + timeoutMs + dialectProfile + sourceAliasId`；SQL 改一个字即新版本。
- `maxRows` 1–5000；默认 500；超限按宿主上限截断并标记。
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
  "timezone": "Asia/Shanghai"
}
```

- `additivity`：`additive` / `semi_additive` / `non_additive`（如比率、去重计数）/ `ratio`。
- `nullPolicy`：`treat_as_zero` / `exclude` / `preserve`；只影响解释与展示，不生成 SQL。
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
  "timezone": "Asia/Shanghai"
}
```

时间维度必须写 `timeGrain` 与 `timezone`；字符串维度不臆造层级（无自动上卷/下钻）。

## 5. 报表 Report

```json
{
  "id": "r-monthly-revenue",
  "title": "月度销售额",
  "datasetVersionRef": "dsv-3",
  "viewSpec": {
    "type": "bar",
    "x": { "dimensionId": "d-month" },
    "y": [{ "metricId": "m-revenue" }],
    "format": { "number": "compact", "currency": "CNY" },
    "sort": { "by": "x", "direction": "asc" }
  },
  "notes": "口径见指标定义；数据为月末快照"
}
```

- `viewSpec.type`：`table` / `bar` / `line` / `number`（M1 支持 table/bar；line/number 可后置）。
- 字段引用只能指向该 datasetVersion 的已确认字段/指标/维度；不存在的引用 = 校验失败。
- 报表不保存数据，只保存“怎么查、怎么显示、口径说明”。
- 过滤/排序属于视图配置，不改 SQL；跨报表过滤映射在 Dashboard 层显式声明。

## 6. 看板 Dashboard

```json
{
  "id": "dash-overview",
  "title": "销售概览",
  "reportRefs": [
    { "reportId": "r-monthly-revenue", "version": 1 },
    { "reportId": "r-top-products", "version": 1 }
  ],
  "layout": [
    { "reportId": "r-monthly-revenue", "x": 0, "y": 0, "w": 6, "h": 4 },
    { "reportId": "r-top-products", "x": 6, "y": 0, "w": 6, "h": 4 }
  ],
  "filterMappings": [
    { "from": "d-month", "to": ["d-month"], "when": "same_semantics" }
  ]
}
```

- `reportRefs` 最多 4；同一连接（sourceAliasId 相同）才允许组合。
- `layout` 是简单 12 列网格坐标；不引入拖拽引擎前先用表单编辑。
- `filterMappings` 只允许类型/口径一致的显式映射；不宣称“全库筛选”。
- 看板不保存查询结果；每次打开/刷新重新取数。

## 7. 身份与版本

- 所有实体 ID：小写 slug，文档内唯一，创建后不变；展示名可改。
- `documentId` 与文件路径解耦；文件重命名不改变身份。
- `revision` 单调递增；`parentRevision` 可选记录，用于导入时提示分叉。
- 内容 hash（可选）：对规范化 JSON（去 `savedAt/revision`）计算 SHA-256，用于冲突提示；不用于安全签名。

## 8. 校验规则（加载时全部执行）

1. `formatVersion` major 支持；未知字段保留但忽略（写回时保留，避免破坏未来字段）。
2. 所有 ID 唯一且非空；`sourceAliases` 至少 1 个（除非纯草稿）。
3. 引用完整性：dataset.sourceAliasId 存在；metric/dimension.datasetId 存在；report.datasetVersionRef 存在；dashboard.reportRefs 存在且 ≤4。
4. SQL：非空、无参数占位、单语句、长度 ≤100000；不做“只读”最终裁决。
5. `maxRows` 1–5000；`timeoutMs` 0–60000。
6. 字段契约：report 引用的 outputColumn 必须在 dataset.fields 中；类型兼容。
7. 禁止键：`password`、`token`、`secret`、`connectionId`（作为持久化字段）等出现即拒绝/剥离。
8. 文件大小 ≤5 MiB；JSON 深度 ≤64；字符串长度上限（单字段 ≤1 MiB）。

## 9. 指标词典规则（防口径错误）

| 场景 | 规则 |
|---|---|
| 比率/率值 | 标 `non_additive`/`ratio`；禁止跨卡求和；展示分母说明 |
| 去重计数 | 标 `non_additive`；禁止把多卡数相加 |
| 货币 | 必须写 currency；跨币种不自动换算（首版不做） |
| 时间 | 必须写 grain/timezone；夏令时/跨时区在数据侧处理，前端不猜 |
| NULL | 明示 policy；不默认把 NULL 当 0 |
| 精度 | decimal 用字符串/定点传输，禁止 JS number 精度丢失后显示“精确” |
| 口径变更 | 只能新建 datasetVersion/指标版本；旧报表保持旧版本引用 |

## 10. 字段漂移

- SQL 变更 → 新 `version`；旧 report 引用旧版本 → `stale`，不能静默指向新版本。
- 打开时若当前连接表结构变化：dataset 进入 `stale`，提示重新运行/确认字段契约。
- 删除/重命名输出列：校验失败并列出受影响报表；提供“重新映射”人工操作，不自动猜。
- 不保存旧结果用于“对照”；如需对照，用独立查询在 DBX 中做。

## 11. 版本迁移

- `formatVersion` 用 `major.minor`；minor 只加可选字段；major 才允许改语义。
- 迁移函数按版本链式执行；每个迁移有测试夹具（旧 JSON → 新 JSON → 校验）。
- 未知 major：只读展示关键元信息，禁止保存覆盖。
- 迁移不可逆时保留 `.bak` 副本（通过另存实现，不覆盖原文件）。

## 12. 示例（最小可打开文档）

```json
{
  "formatVersion": "0.0",
  "documentId": "doc-demo-001",
  "revision": 1,
  "savedAt": "2026-10-22T14:00:00+08:00",
  "sourceAliases": [{ "id": "src-1", "label": "本地 SQLite", "dbType": "sqlite" }],
  "datasets": [{
    "id": "ds-1",
    "name": "示例",
    "version": { "id": "dsv-1", "queryHash": "sha256:pending", "confirmedAt": "2026-10-22T14:00:00+08:00" },
    "query": { "sourceAliasId": "src-1", "sql": "SELECT 1 AS k, 'ok' AS v", "maxRows": 500 },
    "rowGrain": "row",
    "fields": [{ "name": "k", "type": "integer", "nullable": false }, { "name": "v", "type": "text", "nullable": true }],
    "metricIds": [],
    "dimensionIds": []
  }],
  "metrics": [],
  "dimensions": [],
  "reports": [{
    "id": "r-1",
    "title": "示例报表",
    "datasetVersionRef": "dsv-1",
    "viewSpec": { "type": "table", "columns": ["k", "v"] }
  }],
  "dashboards": []
}
```

## 13. 待定问题

- 指标 vs 维度的边界（时间列是否可同时是维度/指标）——按“字段角色”显式声明，不靠类型猜。
- 多数据集看板是否永远禁止；当前只允许同连接多数据集，但 M2 先单数据集。
- 文档内是否保存 AI 辅助记录（建议只存布尔/模型版本，不存 prompt 正文）。
- Markdown/富文本说明是否允许（首版纯文本，禁 HTML）。
