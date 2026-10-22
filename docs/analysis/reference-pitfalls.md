# 三产品对照：最可能踩的坑与设计修订

> 状态：开发前风险分析（F/I/H），2026-10-22。
> 竞品基线：Metabase `master@ba4e0c5a`；Apache Superset `HEAD@3297c39`（发行锚点 6.1.0 = `c83fb2b`）；FineBI 7.X 现行为主、6.X 对照。
> 取证笔记（仓库外本地留存，不入库）：`metabase.md`、`superset.md`、`finebi.md`。
> 目的：M0 前把“服务端 BI 语义 → 单条只读 SQL 通道”的错位、文件资产特有问题、数据保真契约一次定清楚；逐条给裁决与落点，供 M0/M1 直接执行。

## 0. 结论（先看这里）

### 0.1 三个总体判断

1. **最大的系统性坑是“服务端语义照搬”。** Metabase、Superset、FineBI 的过滤、合计、分页、缓存、权限、调度都建立在“服务端持有全集、查询可被平台改写”上。dbx-plugin-report 只有单条只读 SQL、500/5000 行、8 MiB、无 bind/cancel/缓存。**凡把 `truncated` 结果当全集做过滤/排序/合计/导出，都必然产生错误结论**——这是三家产品的机制在提醒我们的地方，而不是可以借来的功能。
   统一裁决：查询结果＝**带截断原因的样本**；所有读者交互只作用于样本；所有聚合/合计/占比要么 SQL 算，要么不存在；所有“完整/最新/全部”字样必须有真实依据。
2. **第二类坑是宿主能力误判。** 此前文档写“无读取 API、只能拖入”，实际 0.6.51 已有 `fileTransfer.pick/read/drop` 且**不需要 manifest 权限**；但“停止/取消”确实没有，`saveFile` 也不能原地覆盖。事实错了，设计就会错（D2 的可行性判断直接受影响）。
3. **第三类坑是文件资产的生命周期。** 三家的资产在数据库里：有版本表、软删除、服务端授权、事务。我们只有“每次弹框的 saveFile + 1 MiB storage + 无 CAS + 无锁”。版本、草稿、冲突、另存为、`documentId`、迁移必须显式设计，否则用户会丢工作、静默覆盖或打开旧文件得到错误数字。

### 0.2 Top 16 坑总表（按 概率×损失 排序）

| # | 坑 | 概率×损失 | 三家中谁给了解法 | 我们的裁决 | 落点 |
|---|---|---|---|---|---|
| P1 | 截断样本上做过滤/排序，却按全集口径展示 | 高×极高 | 三家全部在服务端算；Metabase 连 `row_count==上限` 也按截断处理（`get-row-count-message.ts:9-20`） | 结果集过滤 + 常驻“仅作用于已取回行” + 过滤后禁用总计/占比/结论性文案 | data-model §5/§6、architecture §4/§5 |
| P2 | 前端合计/占比/“其他”桶 | 高×极高 | FineBI 合计“自动/平均”两种口径结果不同（doc-1697）；Metabase/Superset 聚合在 SQL | 只认 SQL 输出标记行；不做 Others 桶；数值卡要求 SQL 已聚合 | data-model §5、acceptance M1 |
| P3 | 部分失败被当整体失败，或旧数据当最新 | 高×高 | Superset 逐卡 `chartStatus`+`LastQueriedLabel`+ErrorBoundary；Metabase 逐卡 loading/cached 文案 | 卡状态机 + `N/M 成功` 汇总 + `lastSuccessAt`，失败卡保留旧值但明确标旧 | architecture §4/§6、acceptance M2 |
| P4 | 新鲜度时间轴混淆（取数/保存/口径确认） | 高×中 | Superset `is_cached/cached_dttm/queried_dttm`；Metabase “Showing cached results from …” | 三条时间轴分离；禁止单一“截至 HH:MM”；无缓存层 | architecture §4、data-model §14 |
| P5 | 队列/超时/“停止”误导、多卡体验 | 高×中 | Metabase 并发归组 + 15s 慢卡；Superset 前端 abort≠服务端 kill | 队列可见（排队中 k/N）+ 去重 + 前端 watchdog + 只承诺“停止等待”（效果=忽略结果） | architecture §6、错误表 |
| P6 | decimal/bigint/NaN/重复列名经 JSON 丢精度 | 中高×高 | Superset Decimal 定点字符串/NaN 分支/列名去重；FineBI >15 位转文本 | `fields[].transport` + ⚠ 提示 + 不存格式化值 + 列名去重规则 | data-model §2/§9 |
| P7 | 时区/时间粒度/相对时间 | 中高×高 | Superset 无后端默认时区、时间控件；FineBI 8 类时间控件 + DST 教训 | 文档 `timezone` + 时间只信 SQL + 首版无相对时间过滤 | data-model §1/§2、architecture §3 |
| P8 | 打开≠有权限、换机静默连错库 | 中高×高 | Metabase/Superset 每次取数重校验；FineBI 权限缓存延迟教训 | 运行时 `sourceBinding` 状态 + 强制确认 + 不持久化 connectionId | data-model §14、architecture §9 |
| P9 | 保存/重开生命周期：无路径、无覆盖、无版本、无草稿救援 | 中×高 | Metabase `card_schema` 显式升级链（漏列会静默跳过并标 current）；Superset 版本排除运行态字段；FineBI 版本≤5、不自动保存、关标签有提示 | 保存=另存为；`documentId` 身份；`formatVersion`+显式迁移；storage 草稿（≤200 KiB）+ 同 id 双开警告；无 `.bak` | architecture §9、data-model §1/§14 |
| P10 | 字段契约与口径漂移 | 中×中 | Metabase 每次请求重校验 schema；Superset `coltypes` 兜底；FineBI 字段语义/时间分组 | `basis = {queryHash, fieldsHash, confirmedAt}` 取代悬空版本引用；漂移即 `stale`，不静默更新 | data-model §2/§8、architecture §4 |
| P11 | 高基数图表/大表格渲染 | 高×高 | Superset `series_limit` SQL 子查询 + Others 可选；FineBI 大数据模式阈值 5000 | 作者预设 Top-N（展示截断、不做 Others 桶）+ 多序列 ≤4 + 表格窗口化 | architecture §8、tech-stack |
| P12 | CSV 导出：公式注入/编码/元数据 | —（已排除） | Superset `utf-8-sig` + 前缀转义 + 负数豁免；Metabase `escape-spreadsheet-formula` | **不做导出**（ADR-10，2026-10-22 拍板）；证据与约束留档供后续 | decisions ADR-10、architecture §12 |
| P13 | 看板过滤器只有映射、没有定义 | 高×中 | Metabase 过滤器定义+下推；Superset scope 只存 `rootPath+excluded`、`chartsInScope` 派生；FineBI 过滤必填防全量 | `dashboard.filters[]` 完整定义 + 映射需作者确认 + 未映射卡角标 + 运行态不入盘 | data-model §6、architecture §8.1 |
| P14 | 布局派生值与编辑体验 | 中×中 | Metabase/Superset 12 列网格、布局与数据分离；Superset 作用域由布局派生 | ADR-06/07 已定（gridstack、≤20 卡、最小 2×3）；布局不触发取数；派生值不入盘；窄屏 1 列只读 | data-model §6/§7、architecture §8.1 |
| P15 | 主题/i18n/a11y 缺失 | 中×中 | Superset 主题/i18n/时区组件；Metabase 主题 token | 跟随宿主主题 + Intl 显式时区 + 最小 a11y（表格语义/图表摘要/键盘） | architecture §11/§12、acceptance M2 |
| P16 | AI 幻觉/审计/注入 | 中×中 | 三家共同点：AI 产物必须走与手写产物相同的校验与权限链路 | 只出 `candidate` + 同一 Zod schema + 本地 SQL 预检 + provenance + 显式 diff | architecture §10、data-model §10 |

