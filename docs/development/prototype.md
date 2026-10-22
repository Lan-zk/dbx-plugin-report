# P0 原型（屏幕清单与评审）

> 状态：**原型 v1 已产出，待确认**（2026-10-22）。入口 `prototype/index.html`。
> 依据：[ADR-11](../product/decisions.md)（原型先行）、[delivery-plan.md](delivery-plan.md) §4（P0 阶段）、[roadmap.md](roadmap.md)（P0 里程碑）。
> 原型**不证明宿主能力**：不连宿主、不跑 SQL、不读连接，全部数据来自 `prototype/mock.js`。

## 1. 目的与边界

目的：在写实现前确认 ①信息层级（谁在哪一层看到什么）②交互入口（保存、运行、编辑、刷新的落点）③失败与样本语义的文案口径 ④组件密度与视觉基线。

边界：
- 只覆盖五个屏幕与关键状态，不追求像素级还原，不覆盖主题定制与窄屏全场景。
- 不引入构建链、依赖、网络；`file://` 直开，便于评审时随手打开。
- mock 数据手工构造，**不能**用于性能或数据正确性判断。
- 原型代码不进产品包；`tokens.css` / `app.css` 的结论会演进为 `ui/styles/`（见 §6）。

## 2. 资产

| 文件 | 内容 |
|---|---|
| `prototype/index.html` | 索引页：五屏入口、需确认的问题、已知限制 |
| `prototype/tokens.css` | 宿主注入 token 的镜像（`--color-*`/`--radius-*`/`--font-*`，亮暗两套） |
| `prototype/app.css` | 组件类与密度尺度（`.btn`/`.table`/`.alert`/`.card`/`.dash`/`.kpi` 等） |
| `prototype/proto.js` | 场景切换、主题切换、对话框、toast、表格渲染（仅原型用） |
| `prototype/mock.js` | 连接、样本结果、报表、看板、24 条错误码样本 |
| `prototype/screens/*.html` | 五屏 |

## 3. 屏幕与场景清单

| 屏 | 文件 | 场景 | 要确认的点 |
|---|---|---|---|
| 工作台 | `screens/workbench.html` | 空态 / 已保存 / 未保存 / 源绑定异常 | 打开与保存的落点；「另存为」每一次都弹框的说法；不做「最近文件」是否可接受 |
| 数据集 | `screens/dataset.html` | 未绑定 / 运行中 / 成功样本 / 截断 / 失败 / 字段契约 | 运行与停止等待的位置；截断文案力度；字段契约（transport、精度）是否要作者逐个确认 |
| 报表 | `screens/report.html` | 设计态 / 表格预览 / 柱状预览 / 口径漂移 / 边界（空结果·全 NULL·高基数·大数） | 配置放左栏是否符合直觉；Top-N 与「样本内」措辞；口径漂移的两种动作够不够 |
| 看板 | `screens/dashboard.html` | 阅读 / 刷新中 / 编辑布局 / 过滤器 / 窄容器 | 逐卡时间是否足够表达「非快照」；编辑模式是显式开关还是随时可拖；过滤器放顶部还是侧栏 |
| 状态与错误 | `screens/states.html` | 错误码总表 / 内联·行内·轻提示·横幅 / 对话框 / 全屏阻断 / 空态 | 24 条错误码的「呈现形式」是否合理；哪些必须弹框；空态是否都有下一步 |

每屏内切换场景用原型条的分段按钮；亮暗用右侧按钮（或 URL 加 `#dark`）。

## 4. 需要您裁定的五个点（默认答案已写进原型）

| # | 问题 | 原型默认 | 备选 |
|---|---|---|---|
| Q1 | 保存触点放哪 | 顶栏常驻「另存为…」，状态区只显示「已另存为 10:24」；草稿不进顶栏 | 状态栏图标 + 菜单项；启动时提示「恢复草稿」 |
| Q2 | 截断怎么说 | 结果区常驻横幅「这是样本：已取回 500 行（上限 500）」，并禁用总计/占比/其他桶 | 轻量徽标 + 悬停解释（风险：容易被忽略） |
| Q3 | 看板刷新怎么表达 | 每卡显示自己的取数时间，顶部声明「各卡独立取数，本页不代表统一快照」 | 顶部显示「最早/最新」时间范围（仍不是统一时间） |
| Q4 | 布局编辑入口 | 顶栏「编辑布局」显式模式，拖拽仅在该模式下可用 | 卡片悬停出拖拽手柄（误操作风险更高） |
| Q5 | 过滤器放哪 | 看板顶栏下一行的 chip 条 | 左侧常驻面板（占宽度，但定义更完整） |

