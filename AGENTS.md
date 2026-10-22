# AGENTS.md

> 项目：**dbx-report** — DBX 桌面插件，面向 SQL 作者的本地报表工具。作者写固定 SQL，把结果做成可重复打开的报表并组合成小看板；资产是本机 JSON 文件（`README.md`、`docs/README.md:10`）。
>
> 当前状态：只有 `README.md` + `docs/`（分析已完成），**M0 未开始**，D1–D5 范围决策**未书面拍板**（`docs/README.md:5`、`docs/development/roadmap.md:5`）。
>
> 宿主基线：DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（package 0.6.51），Host API 1.4.0，manifest v1，sidecar protocol v1。

## 1. 事实源与优先级

冲突时按此裁决：

1. DBX 源码（本机 sibling `E:\File\self\github\dbx`，只读参考）：`crates/dbx-plugin-runtime/src/plugins/manifest.rs`、`crates/dbx-core/src/query/plugin_data.rs` 等。
2. `plugins/manifest.schema.json`（创作契约，**不是**安全边界）。
3. `plugins/README.md`、`plugins/SIGNING.md`、`plugins/RELEASING.md`。
4. `docs/content/docs/plugin-development.mdx` 等上游文档。
   （第 2–4 条路径相对 DBX 仓库根，即第 1 条的 sibling 目录。）
5. 本仓库 `.agents/rules/`、`.agents/skills/` 与 `docs/`（分析结论）。

- 引用格式：`path:line` + 基线 commit；行号会漂移，引用前重核。
- 本仓库 `docs/` 用 **F**（源码/一手规范可核对）、**I**（由 F 推导的裁决）、**H**（待运行验证的假设）标注；报告中的对象、阈值、验收标准是**拟定**，不是宿主现状（`docs/README.md:57-62`）。
- 不把博客、README、竞品功能清单当能力证明；"版本号支持"≠"能力可用"；没证据的结论标 H。

## 2. 硬边界（任何里程碑都不得越过，`docs/README.md:47-55`）

1. 不实现、不承诺 DBX 宿主没有的 API；需要新增 Host API 的能力一律进"后续"，不当首版依赖。
2. 不给插件加连接凭据复制、绕过 `host.data:read` 授权、或直接连数据库的旁路。
3. 不把 SQL 参数做字符串拼接；首版不支持绑定参数与自由文本插值。
4. 不把截断结果标记为完整结果；不做"导出全量 CSV"。
5. 不做跨连接 JOIN、后台调度、无人值守刷新、团队 ACL、自动发布。
6. 不把 `host.storage` 或 tab 标题当资产库；正式资产是本机 JSON 文件。
7. 不引入 sidecar（M0–M2 不需要）；如后续引入，必须另做信任边界评审。

## 3. 宿主硬限制（F，不可绕）

| 项 | 限制 | 后果 |
|---|---|---|
| `queryData` 行数 | 默认 500，最高 5000 | 明细无法全量展示；靠数据库聚合 |
| 结果字节 | 序列化 rows 累计 **8 MiB** | 宽列/大 cell 提前截断 |
| SQL | 单条、只读分类、≤100000 字符 | 无多语句/临时表/写；只读≠无副作用 |
| 超时 | 执行 timeout 上限 **60 s**，非端到端 deadline | 慢查询排队；关窗不取消服务端 |
| 取消/分页/绑定 | **无** cancel、无 cursor、无 bind | "停止"只丢弃响应；不分页、不拼参数 |
| 并发 | 宿主每 bridge 4 个 data query | 插件内队列 ≤2、看板 ≤4 卡、显式排队 |
| 元数据 | 只能按已知表取列，不能枚举/发现主外键 | 不做自动建模 |
| 资产/存储 | `host.storage` 256 KiB/值、1 MiB、1024 键、无 CAS | 只存偏好/草稿，不存业务结果 |
| 保存 | `saveFile` ≤512 MiB/次、每次弹框、取消返回 `null`、无读取 API | 重开靠用户选文件/拖入 |
| UI | iframe `allow-scripts`、opaque origin、CSP `default-src 'none'` | 无 Tauri/父 DOM/网络/Node；`localStorage` 抛异常 |