## 1. 方法与证据约定

- 三份笔记记录了检索范围、源码路径/行号、官方文档 URL 与访问日期；本文只摘结论，不复制全文。
- **F**：源码或官方文档可直接核对；**I**：由 F 推导的裁决；**H**：需真机/实测验证。三家产品均**未本地部署运行**，运行时行为标 H；源码是快照（Metabase/Superset 为 master/HEAD，不是发行版）。
- 宿主事实以 DBX `b160d130` 为准；文中的 `pluginHostBridge.ts`、`PluginWorkbenchHost.vue`、`plugin-development.mdx` 行号会随 DBX 升级漂移，引用前重核。
- 竞品版本号不写进结论：Metabase 克隆无 tag、package 为 `0.0.0`；Superset 只有 6.1.0 发行锚点。

## 2. 为什么“照搬”必错：五处结构性错位

| 维度 | 三家产品的前提 | dbx-plugin-report 的现实 | 照搬的后果 | 本项目的对策 |
|---|---|---|---|---|
| 数据范围 | 服务端分页/总行数，过滤与合计在全集上算 | 单条 SQL、500/5000 行、8 MiB，未知总数 | 把样本当全集：过滤后 38 行被当成“全量筛选结果” | 样本语义 + 原因 + 标注 + 禁止结论性聚合 |
| 查询控制 | 平台生成 SQL（参数/Jinja/adhoc filter） | 作者固定 SQL，无 bind、无改写 | 以为过滤是“加 WHERE”，实际只改展示 | 结果集过滤；过滤条件显式声明“不改 SQL” |
| 运行时 | 服务端缓存、调度、异步、取消 | 无缓存、无调度、无 cancel/executionId | 复刻缓存/自动刷新/“已取消”都是撒谎 | 每次显式取数；只丢弃响应；逐卡时间 |
| 资产 | 数据库行 + 版本表 + ACL + 事务 | 本机 JSON 文件 + saveFile（弹框）+ storage 1 MiB | 覆盖、丢草稿、版本悬空、权限错觉 | 另存为 + revision/hash + 草稿 + 租约；文件无权限 |
| 类型 | 后端归一化（Decimal→字符串、列名去重、时区控件） | JSON 原样，columns 只有 `name/dataType?` | 精度丢失、日期歧义、重复列名渲染错 | `transport` 契约 + 显示格式规格 + 列名策略 |

**一句话：三家产品的“功能”多数是服务端能力的投影；我们能借的是它们的失败教训、状态机、文案与数据契约，不是功能本身。**

## 3. 逐坑分析

> 每条结构：表现 → 为什么我们会踩 → 三家怎么做（证据）→ 裁决 → 具体设计决定。设计决定是拟定的（I），需在 M0/M1 验证。

### P1 截断样本上做过滤/排序，却按全集口径展示

