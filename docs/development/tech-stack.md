# 技术选型（v1）

> 状态：**已定**（2026-10-22 与负责人确认），作为 M0 起的实现约束。  
> 约束来源：[architecture.md](architecture.md)、[host/limits.md](../host/limits.md)、[product/decisions.md](../product/decisions.md)、[first-slice.md](first-slice.md)。  
> 版本为 2026-10-22 npm registry `latest` 快照；实际以 `pnpm-lock.yaml` 固定，升级须走 §8 流程。

## 0. 摘要

| ID | 项 | 决定 | 状态 |
|---|---|---|---|
| TS-01 | 编程语言 | TypeScript 5.9（`strict`），单一前端包 | 已定 |
| TS-02 | 运行时 | 浏览器 iframe（无 Node、无 sidecar）；Node ≥22.12 仅用于构建/测试 | 已定 |
| TS-03 | 前端框架 | Vue 3.5 Composition API + `<script setup lang="ts">` | 已定 |
| TS-04 | UI 组件 | 自研轻量组件 + DBX 注入的 CSS theme token，不引完整 UI 套件 | 已定 |
| TS-05 | 构建 | Vite 8 + `@vitejs/plugin-vue`，产物为相对路径静态文件（`ui/`） | 已定 |
| TS-06 | 状态管理 | `reactive`/`shallowRef` + composable / 纯 TS 状态机，不引 Pinia | 已定 |
| TS-07 | 文档与数据校验 | Zod 4：schema 即类型真相，另导出 JSON Schema 给 `data-model.md` | 已定 |
| TS-08 | 哈希与规范化 | 自写 canonical JSON + `@noble/hashes` sha256 | 已定 |
| TS-09 | 图表 | ECharts 6 按需注册（bar/line + canvas），M0 实测 CSP/体积 | 暂定（M0 决策） |
| TS-10 | 表格 | 自研语义化表格；M1 不引 TanStack | 已定（M1 后复议） |
| TS-11 | 测试 | Vitest 5 + happy-dom + `@vue/test-utils`；真机 E2E 手工 | 已定 |
| TS-12 | 规范工具 | ESLint 10 flat + typescript-eslint 8 + eslint-plugin-vue 10 + Prettier 3 | 已定 |
| TS-13 | 路由 | 不引 vue-router；视图枚举切换 | 已定 |
| TS-14 | i18n | 自研 typed 字典（zh-CN/en），日期数字只用 `Intl` | 已定 |
| TS-15 | 图标/字体 | 内联 SVG 组件 + 系统字体栈；无 icon 包、无字体文件、无 CDN | 已定 |
| TS-16 | 包管理与 CI | pnpm 12 + GitHub Actions；发布用官方 release 模板 | 已定 |

## 1. 语言与运行时

- **只写一个 TypeScript 前端包**，没有 Rust/Go sidecar：M0–M2 不需要原生能力，引入 sidecar 违反硬边界（`AGENTS.md` §2.7）且要另做信任边界评审。
- 选 TS 的理由：宿主全部 API 是 `window.dbxPlugin` 上的 JSON/JS 调用；`ProjectDocument` 与 AI 候选都是**不可信外部输入**，需要编译期契约 + 运行时校验双保险；`core/` 不碰 DOM 后可纯函数单测。
- 运行时没有 Node：iframe 内只有浏览器环境（`localStorage` 抛异常、无 `require`、无文件系统），构建期依赖不能进产物。

**TypeScript 5.9.3 而非 7.x**：`typescript-eslint@8` peer 为 `>=4.8.4 <6.1.0`，`vue-tsc@3` peer `>=5.0`；TS 7 是原生重写版，当前工具链未声明支持。复议条件：typescript-eslint 与 vue-tsc 均发布 TS 7 支持后再评估。

**Node ≥22.12**（Vite 8 engine `^20.19 || >=22.12`，Vitest 5 engine `^22.12`），与 DBX 要求的 Node 22 对齐。`@types/node` 固定 22.x 以匹配运行时。

## 2. 前端框架：Vue 3.5

选 Vue 而不是 Svelte/React 的理由：