关键规则：权限 ≠ 授权（`queryData` 每次重校验 grant）；`truncated=true` 只可样本预览；所有"完整/最新/已保存"字样必须有真实依据。详见 `.agents/rules/data-and-security.md`。

## 4. 产品不变量（8 条，`docs/product/scope.md:54-61`）

1. SQL 是计算真相，指标词典只解释 SQL 输出字段，不生成 SQL。
2. 作者负责口径，读者只操作作者预设的结果过滤/排序。
3. AI 只交候选，人工确认才保存；不自动发布、不自动扩大权限。
4. 本机 JSON 文件是正式资产；`host.storage` 只存偏好和有限草稿。
5. 截断不是完整：`truncated=true` 只可样本预览，不可作为正式总计或"完整导出"。
6. 保存是显式动作：取消保存不得显示"已保存"；关窗不保证自动持久化。
7. 刷新不是事务快照：看板逐卡显示取数时间，不给单一"截至时间"。
8. 只读分类不是权限：必须配数据库只读/最小权限账号，分类器不是副作用证明。

## 5. 决策状态（必须原样保留）

- ADR-01~04：**暂定**（SQL 为计算真相；作者写/审 SQL；AI 候选 + 人工确认；本机 JSON 为资产）。`docs/product/decisions.md:6-36`。
- ADR-05：**已定（2026-10-22）** 技术栈 TypeScript + Vue 3.5 + 自研轻量组件 + Vite 8，单一前端包、无 sidecar、不引路由/状态库；版本基线 `docs/development/tech-stack.md:138-164`。
- ADR-06：**已定（2026-10-22）** 看板布局用 12 列网格吸附 + 自研 Pointer Events/CSS Grid 拖拽；像素级自由画布与布局引擎不做（`docs/product/decisions.md:46-52`、`tech-stack.md` TS-17、`architecture.md` §8.1）。
- D1–D5：**待定**，会阻塞里程碑（目标用户 SQL 能力、文件式资产、AI 边界、首发库/规模、数据与许可政策）。决策门：D1/D2 进 M1 前，D4 M1 范围冻结前，D3 进 M3 前，D5 发布前（`roadmap.md:35-39`）。
- **未拍板约束**：可以做 M0（不影响范围的技术验证），不得对外承诺 MVP 或排期 M1+（`decisions.md:64`、`roadmap.md:41`）。
- 命名 `io.dbx.report` 是建议方案，未向 `t8y2/dbx-store` 确认；manifest id 发布后不可改。
- MVP 承诺表含折线图/数值卡，但 M1 只做 table/bar——属后续里程碑补齐，不得在 M1 宣称 MVP 达成。

## 6. 通用工作规则

### 6.1 任务判断与改动边界

- 先确定目标、范围、约束与可验证的完成标准；缺关键信息才提问，低风险可逆决策自己做，不做重复确认。
- 用户方案有实质问题时说明具体理由与替代方案，再按用户的知情决定执行。
- 只改当前需求必要的代码、配置、测试、文档；不顺手重构、清理、格式化；不覆盖他人改动；改动使代码/引用/兼容逻辑失效时，确认用途后删除。
- 必需的注释、README 同步、测试、废弃代码清理属于当前任务，不因"最小改动"省略。
- 范围外的问题只报告影响，不擅自扩大修复范围；破坏性操作需获得授权。
- 开发过程信息隔离：设计文档、里程碑、任务号、验收条件只作实现依据，不进入产品文案、UI 或注释（除非功能本身需要）。

### 6.2 探索与计划

