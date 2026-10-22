# prototype/ — 静态 HTML 原型（P0 阶段资产）

本目录是**开发前确认用的原型**，不是产品代码，也不会打进 `.dbxp`。

- 目的：在写实现前，把信息层级、交互入口、失败文案与样本语义定下来（[ADR-11](../docs/product/decisions.md)、[delivery-plan.md](../docs/development/delivery-plan.md) §4、[prototype.md](../docs/development/prototype.md)）。
- 形态：纯静态 HTML + CSS + 少量原生 JS，无构建、无依赖、无网络请求，双击即开（`file://`）。
- 边界：**不连宿主**、不跑真实 SQL、不读真实连接，数据全部来自 `mock.js`；因此不能用原型证明任何宿主能力，能力结论以真机（M0）为准。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 索引页：五个屏幕入口、需要确认的问题清单、已知限制 |
| `tokens.css` | 宿主注入 token 的**本地镜像**（`--color-*` / `--radius-*` / `--font-*`，亮/暗两套）；将来直接演进为 `ui/styles/tokens.css` |
| `app.css` | 组件类与密度尺度（`.btn`/`.table`/`.alert`/`.card`/`.dash` 等）；将来演进为 `ui/styles/` 的基础层 |
| `proto.js` | 原型的场景/主题/对话框/toast/表格渲染；只在原型里用，不进产品 |
| `mock.js` | 假数据：连接、样本结果、报表、看板、24 条错误码 |
| `screens/*.html` | 五个屏幕，每屏多个可切换场景 |

## 打开与切换

直接打开 `index.html`，或单独打开 `screens/<page>.html`。

- 顶部原型条：`场景` 分段按钮切换状态；`暗色/亮色` 切主题（同步 `location.hash=#dark`，可直接用 URL 打开暗色）。
- **深链约定**：主题占用 `#hash`，所以场景只能用 query 传——`screens/report.html?scenario=stale`。无 query 时显示该页第一个场景，非法 id 回落到第一个场景。
- `proto.js` 只对 `.scenario[data-scenario]` 做显隐，所以场景容器必须写成 `<section class="scenario" data-scenario="id">`；工具条按钮由 `data-proto-scenarios` 自动生成，页面不要手写。
- 页面内 `data-proto-dialog` 按钮开对话框，`Esc` / 点背景 / 「取消」关闭。
- 目标视口 1280×800；窗口更窄时部分屏幕会走内部滚动，属预期。

## 改原型时

1. 先确认要改的是**契约**（`tokens.css` / `app.css`）还是**某一屏**（`screens/*.html`）；契约改动会影响所有屏幕，改完要在 `docs/development/prototype.md` 记一笔。
2. 新增场景：在页面里加 `<section class="scenario" data-scenario="id">`，并把 `{ id, label }` 加进该页的 `window.PROTO_SCENARIOS`。
3. 新增组件类：只加进 `app.css`，并同步 `docs/development/prototype.md` 的映射表；不要为单屏写一次性全局类（用页级前缀，如 `.wb-` / `.db-` / `.st-`）。
4. 不引入构建、包管理、CDN、外链字体/图标；不用 `localStorage`、`fetch`、`alert`。
5. 改完必须真实渲染检查（浏览器打开 + 亮/暗各看一遍），不接受「代码看起来对」。

## 与产物的关系

原型确认后：`tokens.css` → `ui/styles/tokens.css`；`app.css` 的组件类 → `ui/components/*`；屏幕布局与状态 → 各视图组件；`proto.js`/`mock.js` **不迁移**（host bridge 与真实数据替代）。映射表见 [docs/development/prototype.md](../docs/development/prototype.md)。

## 已知限制

- 暗色主题下宿主 `--color-chart-*` 是灰阶（第 4、5 档几乎不可读），图表只用 1–3 档；这是宿主现状，不是原型缺陷。
- 拿不到 Geist 字体，回退到系统字体栈；行宽与字号需按回退字体评估。
- mock 数据是手工构造的样本，不代表真实数据分布，不能用来做性能判断。
- 「已取回 500 行」的截断场景只放少量示意行，表体行数与「已取回行数」不一致是简化（口径见 `docs/development/prototype.md` §5.1）。
- 看板「编辑布局」场景的卡体是占位块，只演示位置、尺寸与手柄，不代表真实卡片内容。