1. **仓库既有文档已按 Vue 写死语义**：[architecture.md](architecture.md) §12「Vue 默认转义」、[release-and-security.md](../operations/release-and-security.md) T1「Vue 转义」。选 Svelte/React 会让这些安全论证与实现脱节。
2. **官方允许自管 Vue UI**：`plugin-development.mdx:947` 明确「`frontend` 用于 plain HTML 或 self-managed Vue/React UI」；官方 Svelte 模板只是 starter，不是唯一路径。
3. 中文生态与后续维护者经验：表单、表格、测试、调试资料最多。
4. Composition API 与 `ui → core → platform` 分层天然配合：状态与副作用集中在 composable，业务逻辑留在纯 TS。

**不用什么**（防止选型漂移）：

- 不用 Element Plus / Naive UI / Vuetify / shadcn-vue 等完整套件（见 TS-04）。
- 不用 Nuxt/SSR/`<Teleport>` 到父页面；插件是单页 iframe。
- 不用 Pinia/Vuex（TS-06）；不用 vue-router（TS-13）。
- 模板只用 `{{ }}` 与 `v-bind`；**禁止 `v-html`**（用户/AI 内容、报告标题、SQL 片段一律文本绑定）。

## 3. 架构实现决策

- **单包，非 monorepo**：`manifest.json`、`assets/`、`dbx-plugin.toml` 在仓库根；Vue 源码 `src/`；Vite 产物直接写 `ui/`（打包只收 `manifest.json`/`assets/`/`ui/`）。
- **分层依赖 `ui → core → platform`**：`core/` 禁止 import DOM/Vue/`window.dbxPlugin`；`platform/` 是唯一宿主边界。这条与 [architecture.md](architecture.md) §2 一致，是换框架/换图表库时唯一需要重写的边界的成本上限。
- **视图**：不引路由，`ui/workbench` 内用视图枚举（document / designer / preview）；M1 只有这套；出现深链需求再评估。
- **状态**：`core/` 的 Document/DatasetVersion/Report/Card 状态机是纯 TS 类（可单测）；UI 层用 `reactive` 包装，不把 `window.dbxPlugin` 塞进响应式对象（桥对象不可代理）。
- **异步与取消**：自写队列（并发 ≤2，宿主每 bridge 4）+ generation token 丢弃旧响应；不依赖宿主 cancel（宿主没有）。
- **错误**：`AppErrorCode` 字面量联合，与 [architecture.md](architecture.md) §7 的 code 表一一对应；错误文案走 i18n。
- **文件 I/O**：Zod 校验 → canonical JSON → `host.saveFile`；打开限 5 MiB，限制字段数/深度，拒绝 `__proto__`/`constructor` 键；不做自动保存。
- **安全实现约束**：无 `eval`/`new Function`/动态远程 `import`；样式走构建期 CSS（不依赖 `unsafe-inline` 的 JS 注入）；所有外部字符串只作文本节点。

## 4. 组件与技术选型（逐项）

### 4.1 图表：ECharts 6.1.0（TS-09，M0 定稿）

- 按需注册：`echarts/core` + `BarChart`/`LineChart` + `CanvasRenderer` + `GridComponent`/`TooltipComponent`/`LegendComponent`；`vue-echarts@8` 做容器与 resize/主题胶水。
- 为什么：Apache-2.0；canvas 渲染无需 DOM 测量混入；中文文档与主题能力最好；无 eval、无 worker 依赖。
- 体积目标：单图场景 chunk < 400 KB（gzip 前）；超 [architecture.md](architecture.md) §11 包体积预算需评审。
- 退化路径：CSP 拦截或体积不可接受 → 手写 SVG 柱/折线/数值卡（≤150 行），先做 bar 再补 line。
- 否决：Vega-Lite（可视化语法全家桶，超出需求）、Chart.js（主题与大数据降采样弱）、ECharts 全量包（体积）。

### 4.2 表格：自研 `<DataTable>`（TS-10）

- 需求只有：固定列、作者预设的结果过滤/排序/Top N、500–5000 行渲染、截断徽标。没有列拖拽、分组、透视、多级表头。
- 500 行直接渲染 DOM（实测目标 <200 ms，见 architecture §11）；>200 行的虚拟滚动**在 M2 有实测瓶颈后**再加，不预先引入。
- 不引 `@tanstack/vue-table`：headless 模型解决的是列模型/分组需求，当前不存在；复议条件：出现分组、透视、列固定或多级表头需求。
- 渲染前先把 rows 转成视图模型（`core/report` 负责字段映射/格式化），模板里不做计算。