- 动手前读适用的 AGENTS.md、`.agents/rules/`、README 与当前状态；从相关代码/调用方/类型/测试/配置/依赖入手，只扩张到解答具体问题。
- 结论基于源码、类型、配置、实测或权威文档；外部资料必须匹配项目实际版本；区分事实与推断，不臆造 API/配置/依赖/执行结果。
- 简单任务直接做；多步/有依赖/有不确定性的任务先列短计划（步骤、依赖、验证方式），新证据推翻假设时改计划。

### 6.3 设计与实现

- 按上下文取优先级：架构/需求分析 First Principles→YAGNI→KISS→SOLID→DRY；新功能 YAGNI→KISS→SOLID→DRY→First Principles；小函数 KISS→DRY；复杂对象建模 First Principles→SOLID→YAGNI→KISS→DRY。
- 选最简单且完整的实现；不为未确认的未来需求加抽象/配置/扩展点/兼容层；复用仅当重复真实、稳定、语义等价。
- 遵循项目既有语言/命名/风格/目录；保持模块职责清晰；改公共接口、行为契约、持久化格式前查调用方、消费方与数据；小范围修改，不无谓劈文件/挪目录。
- 控制结构一律用 `{}`（含单语句 `if/else/循环`）；逻辑块之间留空行；避免过度嵌套与复杂表达式。

### 6.4 注释与 README

- 新建或实质修改的代码在适用层级加注释：文件、类、实体/数据模型、方法/函数、关键业务逻辑、关键循环、关键分支。
- 注释说明职责、意图、业务约束与不显然的原因，不复述语法；保持准确，代码改动时同步更新；不为无关旧代码补注释。
- 根 `README.md` 描述目的、核心功能、技术栈、结构、安装/配置/运行/使用；**每个项目维护的内容目录都要有 `README.md`**（说明职责、内容、关系、依赖、约束），新增目录补 README，变更时同步检查本目录与父目录 README。
- 缓存、构建产物、版本控制内部目录、第三方目录豁免。

### 6.5 验证与失败处理

- 按改动范围与风险选验证：跑仓库要求的检查、验证受影响功能/接口/边界/调用关系；有明显回归风险时加测试；不为低风险改动机械加测试；不写只复刻实现的测试。
- **真机验证才算集成通过**；真实 DBX UI 不在 CI 跑；"单测绿"、"没报错"都不是集成/安全验证。
- 失败先看错误与证据，判断来源（当前改动/既有问题/环境），在范围内修复后重跑；不隐瞒失败、不删有效测试、不降标准、不无证据地重试同一操作。
- 阻塞时暂停依赖项、继续独立工作；说明阻塞、已尝试、所需最少信息/权限/决策。
- 不声称未执行的检查已通过。

### 6.6 协作与交付

- 子代理只用于可独立拆分、能省时或提质的工作；耦合紧、需顺序决策的留在主 agent；定义输入/输出/范围/完成标准，避免写冲突；主 agent 复核证据并对最终结果负责。
- 交付按需报告 **Changes / Verification / Documentation / Remaining Issues**，省略空节，附路径、命令、证据；不臆测、不夸大、不编造。
- 沟通先给结论与影响，再给必要的决策、风险、证据；直接简洁，不做无意义的过程叙述；有实质风险或分歧直接说并给理由；只对假设性风险提警告属于噪音。
- 无确认的完成声明不算完成。

### 6.7 前端 UI

- 涉及 UI/布局/排版/交互/动画/响应式时，优先使用已安装的相关技能（本机有 `impeccable`、`frontend-design`、`audit`、`polish`、`harden`、`optimize`、`typeset`、`colorize` 等），按任务目标选择，不执行无关工作流。
- 保持既有设计系统、品牌、token、组件约定；不无授权改变视觉风格或重设无关界面；动画必须有目的且不干扰操作。
- 完成后在环境允许时检查真实渲染、关键交互与响应式布局；不凭代码推断视觉正确，也不声称未做的验证。