- **表现**：作者写了 `LIMIT 500` 的 SQL（或结果被宿主截断），读者在报表上筛出 38 行，以为“这是全量筛选结果”；“按金额降序 Top 10”实际是“已取回 500 行里的 Top 10”。
- **我们会踩的原因**：产品不变量第 5 条只禁止“把截断标完整”，但没有定义过滤/排序的作用域；宿主 `queryData` 返回 `truncated` 却不给总行数，读者没有任何线索。
- **三家怎么做**：
  - Metabase 看板过滤器**全部下推 SQL**（`frontend/src/metabase/dashboard/actions/data-fetching.ts:400-440`，`src/metabase/driver/sql/query_processor/substitute.clj:176-181`），展示层没有“查完再过滤”的路径；行数文案在 `rows_truncated>0` **或** `row_count==HARD_ROW_LIMIT`（2000）时都只说 “Showing first N rows”（`frontend/src/metabase/common/utils/get-row-count-message.ts:9-20`），从不给总数。
  - Superset adhoc filter 变 WHERE（`superset/common/query_object.py:104-193,522-577`）；被拒绝的过滤通过响应里的 `applied_filter_columns` / `rejected_filter_columns` 显式回传，前端打 `FiltersBadge`（`superset/common/query_context_processor.py:427-429`）——教训是**过滤未生效必须可见**；SQL Lab 只有一行 “row limit reached” 提示（`src/explore/components/DataTablesPane/components/useResultsPane.tsx:95`）。
  - FineBI 有服务端分页与总行数，过滤是全集语义；过滤组件可设“必填”，官方理由是防止清空后拉全量“甚至引发系统宕机”（[doc-140](https://help.fanruan.com/finebi/doc-view-140.html)）。
- **裁决**：无 bind、无参数、SQL 由作者固定 ⇒ **只能做结果集过滤**；过滤/排序永远不改变 SQL，也不改变“已取回行数”，只能改变“显示行数”。
- **设计决定**：
  - `availableControls.filter`：只允许作者预设；`filterState` 是运行时状态，不入资产（`column, op:eq|in, values[], filteredRowCount`；`between` 后置到 M2+）。
  - 报表顶部固定显示：`已取回 500 行（行上限 500，SQL 命中总数未知）`；本地过滤后追加 `· 其中 38 行符合筛选`。禁止“筛选结果：38 行”这类省略语境的文案。
  - `truncated=true` 时禁用一切结论性操作：总计/占比/排行/“其他”桶/全量导出；`truncated=false` 也不说“全部数据”，只说“本次取回的 N 行”。
  - 过滤后空结果：`样本内无匹配行（SQL 命中总数未知）`，不用“无数据”。
  - 过滤/排序不触发 `queryData`；同一文档内切换筛选不重复排队。
- **落点**：data-model §5/§6、architecture §4/§5、acceptance M1/M2。

### P2 前端合计/占比/“其他”桶

- **表现**：表格底部一行“合计”是前端把 500 行相加；饼图/柱图把长尾并成“其他”；数值卡把多行数字相加显示。
- **我们会踩的原因**：用户对 BI 的默认期待就是“有合计”；截断后前端求和天然错误，且“其他”桶在视觉上等于一个 SQL 没有输出的值。
- **三家怎么做**：FineBI 合计“自动＝对明细重算”“平均＝先算月均再对月均求平均”，两种口径结果不同（[doc-1697](https://help.fanruan.com/finebi-tw6.0/doc-view-1697.html)）；明细表不支持汇总（[doc-123](https://help.fanruan.com/finebi6.X/edition-view-23854-52.html)）。Metabase/Superset 的图表值都由 SQL 聚合返回。Superset 的 “Others” 是 SQL 层 series_limit 子查询 + 可选项 `group_others_when_limit_reached`（默认 false，说明是“防止不完整时间序列被展示”）（`superset/models/helpers.py:5938-5981`、`superset-frontend/packages/superset-ui-chart-controls/src/shared-controls/sharedControls.tsx:289-300`）。
- **裁决**：**前端不做任何数值聚合**。合计只能是 SQL 输出的一行（标记行）；占比只能由 SQL 输出比例列；不做“其他”桶（要就作者在 SQL 里 `CASE`）。
- **设计决定**：
  - `viewSpec.totals = {mode:"none"|"sql_marker", marker:{column, value}}`，默认 `none`；`sql_marker` 时该行样式区分并注明“合计行由 SQL 输出”。
  - `number` 卡要求结果恰好 1 行、1 个数值列；否则拒绝渲染并提示“请让 SQL 聚合为单行”。
  - core 层禁止对 `rows` 做 `sum/avg/count` 生成展示值；此约束写成单测（无 reduce 调用、无聚合函数）。
  - 作者要“其他”：SQL 里 `CASE WHEN rn<=10 THEN dim ELSE '其他' END`，并在指标 `definition` 写明。
- **落点**：data-model §5/§9、architecture §5、acceptance M1。

### P3 部分失败被当整体失败，或旧数据被当最新

- **表现**：多卡看板 1 卡失败，整页报错或整页“刷新中”；失败卡保留旧数据却没有时间标记，读者以为是最新；或者失败后直接清空，读者以为“没数据”。
- **三家怎么做**：Superset 每卡独立 `chartStatus`（`Chart.tsx:202,747`）、卡头 `LastQueriedLabel` 显示本次查询时间且 loading 时隐藏旧时间（`:890-891`）、dashboard 级 ErrorBoundary 隔离单卡（`DashboardBuilder.tsx:865`）；但 chart-data 接口在任一子查询失败时整体报错（`superset/commands/chart/data/get_data_command.py:58-105`）——这是反面教材。Metabase 每卡独立 loading，cached 结果有单独文案（`frontend/src/metabase/query_builder/components/QuestionLastUpdated.tsx:9-42`）。
- **裁决**：卡级隔离 + 看板级只做派生汇总。
- **设计决定**：
  - `CardFetchState = idle | queued | running | ok | ok_truncated | error | stale | abandoned`；字段 `lastQueriedAt, lastSuccessAt, durationMs, queuePosition, errorCode`。
  - 看板顶栏只显示派生的 `3/4 成功 · 1 失败`，**不提供**“数据截至 HH:MM”；刷新完成后也不折叠成一个时间。
  - 失败卡：保留上次成功数据，灰化 + 角标 `上次成功 14:02（本次失败）`，禁止导出；无上次成功则显示空态 + 错误详情。
  - 刷新中不隐藏旧时间（对比 Superset 的 loading 隐藏）；只把旧时间标成“上次成功”。
- **落点**：architecture §4/§6、acceptance M2。

### P4 新鲜度三时间轴混淆，以及“刷新＝最新”的误解

- **表现**：读者问“这个数字是什么时候的”，产品只能给一个含糊的“刚刚刷新”；或者把文档保存时间、口径确认时间、取数时间混成一个。
- **三家怎么做**：Superset 响应三要素 `is_cached / cached_dttm / queried_dttm`（`superset/common/query_context_processor.py:421-433`），强刷用 nonce 防重试重复打库（`:196-260`），前端记录 `force_refresh / data_age`（`src/components/Chart/chartAction.ts:880-895`）；Metabase 缓存结果有 “Showing cached results from 1 minute ago” 类文案（`QuestionLastUpdated.tsx:9-42`）；FineBI 直连默认 600 秒缓存（[doc-1674](https://help.fanruan.com/finebi/doc-view-1674.html)），用户常把“刷新”误当最新。
- **裁决**：不做缓存层；三条时间轴分离；`刷新` = 显式重新执行。
- **设计决定**：
  - 资产：文档级 `savedAt`（作者保存）、`dataset.version.confirmedAt`（口径确认）。
  - 运行时：`card.lastQueriedAt`（本次取数完成时间，逐卡）、`durationMs`、`truncated/reason`。
  - 文案：卡上 `取数于 15:22:41`；鼠标悬停/详情显示用时与行数；没有取数时显示 `未取数`，不显示空表格当 0。
  - 刷新按钮：`重新执行 4 条 SQL（单条上限 60 秒，逐条排队）`；刷新中禁用，禁止定时刷新。
- **落点**：architecture §4/§9、data-model §14（新增运行态章节）。

### P5 队列、超时与“停止”误导

- **表现**：多卡顺序刷新，后排卡长时间“转圈”，用户以为卡死；点“停止”后以为数据库查询被取消；关掉 tab 后服务端仍在跑。
- **三家怎么做**：Metabase 按 HTTP/1.1 连接数留 1 条余量取 5 并发，并用 `dashboard_load_id` 归组（`frontend/src/metabase/dashboard/actions/data-fetching.ts:460-500,508-509`），15 秒慢卡标记（`frontend/src/metabase/dashboard/constants.ts:57`）；Superset 前端 abort 只丢弃响应，源码未见服务端 kill（H）；FineBI 明确直连超时会阻塞后续 BI 请求，需要超时中止（[doc-312](https://help.fanruan.com/finebi/doc-view-312.html)）。
- **宿主事实**：每 bridge 4 并发、单查询执行 timeout 上限 60 秒（非端到端 deadline）、无 cancel/executionId。
- **裁决**：把“等待”和“执行”分开表达；只承诺“忽略结果”，不承诺“取消查询”。
- **设计决定**：
  - 队列：上限 2；`queued` 卡显示 `排队中（第 3/4 张）`；可见卡优先；同一 `queryHash` 只执行一次并复用 rows（多卡引用同一报表时不得重复打库）。
  - watchdog：`timeoutMs + 5s` 后本地置 `error`（`QUERY_TIMEOUT`，可重试），文案 `已停止等待（数据库可能仍在执行，单条执行上限 60 秒）`；宿主返回 `QUERY_TIMEOUT` 优先按宿主错误展示。
  - “停止”按钮文案 `停止等待`，效果是“忽略结果”；状态 `abandoned`；不显示“已取消”。
  - 无自动重试；失败卡由用户点“重试”。
- **落点**：architecture §6、错误码表、acceptance M2。

### P6 大整数/decimal/NaN/重复列名经 JSON 丢精度

- **表现**：`999999999999999999.99` 显示成 `1e+18`；`2^53+1` 变成偶数；PostgreSQL `numeric` 在部分驱动下是字符串、部分情况下被转 number；`NaN/Infinity` 在 JSON 里不存在；`SELECT a, a` 产生两个同名列表头，映射错列。
- **三家怎么做**：Superset 后端 `stringify` 对 `Decimal` 用 `format(value,'f')` 输出精确定点文本，NaN/Infinity 单独分支（`superset/result_set.py:70-113`），列名去重加后缀（`:190-330`），前端用 `coltypes` 承载类型；FineBI 对 >15 位数字自动识别为文本“防止大整数精度丢失”，并说明 double 有效精度 15 位（[doc-312](https://help.fanruan.com/finebi/doc-view-312.html)）；Metabase 由驱动/semantic type 层处理。
- **宿主事实**：`queryData.columns` 只有 `{name, dataType?}`，没有 precision/scale；`rows: unknown[][]` 是 JSON 值。**各驱动的实际序列化行为（SQLLite/PG 的 decimal/bigint/timestamp）是 H，M0 必须实测。**
- **裁决**：作者在字段契约里声明传输形态；插件不猜测、不“聪明地”转 number；显示格式与传输值分离。
- **设计决定**：
  - `fields[].transport: "number" | "decimal_string" | "integer_string" | "date_string" | "timestamp_string" | "boolean" | "unknown"`（默认 `unknown`，确认时才要求选择）。
  - 规则：`transport=number` 且 `|v| > 9007199254740991` 或声明 `scale>15` → 字段旁 ⚠ + 提示“精度可能丢失，建议 SQL 中 CAST 为文本”；`decimal_string` 不做 `Number()` 转换，排序用十进制定点比较（或按字符串长度+字典序的专用比较器）。
  - `NaN/Infinity` 一律归一化为 `null` 并记 `valueIssues`；显示 `—`，不显示 `NaN`。
  - 输出列重名：确认字段契约时**拒绝**并提示“SQL 输出列名重复，请用 AS 起唯一别名”，不自动加后缀（自动改名会让下次运行映射漂移）。
  - 显示格式规格：`metric.format = {decimals:0-6, grouping:boolean, unitSuffix:"none"|"thousand"|"tenThousand"|"million"|"hundredMillion"|"billion", percent:boolean}`；`dimension.format = {datePattern?, timezone?}`；只在渲染层使用，CSV/复制/资产一律存原始值。
- **落点**：data-model §2/§9、acceptance M1（黄金数据新增精度用例）、M0 记录实测矩阵。

### P7 时区、时间粒度与“相对时间”过滤

- **表现**：同一文件在两人机器上“月份”桶不同；`date_trunc` 在 SQL 里但 UI 又做了一次本地时间转换；读者选“近 7 天”，但样本被截断导致日期不连续，结果为空或稀疏。
- **三家怎么做**：Superset 后端没有 `DEFAULT_TIMEZONE`，缺省时区只存在于前端兜底（`.../TimezoneOptionsCache.ts:26-30`），时间范围是自然语言解析（`superset/utils/date_parser.py:498-560`），跨 DST 有专门的探测逻辑（`:174-199`）；FineBI 时间智能只在有对应时间分组的维度上生效，上期/本期为空时同环比显示空（[doc-131](https://help.fanruan.com/finebi6.X/doc-view-131.html)），并有 8 类时间控件与“工作日”外部文件依赖（[doc-135](https://help.fanruan.com/finebi/doc-view-135.html)）。
- **裁决**：时间计算全在 SQL；插件只存“报表时区”并做显示；首版无相对时间过滤、无同环比/YTD（要就 SQL 窗口函数）。
- **设计决定**：
  - 文档 `timezone`（IANA，首次保存时写死本机时区）；`dimension.timezone` 解释字段；UI 显示 `报表时区 Asia/Shanghai (UTC+8)`；打开文件若与系统时区不同，一次性非阻断提示。
  - 不做值的时区换算；日期格式化用 `Intl.DateTimeFormat` 且 timeZone 显式传入。
  - 时间过滤（M2）：仅绝对区间/离散值，且字段 `transport` 为 ISO 8601 字符串；比较按原始字符串/解析后的固定偏移值，不按浏览器本地时区猜。相对时间（近 7 天/本月）首版禁用。
  - 时间粒度由 SQL 输出决定（`dimension.timeGrain` 只用于标注与校验，不生成 SQL）。
- **落点**：data-model §1/§2、architecture §3、acceptance M2。

### P8 “打开≠有权限”、换机静默连错库

- **表现**：把 JSON 发给同事，对方打开看到数字为 0 或空表，以为“报表坏了”；更糟：对方本机有同名连接但指向测试库，报表数字全错却看起来正常。
- **三家怎么做**：Metabase 每次请求重新校验读写权限（`src/metabase/queries/models/card.clj:187-194`），行/列级 sandboxing 是企业版（`enterprise/.../sandbox/api/gtap.clj`、`column_filter.clj`）；Superset 每次取数 `raise_for_access()`（`superset/commands/chart/data/get_data_command.py:107-108`），RLS 是 Jinja 拼进 WHERE（`superset/connectors/sqla/models.py:2616-2625`）；FineBI 数据集 ACL 有“权限缓存跟随数据集缓存、分配不一定实时生效（5–10 分钟）”的坑（[doc-1018](https://help.fanruan.com/finebi/doc-view-1018.html)）。
- **裁决**：文件只存逻辑别名；打开后必须显式绑定本机连接；把“未授权/未连接/空结果”做成三种状态。
- **设计决定**：
  - 运行时 `sourceBinding = {status:"unmapped"|"ambiguous"|"mismatch"|"not_open"|"unauthorized"|"mapped", connectionId?, connectionLabel?}`；`connectionId` 只存在内存，永不写入资产。
  - 打开文件：按 `dbType` 过滤连接列表，**默认不自动选**；用户点“绑定并执行”后才查询（同时触发 grant 弹框）。`mismatch`（database/schema 不同）时显示差异并禁止执行，不提供“仍然使用”。
  - 空态区分：`尚未绑定连接` / `需要授权` / `连接未打开` / `查询成功但 0 行`，四套文案。
  - 禁止“打开文件后静默用最近一次连接执行”。
- **落点**：data-model §14、architecture §9、acceptance M0/M1。

### P9 保存/重开生命周期：没有路径、没有覆盖、没有版本

- **表现**：用户改了报表点“保存”，每次弹另存为，桌面上出现 `sales(1).dbxreport.json`、`sales(2).dbxreport.json`；关窗后未保存内容直接丢失；“版本历史”不存在，改坏只能重写；两个 tab 打开同一文件互相覆盖。
- **三家怎么做**：FineBI 报表“最多保存 5 个历史版本、不自动保存”（[doc-2291](https://help.fanruan.com/finebi6.X/doc-view-2291.html)）。Metabase `card_schema` 是显式升级链，`schema_version` 缺列会“静默跳过并标 current”，官方随后改成每次请求重校验（`src/metabase/queries/models/card.clj:75-99,187-194`、`src/metabase/queries/card_schema.clj:1-34`）——格式演进必须**显式**。Superset 的 slice 版本历史刻意排除 `query_context`、审计列、权限派生字段（`superset/models/slice.py:102-108`）——**派生数据不进版本**。
- **宿主事实**：`saveFile` 每次都弹原生对话框、取消返回 `null`、**不返回路径**；`fileTransfer.pick` 拿到的是句柄，不是路径；没有“覆盖原文件”的 API。
- **裁决**：放弃“自动保存/覆盖原文件”幻想，把“另存为”变成产品语义；用 `documentId` 做身份，不用路径；草稿只做救援，不做资产。
- **设计决定**：
  - 保存 = 另存为，默认文件名 `{slug}.dbxreport.json`，成功提示 `已保存（未写回原文件；DBX 不提供覆盖保存）`，并显示本次保存时间。
  - `documentId`（uuid）在文档生命周期内不变；另存为新文件后两份文件共享 `documentId`，打开时若检测到同 id 已在其它 tab 打开 → 警告“同一文档的另一个副本已打开，保存会产生分叉”。
  - 草稿：`host.storage` 键 `draft:{documentId}`，内容为本会话未保存文档快照（压缩后 ≤200 KiB；超限不写，只提示），节流 3 秒；启动时若有草稿 → 非阻断询问“恢复上次未保存的编辑？”；草稿永不显示为“已保存”，保存成功后删除草稿。
  - 无 `.bak`（宿主不能改名/删除文件）；把“另存为不覆盖”当天然备份。
  - 拒绝“文件路径”概念进入资产或 UI；最近文件列表只存 `{fileName, documentId, savedAt}`，打开仍走 `fileTransfer.pick`。
  - 格式演进：`formatVersion` 走 `0.0 → 0.1 → …` 显式迁移表（Zod + 迁移函数），未知 major 只读、未知 minor 忽略字段；**不存派生值**（分面/过滤后行/图表像素）。
  - 不引入插件内本地数据库/持久化层（**宿主约束，不是偏好**）：插件 iframe 为 opaque origin（`sandbox="allow-scripts"`），无插件专属目录；`host.storage` 是 UI 状态存储（单值 256 KiB，`pluginHostBridge.ts:154`，值经 `JSON.stringify` 计字节，base64 也逃不掉总量上限），注释明确 bulk data 应归 sidecar 数据目录；WASM SQLite 还需 `unsafe-eval`（宿主只对 graphics engine 按插件授权，`PluginWorkbenchHost.vue:62`、`pluginGraphicsEngine.ts:2`），CSP 为 `default-src 'none'; script-src 'unsafe-inline' blob: …`（`pluginHostBridge.ts:1161`），无 `wasm-unsafe-eval`。因此本地库只能退化为：内存表（关窗即丢）、≤256 KiB 的 JSON blob、或用户每次弹框选的 `.sqlite` 文件——都不如 JSON。若将来要本地库，须先有宿主资产 API 或另做 sidecar 信任边界评审。
  - 对照参考：带 backend 的插件（如 `io.dbx.ssh`）用 manifest `connection-provider` 声明连接字段，连接记录与 secret 由 DBX 宿主持有（`plugins/README.md:189-223`：`secret` → `connection_secrets`，插件只在生命周期请求里拿到 hydrated connection），插件自身只把非 secret 状态写 sidecar `<data_dir>`（如 preferences/quick-commands）；dbx-plugin-report 无侧车、也不拥有连接，故不存任何连接元数据或凭据。
- **落点**：architecture §9、data-model §1/§14、acceptance M0（取消保存、草稿恢复、双开警告）。

### P10 字段契约与运行时漂移

- **表现**：作者声明的 `fields` 和这次 SQL 实际返回的列对不上（改名、类型变、少列、多列、重复列名），报表却继续渲染，读者看到错位数字；SQL 从 `SUM(x)` 改为 `SUM(x)/COUNT(*)` 后口径变了但没人知道。
- **三家怎么做**：Metabase 用 `card_schema` 迁移 + 每次请求重校验（见 P9）；Superset 图表存自己的 `form_data`，数据集列与图表列不一致时由查询响应 `coltypes` 兜底（`superset/result_set.py:70-330`）；FineBI 有“字段类型自动识别/16 种字段类型”，并且时间智能依赖字段的时间分组（[doc-312](https://help.fanruan.com/finebi/doc-view-312.html)、[doc-131](https://help.fanruan.com/finebi6.X/doc-view-131.html)）。
- **裁决**：`fields` 是**作者确认过的契约**，不是缓存；每次取数后做契约比对，不一致就停用结论并给修复入口。
- **设计决定**：
  - 运行后比对：列名集合、`transport` 兼容性（`unknown` 可接受任何 dataType，声明后必须匹配）、列顺序变化不报错但记录。
  - 漂移时：报表进入 `stale`，显示 `字段契约与本次查询结果不一致（缺少 revenue；类型从 integer_string 变为 decimal_string）`，提供两个动作：`更新字段契约（需重新确认口径）` / `回滚 SQL`；不静默自动更新。
  - 查询 SQL 哈希（`basis.queryHash`）变化 = 口径变化，`report.basis` 失效；**报表持有 `basis = {queryHash, fieldsHash, confirmedAt}`，不持有 `datasetVersionRef`**（因为版本历史不落盘，引用必然悬空；见 §2 错位二）。
  - `fieldsHash` 覆盖有序 `{name,transport,nullable,precision?,scale?}`；字段顺序或类型变化都会使报表 stale。
- **落点**：data-model §2/§8、architecture §4、acceptance M1（字段漂移用例）。

### P11 高基数与渲染规模

- **表现**：柱状图 143 个分类挤成一团；线图图例 60 条；5000 行 × 30 列表格卡死；宽列截断后表格横向滚动失去表头。
- **三家怎么做**：Superset `SERIES_LIMITS=[5..500]` 且配 `series_limit` SQL 子查询（`superset-frontend/src/explore/controls.tsx:119`、`superset/models/helpers.py:5938-5981`），并有 “Others” 可选项（默认关，见 P2）；`DISPLAY_MAX_ROW=10000` 只影响前端 display（`superset/config.py:1839`）；Metabase 2000/10000 行上限（见 P1），表格虚拟化由前端组件负责。FineBI 明细 20000 行 + 分页、导出不受限（[doc-123](https://help.fanruan.com/finebi6.X/edition-view-23854-52.html)），大数据模式阈值 5000（[doc-1337](https://help.fanruan.com/finebi/doc-view-1337.html)）。
- **裁决**：把“分类数”做成**作者预设**，不做自动折叠；渲染规模显式上限并在超限时降级为表格。
- **设计决定**：
  - `viewSpec.limit = {mode:"top_n"|"all", n:5..50, by:metricId, showTotal:boolean}`（默认 `all`，>30 类警告）；`n` 是“作者从 SQL 结果里取前 n 类”——纯展示截断，标注 `显示前 12 类（共 143 类）`，**不做“其他”桶**（见 P2）。
  - 多序列：`y` 最多 4 个指标，超出禁止；每个指标颜色按固定调色板顺序，不随筛选变；图例 >8 项折叠。
  - 表格：≤200 行直接渲染；>200 行虚拟滚动（M2，TS-10）；单卡最多渲染 5000 行，超过（宿主上限外）不可能；列宽首次按内容采样，之后可手动；表头 sticky。
  - 类别数上限仅在 `truncated=false` 时允许 `showTotal`（总数来自 SQL 行数），否则不显示“共 M 类”。
- **落点**：data-model §5、architecture §8、acceptance M1/M2。

### P12 CSV 导出（已排除：ADR-10）

- **表现**：导出的 CSV 用 Excel 打开中文乱码；单元格 `=cmd|...` 被 Excel 当公式执行；用户拿到 CSV 后不知道是截断样本还是全量、什么时候取的。
- **三家怎么做**：Metabase `escape-spreadsheet-formula` 对 `= + - @ tab CR` 开头加 `'`，纯数字豁免（`src/metabase/query_processor/streaming/common.clj:54-71`）；Superset 导出默认 `CSV_EXPORT = utf-8-sig`（`superset/config.py:1654`），公式注入前缀 `-@+|=%` + 单引号 + 管道转义 + 负数豁免（`superset/utils/csv.py:33-105`），流式导出无行上限（`superset/commands/export/streaming_export_command.py:76-82`）；FineBI 导出会丢部分样式（[doc-161](https://help.fanruan.com/finebi/doc-view-161.html)）。
- **裁决（2026-10-22 更新，ADR-10）**：首版**不做任何导出**（含 CSV），只做查询与展示。以下三家做法与约束留档；若后续重启导出，按“后续若做”实现并重新过安全评审。
- **后续若做（约束留档）**：
  - 编码 UTF-8 **带 BOM**（Excel 中文）；换行 `\r\n`；所有字段加引号，内部 `"` 双写。
  - 公式注入：以 `= + - @ \t \r` 开头的文本单元格前加 `'`；纯数字（含负号、小数、科学计数）不加；`null` 输出空。
  - 文件名：`{reportTitle}_{rows}行_{完整|样本}_20261022-1522.csv`（去除非法字符、长度 ≤80）。
  - 导出前弹确认框：行数、是否截断、取数时间、报表时区、`CSV 不含口径/元数据，完整说明见报表页`；导出后在结果页提示“已导出 500 行样本”。
  - `truncated=true` 时按钮文案 `导出已取回的 500 行（样本）`，且不提供“全量”选项。
  - M1-6 验收：首版改为“无导出入口”（ADR-10）；若后续重启导出，再按“确认框 + 文件名 + 页内提示 + BOM/注入用例”评审。
- **落点**：`decisions.md` ADR-10、architecture §12、acceptance M1-6（改为“无导出入口”）。

### P13 看板过滤器：只有映射、没有定义

- **表现**：`filterMappings` 只有 `{from,to,when}`，但“from 是什么过滤器、有哪些值、默认选什么、是否必填”没有定义；读者点开看板看到空下拉或全选，误以为“没筛就是全部”。
- **三家怎么做**：Metabase 过滤器定义（类型/默认值/必填）在 dashboard 里，取数时下推 SQL（`data-fetching.ts:400-440`）；Superset 过滤器作用域只存 `{rootPath, excluded}`，`chartsInScope` 由布局**派生**（`superset/dashboards/filter_scope.py:1-120`）——派生值不落盘；FineBI 过滤组件可设“必填”，理由是清空会拉全量（[doc-140](https://help.fanruan.com/finebi/doc-view-140.html)）。
- **裁决**：过滤器必须有完整定义；作用域显式存与派生结合；首版不做联动/钻取/跳转。
- **设计决定**：
  - `dashboard.filters[] = {id, label, type:"category"|"number_range"|"time_range", source:{datasetId, field}, required:boolean, defaultValue?:string[], options:"from_result"|"literal", literals?:string[]}`。
  - `filterMappings` 保留但改为 `[{filterId, reportId, targetField}]`；初始化时按“同 dataset + 同字段名”建议映射，作者确认后落盘；不自动跨 dataset 映射（避免静默错口径）。
  - 运行期：未映射的卡显示 `不受筛选影响` 角标；必填过滤器未选 → 卡保持 `未筛选` 状态并禁用结论性操作（不默认全选）；空结果筛选显示“无匹配”而不是 0。
  - 筛选状态是运行态，不入资产；看板默认筛选值只在作者保存时写入 `defaultValue`。
  - 首版只支持“同值相等/包含”，筛选作用在**已取回结果**上，因此每卡显示 `筛选：已取回 500 行中 38 行符合`（见 P1）。
- **落点**：data-model §6（重写）、architecture §8.1、acceptance M2。

### P14 布局派生值与编辑体验

- **表现**：卡片重叠、越界、删除报表后布局残留；拖动布局触发查询；从 12 列宽屏切到窄窗口卡片挤成一列不可读。
- **三家怎么做**：Metabase/Superset 都用 react-grid-layout，布局数据与图表数据分离；Superset 的作用域由布局派生（见 P13）。我们的 ADR-06/07 已定：12 列网格 + gridstack 14 + 官方 Vue wrapper，≤20 卡（建议 ≤12）、最小 2×3（`docs/product/decisions.md` ADR-06/07、`docs/development/tech-stack.md` TS-17、`docs/development/architecture.md` §8.1）。
- **裁决**：布局是纯数据 + 纯交互，任何布局变化都不触发 `queryData`；派生值不落盘。
- **设计决定**：
  - 文件里只存 `layout:[{reportId,x,y,w,h}]`，约束：`x+w≤12`、`w≥2,h≥3`、不重叠、与 `reportRefs` 一一对应；校验失败拒绝打开并给具体冲突坐标。
  - 新卡默认放在最低空白处（确定性算法：自顶向下、自左向右找第一个空位），不随机、不覆盖。
  - 打开看板：自动取数做成文档配置 `onOpenRefresh`（默认 `false`，避免一次打开打 20 条 SQL）；显示各卡“未取数/上次成功”状态 + 顶部按钮 `刷新全部`。Q4 已定（2026-10-22）。
  - 窄窗口：≤960px 网格降为 1 列纵向堆叠（只读展示允许，编辑仍按 12 列），表格卡整宽。
  - 卡片 chrome：标题、`取数于 …`、刷新单卡、更多（导出/查看 SQL/错误详情）；编辑态才显示拖拽手柄与缩放角。
  - 删除卡：从 `reportRefs` 和 `layout` 同时移除；`reportRefs` 被删时布局必须同步，否则打开即校验失败。
- **落点**：data-model §6/§7、architecture §8.1、acceptance M2。

### P15 主题、i18n、可访问性

- **表现**：暗色主题下 ECharts 白底刺眼；图表颜色硬编码和表格主题不一致；中英文混排；键盘用户无法操作画布、表格无表头语义。
- **三家怎么做**：Metabase 有完整主题 token 与暗色模式；Superset 有主题配置与 `theme` 传递到图表；FineBI 有主题/样式模板（但导出丢样式，[doc-161](https://help.fanruan.com/finebi/doc-view-161.html)）。
- **裁决**：跟随宿主主题（`onThemeChange`），不提供独立主题编辑器；i18n 只做 zh-CN/en 两套 typed 字典；a11y 做最小可用集合，不追 WCAG 全量。
- **设计决定**：
  - 颜色全部来自 CSS 变量（`--dbx-*`），图表读取 `getComputedStyle` 后 `instance.setTheme()` 或显式 palette；ECharts 6 的 `setTheme` 限制已记录在 `tech-stack.md` TS-17，不降级 v5。
  - 数字/日期只用 `Intl.NumberFormat` / `Intl.DateTimeFormat`，timeZone 显式传；字典键与 `tech-stack.md` TS-14 一致。
  - 表格 `role="table"`/`th scope`、排序按钮 `aria-sort`；图表提供 `aria-label` + 数据摘要文本（前 N 项），不要求屏幕阅读器读 Canvas 图形；焦点环不依赖颜色；`prefers-reduced-motion` 下禁用拖拽动画。
  - 对比度：文字 ≥4.5:1，图表系列色对底色 ≥3:1（写在验收里，M2 抽检）。
- **落点**：`tech-stack.md` TS-14/TS-15、`architecture.md` §8、acceptance M2。

### P16 AI 候选：越权、脏输出、不可审计

- **表现**：AI 生成的候选直接把 SQL/字段写入资产；候选 JSON 不合法导致崩溃；无法回答“这条报表哪部分是 AI 写的”。
- **三家怎么做**：Metabase 的 AI（Metabot）是**建议 + 用户确认**，SQL 仍走查询处理器与权限检查；Superset 无内置生成式 SQL 编辑；FineBI 的 AI 问答也需人工确认后生成组件（官方文档口径，未实测，H）。三家共同点：AI 产物必须经过与手写产物**完全相同**的校验与权限链路。
- **宿主事实**：AI completion 无工具调用、`maxTokens 2048`、输出 ≤16k 字符、单飞、逐次确认；无网络权限。
- **裁决**：AI 只产出 `candidate`（草稿对象），不直接改文档；候选必须通过同一份 Zod schema 校验、同一套 SQL 只读分类、同一授权弹框。
- **设计决定**：
  - 候选 schema：`{kind:"dataset_draft"|"report_draft", sql?, sourceAliasLabel?, fields?, viewSpec?, rationale?, confidence?}`；未知键拒绝；SQL 必须单条、以 SELECT/WITH 开头、≤100000 字符，否则本地拒绝并说明原因（不送宿主）。
  - 不把结果行、连接凭据、SQL 结果样本发给 AI；只发字段名/类型/标签/用户意图。
  - 应用候选 = 显式 diff 预览（SQL 行级 diff、字段表 diff、图表配置 diff）+ `应用`/`丢弃`；应用后文档变 dirty，保存仍是显式动作。
  - 审计字段：`provenance = {aiAssisted:boolean, appliedAt?, candidateHash?}`，随文档保存；不声称能还原模型/版本。
  - AI 失败不阻塞主流程；超时 30 秒提示“AI 不可用，可手写 SQL”。
- **落点**：architecture §10（已有骨架，补 schema/审计）、data-model §5（`provenance` 字段）、acceptance M3。

## 4. 三家互相矛盾时听谁的

| 分歧点 | Metabase | Superset | FineBI | 本项目裁决 | 理由 |
|---|---|---|---|---|---|
| 截断时是否给总数 | 不给（只说 first N） | 只标 row_limit，不给全量总数 | 服务端分页，有总数 | **不给总数**，只给“已取回 N / 上限 N” | 宿主不返回总数，编造即撒谎；`truncated=true` 时总数不可知 |
| 过滤作用域 | 下推 SQL | 下推 SQL | 下推 SQL/数据集 | **结果集过滤** + 常驻标签 | 无 bind、SQL 固定；只能缩小展示，不能缩小数据 |
| 合计/占比 | SQL 聚合 | SQL 聚合 | 合计“自动/平均”多口径 | **只认 SQL 输出**；不做前端聚合 | 截断后前端求和必错；SQL 是唯一计算真相 |
| 缓存 | 有（缓存结果文案） | 有（is_cached/cached_dttm） | 直连默认 600s | **无缓存层**；显式刷新；逐卡时间 | 宿主无缓存 API；做“伪缓存”会制造“最新”错觉 |
| 高基数“其他”桶 | 无 | 可选（默认关） | 有分组/其他 | **不做**，Top-N 只做展示截断并标注总数未知 | Others 是 SQL 没有的值；若需要应由作者在 SQL 中 `CASE` |
| 时区 | 报表时区设置 | 后端无默认，前端 fallback | 时间控件 + 时间智能 | **文档 `timezone` 显式**；值不转换 | 同一文件换机必须同结果；前端 fallback 是坑 |
| 行上限 | 2000（非聚合）/10000（聚合） | `ROW_LIMIT=50000`/`SQL_MAX_ROW=100000` 是配置默认/上限，`DISPLAY_MAX_ROW=10000` 只限前端展示 | 明细 20000 + 分页 | **宿主 500/5000**；作者可设 `maxRows`，>2000 警告 | 宿主是硬边界；大明细应回 SQL 聚合 |
| 版本历史 | 数据库 + schema 迁移链 | 版本历史（排除派生列） | 最多 5 个版本 | **不做版本历史**；另存为 + `formatVersion` 迁移 + `basis` 哈希 | 文件无覆盖 API、无锁；版本历史需要存储层，不是首版能力 |
| 权限 | 服务端每次重校验 | 服务端每次重校验 + RLS | 数据集 ACL（缓存 5–10 分钟） | **连接绑定确认 + grant 每次弹框**；文件不含权限 | 宿主 grant 是唯一授权；文件可被任意转发 |

## 5. 现有 docs 的缺口清单（逐份）

> 本节是分析时点的缺口快照；2026-10-22 已按 §3/§6 对下列文件完成修订（工作树，尚未提交），保留本表用于复核是否漏改。

| 文档 | 现状 | 问题 | 修订 |
|---|---|---|---|
| `docs/host/capabilities.md` §3.3 | 只有 saveFile/downloadFile/openFilesystem/文件拖入/storage；openFilesystem 标 `host.filesystem`；正文称“无读取 API” | 漏掉 0.6.51 已存在的 `fileTransfer`（pick/read/drop/beginSave，无 manifest 权限，8 MiB/块、64 句柄）；“无读取 API”错误 | 增 `fileTransfer` 行与限制；改为“无按路径直读，读取须用户 pick/drop 授权”；补句柄/分块/取消语义 |
| `docs/host/limits.md` | 行/字节/超时/并发已记 | 缺文件读取块大小、句柄数、`truncated` 触发条件（行 vs 字节） | 已补文件读取行与 `truncated` 行（2026-10-22）；触发条件待 M0 实测 |
| `docs/development/first-slice.md` §2/Step4 | “重开”写 `onDrop` 或 `openFilesystem`；未列 fileTransfer 验证 | 打开路径是 D2 可行性的关键，写法过时且无验收 | Step4 改为 `fileTransfer.pick` + 分块 `read` + `closeFileHandle`；增加取消/超限/超句柄验证；Go/No-Go 增“能重开” |
| `docs/development/data-model.md` §2 | `fields` 只有 `{name,type,nullable,precision?,scale?}` | 无传输形态、无显示格式；无法处理 decimal/bigint/时间字符串 | 增 `transport` 与 `format`；精度规则写成“声明 + 运行时 ⚠ + 不 Number() 化” |
| 同上 §5 | `viewSpec` 只有 `type/x/y/format/sort` | 缺 `limit`(Top-N)、`totals`(SQL 标记)、`allowedControls`、多序列上限 | 增四个字段与约束 |
| 同上 §6 | `filterMappings[{from,to,when}]` | 只有映射，没有过滤器定义/类型/默认值/必填/作用域 | 增 `dashboard.filters[]`；映射改为 `filterId/reportId/targetField`；运行态不入盘 |
| 同上 §5/§8 | 报表引用 `datasetVersionRef:"dsv-3"`，但版本历史不落盘 | 数据集一改即悬空；旧报表不可渲染 | 改为 `basis:{queryHash,fieldsHash,confirmedAt}`；校验规则 4 同步改 |
| 同上（新增 §14） | 无运行态章节 | 队列/取数时间/绑定/草稿/筛选状态无归属 | 增“运行态（不落盘）”一节：`CardFetchState`、`sourceBinding`、`filterState`、`queue` |
| `docs/development/architecture.md` §4 | Document/DatasetVersion/Report 状态机 | 缺 `card` 的 `queued/abandoned/stale` 与字段；缺“打开看板不自动取数” | 补状态机与字段（见 P3/P5） |
| 同上 §5 | 8 条不变量 | 缺“结果过滤不改变数据”“不做前端聚合”“无缓存”“无版本历史” | 增 4 条，编号顺延 |
| 同上 §6 | 队列 ≤2、看板 ≤20 卡（建议 ≤12） | 缺去重、可见优先、停止等待、watchdog、abandoned | 补队列语义与文案 |
| 同上 §7 | 18 个错误码 | 缺 `FILE_CANCELED/FILE_TOO_LARGE/FILE_WRITE_FAILED/FILE_HANDLE_EXHAUSTED/DRAFT_SAVE_FAILED/BINDING_*/SCHEMA_DRIFT/ABANDONED` | 增补；`retryable` 由 `AppError` 结构承载（不单列） |
| 同上 §9 | 保存/打开/草稿描述 | 打开仍写拖入；保存未写“不返回路径/不覆盖”；草稿无配额/节流 | 按 P9/P12 重写 |
| 同上 §10 | AI 管线骨架 | 缺候选 schema、本地 SQL 预检、provenance、diff 粒度 | 按 P16 补 |
| `docs/testing/acceptance.md` | M0-6 重开、M1-6 CSV 元数据 | M0-6 依赖不存在的拖入路径；M1-6 要求纯 CSV 承载元数据（不可实现） | M0-6 改 fileTransfer 全流程；M1-6 改“无导出入口”（ADR-10） |
| `docs/development/roadmap.md` | M0 为最小竖切 | 未把“打开路径/序列化矩阵/字符串保真”列为 M0 验证项 | M0 增 3 项验证；M1 增 5 项工作项；风险表增“样本语义/文件生命周期” |
| `docs/README.md` | 文档地图 | 未索引本文 | 在 analysis 一节加入本文与证据说明 |
| `AGENTS.md` §3/§7 | “保存…无读取 API”；“取消/分页/绑定 无” | 前者与 fileTransfer 冲突；“无 cancel”仍正确 | 仅修事实错误行（fileTransfer 存在、须用户授权），不改安全结论 |

## 6. 分里程碑修订清单

### M0（1–3 天，验证性；新增/改写验收）

1. **打开路径**：`fileTransfer.pick` → 逐块 `read`（≤1 MiB）→ 5 MiB 上限 → 取消/超限/句柄关闭；记录句柄泄漏测试（错误注入 5 次后仍能打开）。
2. **序列化矩阵**：SQLite 中 `INTEGER/BIGINT(>2^53)/REAL/NUMERIC/TEXT/DATE/TIMESTAMP/BOOLEAN/NULL`，记录 `queryData` 返回的 JS 类型与字符串形态；用黄金数据 A0x 固化。
3. **截断语义**：`LIMIT 500` 与超 8 MiB 两条路径的 `truncated` 触发条件与 `elapsedMs`；确认“行数截断 vs 字节截断”能否区分（不能则统一文案）。
4. **ECharts/gridstack CSP 实测**：`default-src 'none'` + opaque origin 下无 eval/worker/远程字体；退化 SVG 分支可用。
5. **草稿存储**：`host.storage` 写入 200 KiB 草稿、读取、删除；确认 256 KiB/1 MiB 配额行为与失败提示。
6. **Go/No-Go 增一条**：端到端“打开 JSON → 绑定连接 → 执行 → 看数”可复现。

### M1（单报表竖切；新增工作项）

1. data-model v0.1：`transport/format`、`viewSpec.limit/totals/allowedControls`、`basis`、`documentId` 身份、`formatVersion` 迁移表。
2. 契约校验与 `stale` 流程、字段漂移修复入口、`fieldsHash`。
3. 结果集过滤/排序语义与常驻文案（`已取回 N 行…`）。
4. 合计仅 SQL 标记行；数值卡单行校验。
5. 不做导出：M1 验收改为“无导出入口”；导出安全约束留档（P12）。
6. 精度：`transport=decimal_string` 不 Number 化、排序比较器、⚠ 提示。

### M2（看板；新增工作项）

1. 卡状态机与看板汇总（`N/M 成功`）、失败卡保留旧值 + `lastSuccessAt`（标旧）、导出禁用。
2. 队列去重/可见优先/watchdog（`timeoutMs+5s`）/`停止等待`（效果=忽略结果）/abandoned；刷新全部进度 `第 k/N 张`。
3. `dashboard.filters[]` 定义 + 映射确认 + 未映射角标 + 运行态；首版只等值/包含、只作用已取回行。
4. Top-N 展示截断 + 多序列 ≤4 + 高基数警告；表格窗口化（TS-10 条件）。
5. 布局校验（`x+w≤12`、`w≥2,h≥3`、不重叠、与 `reportRefs` 一对一）、窄屏 1 列只读。
6. 主题跟随、Intl 时区、最小 a11y（表格语义/图表摘要/键盘/对比度抽检）。

### M3（AI）

候选 schema + 本地 SQL 预检 + diff 预览 + `provenance` + 不发送结果行 + 失败不阻塞。

## 7. 待拍板事项（按决策门排序）

> Q1/Q2 已于 2026-10-22 落为 ADR-08/ADR-09（`docs/product/decisions.md`）；其余仍是设计修订提案，需在对应里程碑冻结前书面确认；未确认前按“建议”执行并保留复议条件。

| # | 问题 | 建议 | 影响 | 决策门 |
|---|---|---|---|---|
| Q1 | 结果过滤是否只作用于已取回样本，并在 UI 常驻提示？ | 已定（ADR-08；用户确认 2026-10-22） | data-model §5/§6、acceptance M1/M2 | 进 M1 前 |
| Q2 | 报表口径是否改为 `basis:{queryHash,fieldsHash,confirmedAt}`，废弃 `datasetVersionRef`？ | 已定（ADR-09） | data-model §5/§8、迁移链 | 格式 v0.1 冻结前 |
| Q3 | 草稿 autosave 到 `host.storage`（≤200 KiB、3s 节流、恢复需确认）是否与“保存是显式动作”冲突？ | 已定：草稿不算保存，恢复是一次显式操作（2026-10-22） | architecture §9、M0-5 | 已定 |
| Q4 | 打开看板是否自动取数？ | 已定：做成文档配置 `dashboard.onOpenRefresh`，默认 false（2026-10-22） | architecture §8.1、data-model §6、acceptance M2-9 | 已定 |
| Q5 | 行上限默认 500、作者可设 ≤5000；>2000 警告。是否加“按卡类型默认值”？ | 已定：默认 500、>2000 警告（2026-10-22）；卡类型默认值 M2 再议 | data-model §3、first-slice | M1 前 |
| Q6 | 是否保留 CSV 导出？ | 已定：不做任何文件导出（ADR-10），只查询+展示 | scope、roadmap M1、acceptance M1-6 | 已定 2026-10-22 |
| Q7 | Top-N 只做展示截断、不做“其他”桶、多序列 ≤4 是否接受？ | 已定：只显示前 N + 标注“显示 n / 共 M”，不做“其他”桶；多序列 ≤4（2026-10-22 用户选定） | data-model §5、M1/M2 | 已定 |
| Q8 | 把 `fileTransfer.pick/read` 打开路径列为 M0 Go/No-Go 硬条件？ | 已定：列为 M0 Go/No-Go；插件内自建 SQLite/本地库不可行（无持久化目录、storage 仅 UI 状态），见 P9 | first-slice §2/§4、P9 | 已定 |

## 8. 证据索引与未验证假设（H）

**F（可直接核对）**

- 宿主：`../dbx` @ `b160d130560f71c5c429be15cec6147f677a4b3a`（package 0.6.51）——`apps/desktop/src/lib/plugins/pluginHostBridge.ts`（`:19`、`:147`、`:289-299`、`:527-544`、`:839-843`、`:882-900`、`:932-975`、`:1476`、`:1493-1497`、`:1528-1546`、`:1600-1610`）、`apps/desktop/src/components/plugins/PluginWorkbenchHost.vue`（`:215-280`、`:316-331`、`:660-681`）、`docs/content/docs/plugin-development.mdx`（`:378`、`:389`、`:601`、`:610`、`:614`、`:623`、`:628`、`:642`）、`crates/dbx-core/src/query/plugin_data.rs`（行上限/字节/超时/并发约束）。
- 竞品（源码快照，非发行版）：Metabase `master@ba4e0c5a`；Superset `HEAD@3297c39`（6.1.0 = `c83fb2b`）；FineBI 7.X 官方文档（访问 2026-10-22，URL 见 §3）与 6.X 对照。
- 取证笔记（仓库外本地留存，不入库）：`metabase.md`、`superset.md`、`finebi.md`。

**H（未验证，M0/M1 必须关闭）**

1. 驱动序列化：SQLite/PG 的 `DECIMAL/NUMERIC/BIGINT/DATE/TIMESTAMP/TIMESTAMPTZ` 经 `queryData` 后的 JS 形态（字符串 or number、时区偏移写法）；以及 `JSON.stringify` 是否会抛错（BigInt/NaN）。
2. `truncated` 触发条件：是“行数达上限”还是“累计序列化字节超 8 MiB”，两者是否可区分；`elapsedMs` 是否含排队时间。
3. `queryData` 实际并发/超时行为：第 5 个请求是否被拒、60s 超时的错误码/文案、关窗是否真的不断（服务端仍执行）。
4. `fileTransfer` 真机行为：桌面 pick/read/cancel、句柄 64 上限、web dev-host 的 input fallback、drop 的 `truncated`/2000 文件上限。
5. `host.storage` 配额与失败行为：单值 256 KiB、总 1 MiB、1024 键、无 CAS 下的并发覆盖。
6. ECharts 6 + gridstack 14 在 CSP `default-src 'none'` + opaque origin 下的运行（无 eval/worker/远程字体）；包体积（ECharts 按需 542 KB min / 180 KB gzip 为已知参考，需实测）。
7. 宿主 AI completion 的真实限制（2048 tokens/16k 字符/单飞/错误码）与超时行为。
8. 三家产品的运行时行为（均未部署）：文中“H”标注处（如 Superset abort 是否真正服务端 kill、FineBI AI 确认流程）。

**已知未覆盖**：打印/PDF、订阅/告警、团队协作/评论、移动端、数据血缘、自动建模——均属硬边界之外，本文不展开。