### 4.3 校验：Zod 4.6.7（TS-07）

- 一个 schema 同时得到：TS 类型、运行时校验、错误路径；`z.toJSONSchema()` 导出给 `data-model.md`，避免文档与实现两份 schema 漂移。
- 不做 eval/codegen，兼容 `default-src 'none'`；跨字段与引用完整性（`datasetVersionRef` 存在、id 唯一、字段引用存在）手写校验函数，Zod 只管结构。
- 否决：Ajv（运行时 `new Function` 编译，CSP 风险；standalone codegen 增加构建步骤）、Yup/Joi（TS 推断弱）。

### 4.4 哈希与规范化（TS-08）

- `@noble/hashes` 的 sha256：纯 JS、无 eval、同步可测。
- 不用 `crypto.subtle`：iframe 是 opaque origin，secure context 判定不确定，`subtle` 可能不可用。
- canonical JSON：键序稳定、数字格式固定、拒绝 `undefined`；`queryHash = sha256(canonical({ connectionId, sql, params: null, maxRows, dbType }))`，文档 `contentHash` 用同一实现。

### 4.5 i18n（TS-14）

- 自研：`strings/zh-CN.ts` + `strings/en.ts`，key 由 TS 联合类型约束，缺 key 编译报错；`useI18n()` 读 `dbxPlugin.locale`。
- 只格式化静态文案；日期/数字/货币一律 `Intl.DateTimeFormat`/`NumberFormat`，不引 date-fns / dayjs / numeral。

### 4.6 图标与字体（TS-15）

- 图标：内联 SVG 组件（`<Icon name="run" />` 映射到 path 常量），不引 icon 包、不用远程字体图标。
- 字体：宿主 token 提供的系统字体栈，不打包字体文件（体积 + 许可）。
- 主题：监听 `dbxTheme`/`data-dbx-theme`，颜色/圆角/间距全部读 CSS 变量，不硬编码色值（图表主题色也从变量读取）。

### 4.7 测试（TS-11）

- Vitest 5 + happy-dom：`core/` 纯逻辑单测（schema、hash、队列/代际、错误映射、格式化、CSV 转义）；`ui/` 用 `@vue/test-utils` 做关键组件。
- 覆盖率：`@vitest/coverage-v8`，只对 `src/core` 设阈值（M1 起 ≥80% 行覆盖），UI 不强制。
- 不引 Playwright：真实 DBX UI 不在 CI；真机验证按 [acceptance.md](../testing/acceptance.md) 手工执行并留记录。
- 不写「复刻实现」的测试：断言用真实 fixture 输出（黄金数据 A01–A16 见 [test-strategy.md](../testing/test-strategy.md)）。

### 4.8 规范与工具链（TS-12）

- ESLint 10 flat config：`typescript-eslint@8` + `eslint-plugin-vue@10`（`vue-eslint-parser`）+ 少量规则（禁 `v-html`、禁 `eval`、禁 `console` 除诊断路径、`@typescript-eslint/no-floating-promises`）。
- Prettier 3 统一格式（Vue SFC 原生支持），`vue-tsc --noEmit` 做 SFC 类型检查。
- 脚本：`dev`（`dbx-plugin dev`）、`build`（`vite build`）、`typecheck`（`vue-tsc --noEmit`）、`test`、`lint`、`format`、`package`（`dbx-plugin package .`）。

### 4.9 包管理与 CI（TS-16）

- pnpm 12，提交 `pnpm-lock.yaml`；`engines.node >= 22.12`。
- GitHub Actions：`typecheck` / `lint` / `test` / `build` 四步；发布用官方模板 `templates/common/github/plugin-release.yml` 生成 unsigned universal 候选，签名在 DBX Store 侧完成，不本地签。

## 5. 版本基线（2026-10-22 快照）