这五点确认后写入 ADR（新增 ADR-12「原型确认结论」），之后实现不再自由发挥。

## 5. 评审清单（逐条打勾）

打开 `prototype/index.html` 后按此走查；任一条不通过，记录「屏 / 场景 / 期望」。

1. **层级可辨**：一眼能看出当前在文档、数据集、报表还是看板层；侧栏与内容区职责不混。
2. **保存语义不可误解**：仅「另存为」；取消＝未保存；不暗示回写原文件或拿到路径；无自动保存字样。
3. **样本语义处处一致**：样本结果、截断、报表预览、看板卡都写明「已取回 N 行（上限 M）」；截断时无总计/占比入口。
4. **零导出**：任何屏幕都找不到导出/下载/复制为表格。
5. **失败都有出口**：每个错误都有重试/改设置/明确说做不到；不出现「未知错误」。
6. **无 cancel 的诚实表达**：「停止等待」且说明响应被丢弃、服务端可能仍在执行。
7. **非快照**：看板没有统一「截至时间」；失败卡保留旧数据并标注旧数据时间。
8. **术语一致**：数据集/字段契约/口径/样本/取数/源绑定/另存为/已取回 N 行，全篇无第二种叫法。
9. **数据语义**：大数按字符串展示、不转 number；合计只来自 SQL 标记行；过滤/排序只作用于已取回行。
10. **视觉基线**：密度适合桌面（正文 13px、控件 28px 高）；间距成体系；暗色下表格、徽标、代码块可读。
11. **视口**：1280×800 无横向滚动；溢出在容器内部滚动。
12. **与数据模型对齐**：报表配置项（视图类型、x/y、limit、totals、basis）都能在 `data-model.md` 找到对应字段，没有凭空多出的配置。

## 5.1 原型内已定的口径（2026-10-22，实现阶段照此写）

这几条是产出原型时定下来的小口径，评审时不必再争；要改就写明「屏 / 场景」一起改。

1. **「样本 8/8」**＝已取回的 8 行全部拿到、未截断（不是被截掉后剩下的样本）；截断场景一律写成「已取回 500 行（上限 500）」。行数含 SQL 合计标记行，`rowsReturned` 语义由 `data-model.md` 定义，原型不另立。
2. **文本列 transport**：`data-model.md` 的枚举目前没有 `string`，数据集契约场景仍显示 `string` 并标注「需拍板」。候选：加 `string`，或文本列留空只标「非数值、不参与精度保真」。**未定，不阻塞 P0**。
3. **看板编辑态卡体**：用占位块，只演示位置/尺寸/手柄，不代表真实卡片内容。
4. **过滤器映射计数**：按整本看板（6 卡）统计，预览只放 3 张缩略卡不改变计数；计数与预览范围在文案上分开。
5. **失败卡出口**：卡内给「重试」+「打开报表」；需要改配置的失败（`RESULT_TOO_LARGE`、`QUERY_TIMEOUT`）到报表页给「改设置」，卡内不复制完整修复流程。
6. **深链**：主题用 `#light`/`#dark`，场景用 `?scenario=<id>`；无 query 显示第一场景，非法 id 回落。
7. **表格行数示意**：500 行的场景只放少量示意行，「已取回行数」与表体行数不一致是原型简化，不是语义错误。
8. **可读性下限**：宿主 token 原样镜像，但 `muted-foreground` 落在 muted 底上约 4.3:1、warning/error 文字在浅底上 2.7–4.0:1，未达 AA。组件层（`app.css` 末尾「可读性下限」块）用 `color-mix(…, var(--color-foreground))` 把文字压深——暗色下 foreground 是浅色，同一规则两主题都成立。装饰字形（拖拽手柄、空态图案）与原型 chrome（工具条、琥珀批注）不受此约束。

## 6. 原型 → 实现映射