## 7. 开发工作流

1. 读 `.agents/rules/`（至少 `plugin-contract.md`、`data-and-security.md`；做产品取舍再读 `product-scope.md`）与 `docs/development/first-slice.md`。
2. 只在 M0 范围内实现最小 UI-only workbench：打开 → 执行固定 SQL → 渲染 → 另存 JSON → 重开 → 再执行。
3. 按 `docs/development/tech-stack.md`（TS-01~17）初始化工程：`dbx-plugin create dbx-report --template frontend` 生成 manifest/assets/打包配置，前端用 Vite + Vue 自建（`src/` → `ui/`）；`dbx-plugin dev` 迭代 UI（Node 22+，dev-host 无数据 API）；`dbx-plugin package` 出未签名 `.dbxp`。
4. 真机：插件中心开启「Allow unsigned development packages」→ 本地安装 → 过真机检查点（`window.dbxPlugin`、`capabilities.dataApi`、授权弹框、取消保存、无 CSP/postMessage 报错）。
5. 记录 `docs/development/records/<date>-m0.md`（环境、命令、脱敏截图、错误、图表库结论、go/no-go）；更新 roadmap 状态与 acceptance 签收。
6. 需要平台操作细节时读 `.agents/skills/dbx-plugin-dev/`；查 DBX 数据库用 `.agents/skills/dbx/`。

## 8. 测试与证据

- 分层 L0–L6：宿主契约、单元、真机集成、数据正确性、AI 评估、安全、发布（`docs/testing/test-strategy.md:10-16`）。
- 宿主契约测试在 DBX 仓库根跑 8 个 Vitest 文件；2026-10-22 实测 155 项通过（7.34s），重跑前视为历史数据。Rust 侧 5 条契约测试**未运行**（H）。
- V1–V8 验证活动与淘汰门槛见 `docs/testing/test-strategy.md:22-29`；黄金数据 A01–A16 / PG P01–P07。
- 任何"已验证"附命令、环境、日期；未运行保持 H。日志不含 SQL 字面量、结果值、token、连接串。

## 9. 文档与规则维护

- 文档地图与阅读顺序：`docs/README.md:12-20`（scope → capabilities/limits → roadmap/first-slice → architecture/data-model → test-strategy/acceptance → analysis → decisions/naming）。
- 五条维护规则（`docs/README.md:64-70`）：宿主变化改 `docs/host/` 与证据索引并更新基线；范围变化先改 decisions 再改 roadmap；里程碑结束更新 acceptance/roadmap 状态；"已验证"必须附命令/环境/日期；技术选型/版本变更先改 `tech-stack.md`。
- 决策改动必须写日期、理由、替代方案、复议条件；影响范围的决策同步 scope 与 roadmap。
- 本文件与 `.agents/rules/`、`.agents/skills/` 同步；规则以 `path:line` 为证，不复制 `docs/` 全文；过时规则删除，不留兼容层。

## 10. 禁止事项（常见错误）

1. 照抄 `plugins/README.md` 的 manifest 示例（缺 `publisher`）或用错误权限拼写。
2. 用 `localStorage`、父页面通信、Tauri 对象绕过沙箱。
3. 声称 `queryData` 可取消/分页/绑定参数，或声称"停止"已停数据库。
4. 用 dev-host 验证数据路径；把单测绿当作集成通过。
5. 把 `host.storage`、tab 标题、内存状态当正式资产库。
6. 把截断/失败/取消结果展示成"完整/最新/已保存"。
7. 在 D1–D5 未拍板前承诺 MVP/排期；把拟定阈值写成宿主现状。
8. 编造命令（`dbx-plugin build`/`validate`）、测试结果或包体积数据。
9. 申请无业务需要的权限（`host.network`、`host.clipboard:read` 等）或引入 sidecar。
10. 引入 CDN、远程字体/图标、遥测，或把凭据/SQL 字面量写进日志与文档。