| 包 | 版本 | 用途 |
|---|---|---|
| vue | 3.5.44 | 前端框架 |
| @vitejs/plugin-vue | 6.0.10 | Vite 插件 |
| vite | 8.3.5 | 构建 |
| typescript | 5.9.3 | 语言（不可升 7.x，见 §1） |
| vue-tsc | 3.3.13 | SFC 类型检查 |
| @vue/tsconfig | 0.9.1 | tsconfig 基座（要求 TS ≥5.8） |
| echarts | 6.1.0 | 图表核心 |
| vue-echarts | 8.3.2 | ECharts 的 Vue 容器 |
| zod | 4.6.7 | schema 校验 |
| @noble/hashes | 2.4.0 | sha256 |
| vitest | 5.0.5 | 单测 |
| happy-dom | 21.0.4 | DOM 环境 |
| @vue/test-utils | 2.5.1 | 组件测试 |
| @vitest/coverage-v8 | 5.0.5 | 覆盖率 |
| eslint | 10.13.0 | lint |
| typescript-eslint | 8.72.0 | TS 规则 |
| eslint-plugin-vue | 10.11.1 | Vue 规则 |
| vue-eslint-parser | 10.4.1 | SFC 解析 |
| prettier | 3.9.10 | 格式化 |
| pnpm | 12.14.0 | 包管理 |
| @dbx-app/plugin-cli | 0.1.9 | 脚手架/打包 |

宿主侧固定：DBX `b160d130`（0.6.51）、Host API `^1.4`、manifest v1、Node 22。

## 6. 被否决的方案

| 方案 | 否决理由 |
|---|---|
| Rust/Go sidecar | 违反硬边界（首版不引 sidecar）；增加安装/签名/信任成本，M0–M2 无原生需求 |
| Svelte 5（官方模板） | 可维护性/团队生态弱于 Vue；仅换 `ui/` 层即可切换，保留为备选 |
| React 19 | 体积更大、与宿主 Vue 心智不一致；无收益 |
| UI 套件（Element Plus/Naive UI/shadcn-vue） | 主题 token 双体系、包体积、大量用不到的组件；自研 6–8 个组件更可控 |
| TypeScript 7.x | 工具链 peer 未支持（typescript-eslint <6.1、vue-tsc） |
| Ajv | 运行时编译用 `new Function`，CSP 风险 |
| TanStack Table | M1 无列模型/分组需求；引入即负担 |
| vue-router / Pinia | 单页单文档，状态规模不足以支撑；YAGNI |
| 远程字体/图标/CDN | CSP + 无网络硬边界；包必须自包含 |
| Vega-Lite / D3 全量 | 可视化语法与绘图能力远超需求，体积/学习成本不划算 |

## 7. M0 必须验证的假设（H）

1. ECharts 6 在插件 iframe（`default-src 'none'`）内正常渲染，无 `unsafe-eval`、无 worker、无外部请求；记录单图 chunk 体积与许可文件。
2. Vue 3 生产构建产物不含 `new Function`/`eval`；`grep -r "new Function" ui/assets` 为空。
3. 500 行表格渲染 <200 ms；5000 行 × 20 列内存峰值 <100 MB（architecture §11 目标）。
4. `@noble/hashes` 在 opaque origin 下可用（纯 JS，预期可行）；`crypto.subtle` 不可用时的行为已确认。
5. `vue-echarts` 引入后的增量体积可接受；否则改为 30 行自写 composable。
6. pnpm 12 + Node ≥22.12 在 Windows 与团队机器上一致（含 `dbx-plugin` 全局 CLI 路径）。

## 8. 升级与复议

- 版本表随 lockfile 提交固定；升级 PR 必须附：typecheck / lint / test / build 全绿 + 真机回归范围（安装、授权、queryData、saveFile、图表）。
- DBX 基线升级时按 `docs/README.md` 维护规则 1 重核 Host API/权限/限制，不跟随 main 漂移。
- 各项复议条件写在对应小节；改选型必须在本文件「变更记录」追加一行，写日期、理由、受影响文件。

## 9. 变更记录

| 日期 | 变更 | 理由 |
|---|---|---|
| 2026-10-22 | v1：Vue 3.5 + TS 5.9 + Vite 8 + 自研组件 + ECharts 6（M0 定稿） | 与既有 Vue 安全论证一致；官方允许 self-managed Vue；避免 UI 套件与主题 token 双体系 |