| 原型资产 | 实现落点 | 说明 |
|---|---|---|
| `tokens.css` | `ui/styles/tokens.css` | 值来自宿主注入；插件侧只消费 `--color-*`/`--radius-*`/`--font-*`，不得引用 `--dbx-*` |
| `app.css` 布局类 | `ui/styles/layout.css` | `.topbar`/`.sidebar`/`.content`/`.pane`/`.scenario` |
| `app.css` 组件类 | `ui/components/*` | 自研轻量组件（ADR-05）：Button/Badge/Alert/DataTable/Field/Dialog/Empty/Meter/DashGrid |
| `screens/workbench.html` | `ui/views/WorkbenchView.vue` | 文档生命周期 + 源绑定；对应 view 枚举 `document` |
| `screens/dataset.html` | `ui/views/DatasetView.vue` | 对应 `document` 下钻；SQL 编辑、运行、样本结果、字段契约 |
| `screens/report.html` | `ui/views/ReportView.vue` | 对应 `designer`；预览为 `preview` 语义 |
| `screens/dashboard.html` | `ui/views/DashboardView.vue` | M2 实现，布局用 gridstack（ADR-07） |
| `screens/states.html` | 开发期预览页（不进产品） | 错误码与空态作为实现对照，产物是各视图内的真实状态 |
| `proto.js` 的表格/格式化 | `ui/components/DataTable.vue` + `core/format.ts` | 数值格式化必须区分 transport（decimal_string 不转 number） |
| `proto.js` 场景切换 | **不迁移** | 产品内没有场景切换器 |
| `mock.js` | `tests/fixtures/*` | 作为测试夹具，不随包发布 |

状态机与错误码对应关系见 [architecture.md](architecture.md) §7；字段与限制见 [data-model.md](data-model.md)。

## 7. 错误码呈现形式（States 页摘要）

| 呈现形式 | 代表错误码 | 出现位置 | 必须给的出口 |
|---|---|---|---|
| 全屏阻断 | `HOST_API_UNSUPPORTED`、`PLUGIN_PERMISSION_DENIED`、`FORMAT_VERSION_UNSUPPORTED` | 打开/启动时 | 说明原因 + 可行替代（换文件/升级/联系管理员） |
| 内联结果区 | `SQL_REJECTED`、`QUERY_TIMEOUT`、`RESULT_TOO_LARGE`、`QUERY_TRUNCATED` | 数据集结果面板 | 改 SQL / 降低 maxRows / 在 SQL 里聚合 |
| 行内 | `BINDING_REQUIRED`、`BINDING_AMBIGUOUS`、`BINDING_MISMATCH`、`CONNECTION_NOT_OPEN`、`CONNECTION_UNSUPPORTED`、`DATA_ACCESS_NOT_GRANTED` | 源绑定列表、卡片角标 | 选连接 / 重新授权 / 换源 |
| 徽标 | `SCHEMA_MISMATCH`、`SCHEMA_DRIFT` | 报表与卡片 | 重新确认契约（对话框） |
| 对话框 | `ABANDONED`、`SCHEMA_DRIFT`（确认）、丢弃未保存更改 | 刷新中断、漂移确认、关窗 | 重试 / 保留旧口径 / 返回 |
| toast | `FILE_CANCELED`、`DRAFT_SAVE_FAILED`、`STORAGE_QUOTA` | 另存取消、草稿失败 | 不阻断操作，可重试 |
| 卡片状态 | `ABANDONED`、`QUERY_TIMEOUT`（卡内）、`AI_UNAVAILABLE`、`AI_REFUSED` | 看板卡片 | 单卡重试 / 保留旧数据标注时间 |

完整 24 条（含义、可重试方式、里程碑归属）见 `prototype/screens/states.html` 的「错误码总表」场景。

## 8. 确认流程

1. **自检（已完成）**：逐屏逐场景无头浏览器截图，亮/暗各一轮；检查渲染、溢出、对比度。
2. **您走查**：打开 `index.html` → 按 §5 清单逐条 → 用「屏 + 场景编号 + 问题 + 期望」反馈（例如：`dataset/truncated：横幅太吵，希望改成一行`）。
3. **裁决**：确认通过 → 原型冻结 v1.0，按 §6 进入 M0；需修改 → 只改被点名的屏，不重做全量；有争议的默认值 → 登记 ADR 后再实现。

冻结后如需再改：改哪屏写哪屏，并在本文件底部「变更记录」加一行（日期 / 屏 / 改动原因），避免原型与实现悄悄分叉。

## 9. 变更记录

| 日期 | 范围 | 改动 |
|---|---|---|
| 2026-10-22 | v1 | 初版五屏（工作台 / 数据集 / 报表 / 看板 / 状态与错误），含亮暗主题与场景切换 |
| 2026-10-22 | v1 收尾 | 修 `proto.js` 场景显隐把工具条按钮一起隐藏的 bug（选择器收窄到 `.scenario[data-scenario]`）；index 场景标签与各屏对齐（设计态 / 编辑布局）；看板失败卡补「打开报表」出口；截断文案统一为「不是完整结果」；transport 说明改为标注待拍板；`mock.js` 源别名补到 5 个且 `src_ops` 标必需；`app.css` 增「可读性下限」块（徽标/表头/次要文字/看板说明条压深到 ≥4.5:1，暗色不变暗） |
