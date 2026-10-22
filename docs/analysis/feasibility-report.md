# DBX 宿主端 BI 插件：可行性、能力边界与范围裁决

日期：2026-10-22（Asia/Shanghai）  
源码基线：`b160d130560f71c5c429be15cec6147f677a4b3a`（DBX main HEAD，0.6.51）。分析阶段未实现插件、未构建 DBX、未制作 UI 稿。证据路径按 DBX 仓库根解析，行号对应上述基线。

**服务的决策与读者。** 供 DBX 维护者、插件负责人和安全审核者判断：是否立项、首版承诺什么、哪些需求应等宿主扩展。结论是工程范围建议，不是已运行产品的可用性证明。

**阅读约定。** F＝代码或一手规范可直接核对的事实；I＝由事实推导的裁决；H＝尚待运行验证的假设。E 为本仓库证据，X 为外部一手来源，V 为验证方案。拟定的对象、限制、验收阈值均是 I，不能当作宿主已有行为。正文不含表格与附录，控制在 6000 字内。

## 1）结论摘要

**建议有条件立项为“本机 SQL 报表作者工具”，不承诺完整 BI 平台。** 宿主已经提供安全边界明确但有局限的 UI 桥、SQL 查询和文件保存；没有报表资产、语义编译器、团队发布与协作契约。首版应让懂 SQL 的作者把固定查询变成可重复打开的报表，再组合成小型看板。是否满足真实工作量，要由 V2/V3 的运行验收决定。[E01–E10；V1–V3]

| 必须先裁决的分叉 | 本次决定（I） | 理由与改变决定的条件 |
|---|---|---|
| 自持语义层 vs 纯 SQL 工具 | **纯 SQL 工具**；附带版本化的输出字段指标词典 | 不承担跨模型 join、自动换维度、跨方言编译；若无 SQL 用户成为主要读者，重新立项语义层，不暗中扩充模板。[E02/E03；X1–X3；V3] |
| 作者工具 vs 自助分析 | **作者工具**；读者仅操作作者预设的视图过滤 | 宿主只有单表列元数据，缺少关系与指标语义；自助分析需要另一套建模和正确性保证。[E03；V3] |
| AI 草稿 vs AI 自动发布 | **AI 草稿，人工验证与保存** | 文本生成可用；工具链与发布闭环不是现成 BI 能力。组合 Agent 路线有条件可行，留后续 spike。[E06/E07；V4/V5] |
| 本机资产 vs 团队共享 | **本机文档资产** | 首版以可导入导出的定义文件为准；云同步不等于 ACL、协作和共享服务。“本机”不意味着永不离机。[E08；V6] |

MVP：桌面、前端插件、单连接文档、手写/AI 辅助固定 SQL、表格/柱线图/数值卡、最多四张报表组成一个看板、手动刷新、JSON 定义和当前结果 CSV 导出。拟认证首批 SQLite/PostgreSQL；未通过真实数据库验收不得对外标“支持”。Dock、浮窗、PNG/SVG、SQL 参数、MCP 草稿写入列后续。首版不需要新增 Host API；若坚持绑定参数、确认取消、任意连接自动化或团队发布，必须另行裁决宿主/服务扩展。

## 2）宿主能力 → BI 需求矩阵

| BI 需求 | F：现有宿主能力与硬限制 | I：产品规则与降级 | 责任 / 证据 / 验证 |
|---|---|---|---|
| 版本与权限 | Host API **1.4.0**，manifest v1，sidecar protocol v1；能力仍需逐项探测 | engines 至少 ^1.4；缺 dataApi 禁止刷新，缺 AI 仍可手工创作；不凭版本号假定浮窗/流式生成存在 | 宿主探测、插件降级；E01/E04；V1/V2 |
| 数据源选择 | connections:read 返回无凭据摘要，列出连接不代表已授权查询；dialect 字段实际填 db_type | 保存逻辑数据源别名，打开后由人映射本机 connectionId；认证方言由插件确定，不能把该字段当完整 SQL profile | 插件映射；E02/E10；V2/V3 |
| 取数 | 一次一个连接、一条被分类为只读的语句；无 bind/cursor/executionId | SQL 在数据库聚合；不抓明细拼全量、不用 LIMIT 分批绕上限、不把客户端筛选当全库条件 | 宿主执行，插件作者约束；E02；V3/V7 |
| 资源 | 默认500、最高5000行；最终 rows 累计8 MiB；SQL 100000字符；执行 timeout 配置上限60秒；每 bridge 4并发 | MVP每文档队列并发≤2、最多4卡片；超限/失败逐卡说明；不宣称60秒必返回或8 MiB峰值内存 | 插件调度；E02/E11；V3/V7 |
| 完整性 | 返回 truncated，无总行数/截断原因/续读游标 | truncated=true 只可样本预览，禁止正式总计和无标记导出；要求作者减少分组或修改SQL | 插件质量门；E02；V3 |
| 停止 | queryData 无取消接口；AI流式取消是另一接口 | “停止等待”只丢弃旧响应并停止后续调度，不声称数据库已停止；真正取消：**需新增 Host API** | E02/E06；V7 |
| 元数据 | getTableMetadata 仅已知表列及字段能力；无表枚举、主外键、业务含义 | 从表入口/作者输入表身份；不自动推断事实表关系、维度树和指标口径；跨库枚举需方言SQL或新增API | E03；V1/V3 |
| workbench | 声明UI入口，打开tab；默认复用键包括插件、贡献、连接，不包括报表ID | 用一个作者工作台管理文档；文档ID和tabID分离；不要假定openWorkbench换context一定打开另一报表 | 宿主载体，插件路由；E04；V2 |
| dock | command的panel呈现及instance_key控制面板复用；不是BI卡片布局引擎 | 后续只读预览；看板内部布局、筛选映射和刷新仍由插件实现 | E04；V2 |
| 浮窗 | 桌面能力；同插件+workbench contribution复用窗口，可更新context；不接受result-view contribution替代workbench | 后续一个浮窗切换看板；不是每份资产自动拥有独立窗口；web退回tab | E04；V2 |
| result-view | 结果工具栏打开独立插件tab，附SQL/连接/列/最多500行；其truncated只比较当前行数与500 | 定位为“从当前查询创建草稿”；不可据这个flag证明源结果完整；授权后通过queryData重新验证再保存 | E05；V1/V2/V3 |
| 保存 | host.storage：native单值256 KiB、总1 MiB、1024键；没有文档CAS或多键事务 | 不作为无限资产库；MVP的正式资产为JSON文件；storage仅偏好/有限恢复草稿，不缓存业务结果 | 插件定义与版本；E08；V6 |
| 导出 | saveFile接插件生成的字节；桌面每次保存对话框，web下载；并非报表导出引擎 | JSON/CSV由插件生成；CSV注明时间/查询版本/范围并防公式注入；取消保存不标“已保存” | E09；V2/V6 |
| 图表与打印 | iframe隔离，不能直接借用父页面图表组件；无BI渲染、分页打印API | 打包自身渲染依赖；PNG/SVG须sandbox实测；PDF分页/全量导出本次不做 | E12；X4–X6；V2/V8 |
| AI / MCP | completion、conversation、内置插件工具、外部MCP是不同通道 | 不将“模型能写JSON”当“Agent能把资产安全发布”；详见3.4 | E06/E07；V4/V5 |

**精确权限白名单（F）。** 静态项为 host.events、host.binary、host.workbench、host.filesystem、host.plans:read、host.schema:read、host.storage、host.ai、host.clipboard:read、host.data:read、host.connections:read、host.connections::read；另允许 host.network:https://host[:port]，运行时最多8个origin。双冒号是现有兼容别名，首版使用单冒号标准项。拟请求 workbench、data:read、connections:read、schema:read、storage、ai；无业务需要不申请 network、clipboard读取、filesystem或binary。文件选择/保存并没有独立的同名manifest权限，不能虚构。[E01/E09；V1/V8]

### 文档与代码差异（不在本任务修复）

| 文档/注释 | 当前代码证据 | 对本报告的处理 | 外部验证 |
|---|---|---|---|
| README:379说每次AI发送都确认；:381能力表较少 | completion:117–143支持当前工作台remember；bridge:502–535另有stream/floating/fileTransfer等 | 不能承诺每次均弹窗；以运行能力和授权状态为准 | V1/V4 |
| plugin_tools顶部注释说自动发现 | :270–304明确opt-in，测试:1284–1319验证 | 内置Agent需要用户开启，不以注释推翻实现 | V5 |
| README:886说外部MCP只暴露显式external_tools:true | manifest:1071–1072缺mcp时excluded=false；mcp backend:982–990筛选!excluded | 未声明mcp的backend也可能进入探测；如未来加sidecar，应显式false且实测，不能以省略字段作隔离 | V5；代码差异已确认，真实暴露组合未跑 |
| data API文档说不会重连 | plugin_data:102只检查连接已有池；query/mod:2977–2981进入get_or_create_pool_for_session | 不承诺不建目标database池；schema路径确实要求目标已有池。MVP仅使用作者选定的当前范围 | V7；实际连接行为待实测 |
| “60秒上限”“只读”容易被理解成端到端deadline和无副作用证明 | 排队/建池并非统一deadline；分类器解析失败可fallback，函数黑名单有限 | 写成“执行timeout配置上限”“被分类器判为只读”；只读数据库账号和反例测试仍必要 | V3/V7 |
| “每插件1 MiB存储”被当成所有端一致合同 | native检查总量，web直接localStorage；云同步可包含加密UI store | 只认证桌面首版，不承诺浏览器持久化等价或数据永不离机 | V6 |

## 3）六个问题逐项分析

### 3.1 报表、驾驶舱及正式对象模型

**I：报表是一个可验证的数据集版本加一种呈现；看板是报表版本的组合。载体只负责展示对象，不能替代对象。** 文件内组织 datasets/reports/dashboards；先选文档再选资产。不要为每个用户报表动态增加manifest贡献，也不要用tab标题做资产主键。[E04/E05；X15/X16；V2/V6]

| 对象（拟定模型） | 必要字段 / 关系 | 不变量与边界 |
|---|---|---|
| ProjectDocument | formatVersion、documentId、revision、parentHash、contentHash、sourceAliases、datasets、reports、dashboards | MVP一文档一个逻辑连接；不包含密码、可复用连接句柄或默认业务数据；connectionId只作本机映射 |
| Dataset | id、queryVersionRef、rowGrain、outputContract、metricRefs、dimensionRefs | SQL输出的每行代表什么必须明确；输出契约含稳定字段名、类型/精度/单位/时间含义 |
| Query | id、revision/hash、dialectProfile、SQL、database/schema、maxRows/timeout | 一条固定SQL；不因图表操作隐式重写；SQL变化创建新版本 |
| Metric | id、datasetVersionRef、outputColumn、定义说明、单位、NULL策略、可加性、时间口径 | 指标词典不是独立语义编译器；比率/去重数禁止默认再求和；不声称跨数据集同名即同义 |
| Dimension | id、datasetVersionRef、outputColumn、type、粒度、timezone（适用时） | 仅SQL已经返回的分组/分类轴；不能凭UI增加SQL未计算的维度 |
| Filter / Parameter | Filter：fieldRef/op/typedValue/phase；Parameter：id/type/domain/target | MVP phase仅result，Parameter不绑定SQL；不得把值、标识符、SQL片段混为一种字符串 |
| DialectProfile | engine、certifiedServerRange、identifierRules、literalRules、date/timeRules、allowedFeatures、testCorpusVersion | 首版用于认证与拒绝，不做通用转译；宿主databaseType只是输入之一 |
| Report | id、revision、datasetVersionRef、受限viewSpec、format、标题/说明 | 一个报表对应一个数据集版本；字段/类型不匹配时失败，不猜替换列 |
| Dashboard | id、revision、reportVersionRefs、排列、显式filterMappings | MVP≤4报表，同连接；刷新不是跨查询事务快照，显示每卡取数时间；映射必须类型和语义一致 |
| Run（临时） | queryHash、sourceBinding、started/finishedAt、rows、truncated、error、generation | 不写入正式定义；旧generation不能覆盖新结果；重开文件须重新取数 |
| Version / Release | schema版本与内容revision分离；Release固定依赖hash、验证摘要、人工确认时间 | “发布”仅本机确认版本，不是服务器上线或团队认证；不默认保留无限历史 |

**I：保存与导出分开。** JSON定义文件是正式资产；先校验、确认，再经宿主保存对话框另存，取消不成功。重新打开需用户选文件；不承诺能凭历史路径静默读写。CSV是当前已验证结果的副本，不是可编辑报表定义；图像是呈现快照。首版没有自动覆盖保存、资产服务器或报表排版引擎。[E08/E09；V2/V6]

### 3.2 指标的存放、版本和人机一致性

**I：指标定义随文档中的数据集版本保存，SQL是计算真相，词典是解释真相。** 人和AI都读取相同hash的词典；AI只引用稳定ID、返回候选变更，不能另造一份口径。修改币种、时区、分母或SQL都必须产生新版本并重验引用报表。未知指标要求作者补定义，不能由AI猜测。[V3/V4/V6]

| 选择 | 裁决 | 现在不做其他选择的理由 / 复议条件 |
|---|---|---|
| 纯SQL + 结果字段词典 | 支持，MVP | 能在现有API内闭环；明确只能复用已定义查询，不支持任意维度组合 |
| 插件自持完整语义层 | 后续独立立项 | MetricFlow/Cube涉及实体、关系、聚合和编译，不是加一个metric JSON就完成；需可验证的join与粒度规则及维护预算。[X1–X3；V3] |
| 外部dbt/Cube语义层 | 后续，按明确用户环境决定 | 另需服务、认证、CORS/网络权限与模型版本协调；宿主不会把连接凭据交给它。直接用服务API可以是插件自建，但不是宿主已支持；若要求宿主代管认证则**需新增 Host API**。[E10/E12；V8] |

### 3.3 维度、过滤、参数、语法和方言

**I：5000限制返回行，不限制数据库参与聚合的源行。** 千万事实行聚合成几十个组在接口形状上可行，性能仍须实测；把前5000明细下载后求总额则不可接受。筛选只作用于完整返回集；其标签必须是“当前结果”，不能说“重新计算全库指标”。[E02；V3]

| 语法/交互能力 | 裁决与条件 | 验证 |
|---|---|---|
| SELECT、只读CTE、JOIN、聚合、窗口、子查询 | 有条件支持作者SQL：数据库支持且当前分类器接受；不承诺所有方言语法都通过 | V3：固定版本黄金SQL与结果比对 |
| 同连接跨schema/跨database引用 | 方言和数据库权限允许时可能成立；MVP不认证跨database，不误写成技术上绝对禁止 | V7 |
| 跨connection JOIN | 本次否决；接口只有一个connectionId，本地联接截断结果不能替代联邦查询 | V3负例 |
| 过滤、排序、Top N | 支持已返回完整结果上的显示操作；业务聚合/排序/限额由作者SQL明确；Top N不能伪装全量 | V3 |
| SQL运行参数 | MVP降级为作者修改SQL并重验，或选择预先审核的固定查询版本；不做模板字符串拼接 | V3注入语料 |
| 整数/日期/枚举SQL参数 | 原理可由插件针对认证方言严格编码，但仍要处理类型/位置/会话配置；本次暂缓，避免自造半套绑定器 | V3；若用宿主原生绑定：**需新增 Host API** |
| 自由文本、标识符、任意表达式插槽 | 本次否决；标识符即使有bind也须独立白名单；通用转义不存在 | X10/X13；V3 |
| 写语句、写CTE、锁定读、USE、临时表/多语句、存储过程工作流 | 放弃；越过只读单语句产品合同；不能让sidecar绕过 | E02/E11；V3负例 |
| 分页明细、海量导出、长任务 | 本次否决；没有cursor和可确认取消，资源边界不足。要正式支持：**需新增 Host API**或另建执行服务 | V7 |
| 方言配置与转译 | 保留每查询的方言profile和认证版本；不复用宿主未暴露的formatter/parser接口，不承诺90+数据库通用SQL | E10/E11；V3 |

### 3.4 MCP、宿主 Agent 与 AI 验收

**结论：现有API足够做插件内AI草稿；不能仅声明mcp就获得“替任意宿主连接建好并发布报表”。但“宿主Agent绝对做不到”也不成立。** 普通数据库Agent能组合数据库工具和已打开的插件工具；这条路径需要插件额外承担连接/sidecar/资产写入，不是免费的BI接口。[E06/E07；V4/V5]

| 通道/主张 | F：证据 | 裁决 |
|---|---|---|
| host.ai.generateText / Stream | API模型、固定system、无工具；输入≤100000字符，输出maxTokens=2048且≤16000字符；同工作台一次生成；同意可会话记忆 | **支持草稿**，每次生成一份小型报表候选，不能当事务式工具执行或大看板生成器；不支持CLI Agent作为completion |
| openConversation | 默认Ask，快照分析；mode可选agent；返回null，不把对话答案回传插件 | **支持解释，降级人工复制草稿**；不能假定用户在聊天里说“保存”就触发插件持久化 |
| mcp contribution | 最多一个、需要backend；只含id/description/ai_tools/external_tools；内置发现还需opt-in和运行中的本插件连接 | **否决“声明即工具可用”**；UI-only或无插件连接的backend不能因此成为内置Agent工具 |
| sidecar直接查宿主连接 | reverse Host API仅host/requestUserInput；无query/schema/storage入口 | 此路径**不可用；需新增 Host API**。sidecar虽有OS权限，也不能通过读取内部库/凭据绕边界 |
| native DB Agent + BI sidecar | agent_loop:334–346把数据库工具和打开的插件工具合并；非只读工具逐次审批 | **I：条件可行，H：未实装**。可先查库再调用插件save_draft；需自建connection-provider/sidecar。查询走Agent策略，不继承queryData逐插件grant/5000行合同，因此列后续 |
| 外部dbx-mcp | 可允许connection-less工具，和内置Agent不同；全局/scope/连接策略另管 | 不是内置Agent的等价替身；缺mcp声明的暴露差异须复现，MVP不采用 |
| AI自动发布 | 没有BI资产审批/版本事务；模型生成正确性未证实 | **否决本次范围**。人工确认不只批准工具运行，还要确认口径、数据和依赖版本 |

**I：降级闭环。** 用户选择连接与已审核字段词典→确认将发送的内容→AI生成受限JSON候选→schema/字段ID/版本/语法检查→作者审阅SQL→经queryData预览→核对口径与完整性→人工确认保存本机定义。这里“落库”落实为插件本地文档保存，不往业务数据库写DDL/DML。模型输出不得包含可执行JS、外部URL或任意文件路径。无AI模型或用户拒绝外发时完整保留手动流程。[V4/V8]

| AI验收项目（拟定发布门槛，均尚未实测） | 测量方式 / 通过标准 |
|---|---|
| 结构与引用 | 固定40个业务任务，模型/提示/词典hash留档；首次候选schema通过率≥95%；所有被接受候选的ID/版本引用100%有效 |
| 数值与语义 | 黄金SQL及独立人工口径双核；≥90%任务在最多1次人工反馈后得到正确候选；任何已确认版本数值/币种/时区错误率必须为0 |
| 拒绝能力 | 另20个恶意/不完整任务：注入、越权连接、虚构指标、超长输出、截断、网络URL；100%阻止进入可确认状态；拒绝和失败也计入分母 |
| 人工控制 | 取消/拒绝时0次自动查询、保存或发布；只有作者明确预览后才查询，只有确认后才保存；不把会话remember当发布许可 |
| 数据最小化 | 默认发送字段契约和口径，不发送业务行；显式发送样本须可检查全量发送内容，不能仅依靠宿主第一行预览 |
| 实用性 | 同一任务集对比纯手工，中位有效人工耗时下降≥30%；计入审阅、纠错和失败恢复。未达标则保留手工产品、移除AI卖点 |

### 3.5 容易遗漏且影响范围的事项（重要性排序）

| 优先级 | 遗漏 | 为什么改变裁决 |
|---|---|---|
| P0 | 指标粒度、可加性、币种、时区、精度、NULL | 图画对不等于数算对；未约定便不能确认版本；大整数/decimal不得默认转JS浮点。[V3] |
| P0 | 截断、快照、过期结果 | 500行入口与5000行查询不同；看板多查询无一致性事务，不能给出单一“截至时间”假象。[V2/V3] |
| P0 | 只读分类与账号权限 | SELECT可能有函数副作用，parser有fallback；只读合同不能代替数据库授权。[V3/V7] |
| P0 | 资产身份和数据源重新绑定 | connectionId本机有效，不是可移植凭据；导入定义必须重新绑定并重新授权。[V6] |
| P1 | 存储容量、误覆盖、升级和备份 | UI store不是资产数据库；多窗口无CAS，云同步可能搬走草稿；选择文档资产且限制自动持久化。[V6] |
| P1 | 取消和查询成本 | 行少也可能扫描很多数据；没有取消闭环与全插件并发治理，排除无人值守刷新。[V7] |
| P1 | 数据外发与审计 | AI、CSV、图像、同步各有独立外发路径；宿主日志不等于报表版本的审计记录。[V4/V8] |
| P1 | 发行与License | 包签名不证明依赖许可、安全或商店人工审核完成；native sidecar显著增大发行与信任范围。[V8] |

### 3.6 角色与端到端场景

角色：SQL作者负责口径与查询；本机使用者消费已确认定义；连接管理员提供受限账号并批准访问；插件维护者负责格式与依赖。首版这些角色可以是同一人，不构造不存在的RBAC。

| 场景 | 正常路径 | 必须验证的失败路径 |
|---|---|---|
| 从查询建报表 | result-view导入SQL/样本→绑定连接→授权重查→选字段→确认→保存 | 原结果已截断、授权拒绝、500行快照过大；只留草稿，不能以快照冒充完整结果。[V2/V3] |
| 组合看板 | 打开文档→选择≤4个固定版本报表→按队列刷新→显示每卡时间 | 一卡失败/连接断开：其余可显示但看板标部分成功，不沿用旧卡冒充最新。[V2/V7] |
| AI辅助作者 | 选择定义版本→检查外发内容→生成→审阅→预览→保存 | 模型离线、输出截断/ID不存在、prompt injection：不自动修成“可用”，保留可编辑失败草稿。[V4] |
| 分享文件后重开 | 导出无数据定义→另一机器导入→重新映射→授权→重新验证 | 无连接、字段漂移、未知format major、无权限：只读查看定义/拒绝执行，不静默迁移。[V6] |
| 停止或撤销 | 用户停止等待/撤销grant→不接纳旧结果、不调新请求 | 服务端可能仍执行、窗口关闭导致保存取消：不得声称已取消查询或已持久化。[V2/V7] |

## 4）实现边界三栏、诉求裁决与反方论证

| MVP | 后续：为什么现在不做 / 重启条件 | 明确不做：本项目范围栅栏 |
|---|---|---|
| UI-only桌面作者工作台、JSON文档 | Dock/浮窗只读显示：先验证多实例、关闭恢复、CSP；不能靠增加载体验证BI需求 | UI设计稿、数据库驱动、连接凭据复制、绕过宿主授权 |
| 固定SQL数据集、字段词典、受限图表、小看板 | SQL绑定参数：当前无bind；只在新增Host API或认证的类型编译路线通过注入测试后复议 | 通用自由文本SQL插值、任意JS/表达式、未经验证的跨方言翻译 |
| 手动刷新，完整性门，JSON/当前结果CSV | PNG/SVG：确认实际sandbox和导出；PDF分页是独立排版需求，尚无证据必需 | 全量数据仓库、跨连接联邦查询、绕5000行分批抽取、ETL/业务写回 |
| AI生成单报表候选、人工预览与保存 | 内置Agent写草稿：先跑V5组合spike，确认sidecar成本确有价值 | AI自动发布、自动扩大数据权限、将模型判断作为口径认证 |
| 文档格式版本、依赖hash、显式导入导出 | 外部语义层：有真实服务和认证约束再设计；自持完整语义层需另立项 | 团队ACL/协作、公开分享服务、审计合规平台、商业/定价计划 |
| SQLite/PostgreSQL认证候选 | MySQL等逐库扩展：通过方言/数字/超时/权限语料才加入 | “支持DBX全部数据库”的无条件承诺、无人值守报表订阅/后台调度 |

| 用户诉求 | 判断 | 范围裁决与验证 |
|---|---|---|
| 报表和看板 | **支持** | 插件定义与渲染，宿主提供tab/执行/文件出口；不是宿主原生BI资产。[V2/V3/V6] |
| workbench/dock/浮窗/result-view均可承载 | **降级** | workbench首发，result-view作为创建入口；dock/浮窗后续；不承诺各载体多编辑器同步。[V2] |
| 指标语义 | **降级** | 固定SQL输出词典、人机同版本引用；无任意维度查询编译。[V3/V4] |
| 维度/过滤/参数/语法配置 | **降级** | 返回集显示过滤、固定方言SQL；SQL参数后续；跨连接、任意片段否决。[V3/V7] |
| 宿主内置AI直接建成报表 | **降级** | 草稿可直接生成；完整落资产需插件工具链或人工保存；组合Agent后续验证。[V4/V5] |
| 保存与导出 | **支持但有限** | 本机定义JSON、当前已验证结果CSV；不承诺自动原位覆盖、PDF、全量导出。[V2/V6] |
| 团队共享、自助分析、自动发布（架构分叉） | **否决本次** | 缺对应合同和验证基础；不能作为“下一小步”偷渡进MVP。[V5/V6/V8] |

**必须反驳的想当然。** 第一，“有workbench就有报表系统”混淆了窗口和资产；第二，“只读单句就没有注入/副作用”忽略了读取越权、UDF和parser fallback；第三，“支持90+数据库就能统一BI方言”忽略了API排除列表和SQL语义差异；第四，“MCP贡献能让Agent操纵所有宿主连接”混淆了工具发现、连接绑定和查询授权；第五，“5000行使大表聚合不可行”误把结果限制当输入限制。反过来，“MCP完全不能用于建报表”也过度否定了普通数据库Agent组合插件工具的路径。[E02/E04/E07/E11；V2/V3/V5/V7]

**对建议本身的反方意见。** 纯SQL工具可能低于真正的自助BI期待；手动另存与重开也弱于常规资产库。若首批用户不接受这两点，就应停止本MVP，而不是补上临时语义层和共享服务。建议选择可验证的小产品，并把这些摩擦作为立项条件，而非藏在后续承诺里。

## 5）风险登记、威胁模型与 kill criteria

边界按“业务数据库→宿主→插件iframe→模型/文件/同步”检查；新增sidecar时另有“同OS用户原生进程”边界。资产包括凭据、业务数据、指标口径、已确认版本。威胁来源包括不可信SQL/导入定义、数据库单元格、模型输出和插件依赖。以下控制是拟定验收，不宣称已具备。[E12；X7–X14；V8]

| 风险 / 优先级 | 控制与责任 | Kill criterion（停止哪一部分） | 验证 |
|---|---|---|---|
| SQL注入/副作用 P0 | 作者固定SQL；不拼自由输入；管理员提供最小权限账号；插件限定认证语法；只读分类不作唯一防线 | 任一未经授权写入/外部副作用可复现：冻结该方言执行，禁AI自动预览，修正并回归后才恢复 | V3/V7 |
| 错口径/截断 P0 | 粒度/单位/时区与依赖hash；数据库基准；截断不可确认 | 任何错误或不完整结果被标为正式完整：阻止发布该版本/首版放行 | V3 |
| Prompt injection P0 | SQL、数据、注释、导入文件均视为数据；模型只回受限候选；不执行指令字段或URL | 注入能导致越权查询、外发、保存/发布：关闭AI路径 | V4/V8 |
| 数据外泄 P0 | 默认不送业务行、不申请network；发送内容可检查；文件不含凭据；输出扫描；敏感草稿不默认存UI store | 未确认发送原始行/凭据或外连非白名单：停止发行 | V8 |
| 模型一致性 P1 | 黄金任务集；指标ID/版本校验；人工独立确认 | 结构、数值或人工耗时不达3.4门槛：移除AI承诺，不拖累手工工具 | V4 |
| 资源/取消 P1 | 有限卡片/队列、旧结果丢弃、不自动刷新；明确停止等待语义 | 小型基准看板持续造成宿主不可交互、查询残留无法恢复：暂停相关driver，若普遍存在则停止本方案 | V7；建议门槛：UI单次阻塞<1秒，关闭后5秒内恢复可交互，服务端另查残留 |
| 资产丢失/兼容 P0 | 保存成功才更新状态；版本和hash；导入验证；拒绝未知major；原文件保留 | 已报告保存成功但重开丢资产、升级静默改口径：停止发行 | V6 |
| Sandbox/图表依赖 P1 | 包内依赖；禁任意HTML/JS/URL；默认不启unsafe-eval；必要时换运行方式/依赖 | 基本图表必须放开任意网络或不受控代码才能运行：撤销该渲染方案，不降低安全门槛 | V8 |
| License / 商店权限 P1 | 维护者产出锁定版本SPDX依赖清单、LICENSE/NOTICE；声明权限与包一致；真实商店审核证据 | 许可来源不明、义务不能满足、审核要求无法满足：停止分发，不能靠签名替代 | V8 |
| 范围错配 P0 | 负责人确认目标用户能写SQL、接受本机文件 | 必须首发团队协作、全库自助维度探索、无人值守或AI自动发布：停止当前MVP并重做立项裁决 | 用户决策；V2用户演练 |

## 6）验证方案与证据清单

**本轮实际执行：8个测试文件、155项通过，Vitest 4.1.8，7.34秒。** 它们是源码契约、TS桥接及部分组件/store测试，后端多为mock。没有运行Rust测试、真实数据库、真实插件安装、上游竞品或walking-skeleton；未据此宣称运行闭环完成。没有产品实现可供测试，故其余验收均为下一阶段独立复现方案。

| 验证ID / 覆盖关键结论 | 可复现方法 | 状态 / 通过标准 |
|---|---|---|
| V1 Host契约、权限、AI桥、结果入口 | 下列pnpm命令；另审schema与runtime常量 | **已跑155项全通过**；Rust/backend/真实UI不在此证据范围 |
| V2 载体、文件闭环、作者定位 | 使用匹配commit的现成DBX，在临时目录制作最小测试包并真实安装；只做“SELECT→一图→另存→重开”，拒绝授权、断开、取消保存和关闭窗口均留日志；后续才测dock/浮窗 | **未跑**；同一查询/定义hash可复现；拒绝无执行，取消不记保存；由2名目标作者完成，不接受手工SQL/文件流程则触发范围kill |
| V3 数据正确性、方言、只读和指标 | 临时SQLite及PostgreSQL固定版本，只读账号；>5000源行且<5000分组、5001分组、NULL、decimal、DST、比率、join倍增、字段漂移；和独立SQL客户端结果对比；重放注入/写CTE/锁定/UDF等隔离语料 | **未跑**；支持列表按engine+server版本+profile固定；未知/截断不能确认；不以“不报错”代替结果一致 |
| V4 AI草稿 | 按3.4的40正常+20对抗任务，固定模型/提示/定义hash；留候选、拒绝原因、人工用时和发送内容记录；独立作者复核 | **未跑**；满足全部阈值；模型变更重验，不能把本报告阈值写成测得性能 |
| V5 Agent/MCP | 现成DBX：UI-only、backend无连接、backend+已开自有连接三组；opt-in/关闭/撤销组合；native DB Agent查询→请求save_draft；批准/拒绝/超时；外部tools/list另测缺mcp/false/true | **未跑**；验证发现矩阵、非只读审批、拒绝不落盘；草稿必须回插件重验；文档差异需独立复现或维护者答复后定性 |
| V6 文档与兼容 | 导入/另存/关闭重开round-trip；未知major拒绝；损坏/配额/取消/磁盘错误/重复实例；跨机重映射；核查云同步导出是否含UI store | **未跑**；内容hash一致、凭据和默认行数据为0；旧文件不变；正式文件不依赖临时handle；不把localStorage作永久库 |
| V7 资源与会话 | PG同连接A库已开/B库未开，观察新池与server日志；大cell/宽列；慢连接、Agent锁排队、长查询与停止等待；多bridge并发 | **未跑**；实测端到端和server残留；不成立的资源保证不得写入产品合同。严格无建池/可靠取消需求须宿主扩展 |
| V8 安全、schema、License与发行 | 固定图表JSON Schema验证 + 禁URL/脚本策略负例 + DBX真实sandbox网络抓包；核验postMessage来源、无unsafe-eval基本绘图；扫描导出/日志/发送体；SPDX清单和LICENSE/NOTICE、商店签名/权限对照 | **未跑**；ASVS相关条款转成可重复测试，不宣称ASVS认证；商店人工流程需取得其仓库review/CI或维护者答复 |

实际命令（未触发generate或构建）：

```bash
pnpm exec vitest run \
  packages/app-tests/pluginPlanHostApi.test.ts \
  packages/app-tests/pluginSchemaMetadataHostApi.test.ts \
  packages/app-tests/pluginResultViewExample.test.ts \
  apps/desktop/src/lib/plugins/pluginHostBridge.spec.ts \
  apps/desktop/src/lib/plugins/pluginAiCompletion.spec.ts \
  apps/desktop/src/lib/ai/__tests__/aiPluginConversation.spec.ts \
  apps/desktop/src/stores/__tests__/queryStore.openPluginWorkbench.spec.ts \
  apps/desktop/src/components/layout/__tests__/ContentArea.pluginResultView.spec.ts \
  --maxWorkers 4
```

输出：`Test Files 8 passed (8); Tests 155 passed (155); Duration 7.34s`。另有pnpm.overrides迁移提示，与本次范围无关，未修改配置。

已有Rust测试可供其他环境独立复现（**本轮未运行，可能触发编译，不属于本次授权执行**）：

```bash
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled query::plugin_data
RUST_MIN_STACK=8388608 cargo test -p dbx-core --no-default-features --features sqlite-bundled ai::plugin_tools
cargo test -p dbx-plugin-runtime mcp_contribution
cargo test -p dbx-plugin-runtime parses_only_strict_https_network_permissions
cargo test -p dbx-mcp plugin_tools
```

## 7）需要用户拍板的决策项

| 决策 | 建议默认 | 不接受时的后果 |
|---|---|---|
| 首批目标用户是否能写/审核SQL | 是；定位作者工具 | 若必须业务人员任意探索，当前MVP不成立，需语义层项目 |
| 是否接受本机JSON文档、显式另存/重新打开 | 接受；不把UI store升级成资产服务器 | 若必须资产库体验，先裁决sidecar本地存储或新增宿主资产API，再估算范围 |
| AI是否只交草稿、人工预览与保存 | 是；不带业务行默认外发 | 若必须Agent自动建成，先做V5组合spike；若自动发布不可妥协，不建议启动当前方案 |
| 首发数据库与数据规模 | SQLite/PostgreSQL为认证候选；≤4卡、手动刷新、5000返回行上限 | 增加数据库需增加黄金语料；要求分页/后台刷新/确认取消须另改宿主合同 |
| 数据和依赖许可政策 | 默认无业务行持久化/外发；按实际依赖做SPDX/NOTICE与商店审核 | 禁止任何模型外发则禁AI；“绝不离机”须另核同步设置，不能只靠插件存储宣言 |

这些是实施前的范围选择，不影响本分析完成；尚未取得用户决定，不将建议视为已批准产品需求。

## 8）附录：证据、一手来源、竞品拆解

> 副本说明：本文件位于 `dbx-report/docs/analysis/`。文中证据链接写作 `../../../dbx/<path>#Lxx`，从本文件出发指向 sibling checkout `E:\File\self\github\dbx`。若在独立仓库或网页阅读，请按 DBX 仓库根解析，或改用 `https://github.com/t8y2/dbx/blob/b160d130560f71c5c429be15cec6147f677a4b3a/<path>`。

### A. DBX 仓库 file:line 证据索引（相对路径）

所有行号对应报告顶部commit。链接指向本机实际阅读的文件；代码后续变化时应检出该commit重核。

| ID | 精确证据入口 | 证明内容 |
|---|---|---|
| E01 | [manifest.rs:7](../../../dbx/crates/dbx-plugin-runtime/src/plugins/manifest.rs#L7)，7–76、1128–1149；[manifest.schema.json:28](../../../dbx/plugins/manifest.schema.json#L28)，28–35、451–460；[bridge:1101](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L1101) | API/protocol/manifest版本、权限白名单、网络origin、双冒号别名 |
| E02 | [plugin_data.rs:32](../../../dbx/crates/dbx-core/src/query/plugin_data.rs#L32)，32–78、91–133、200–271；[bridge:862](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L862)，862–880、1735–1755 | DTO无bind/cursor/cancel；grant、读门、支持SQL、行字节、并发 |
| E03 | [plugin_metadata.rs:23](../../../dbx/crates/dbx-core/src/schema/plugin_metadata.rs#L23)，23–74、76–118、154–190；[schema契约测试:73](../../../dbx/packages/app-tests/pluginSchemaMetadataHostApi.test.ts#L73) | 单表列DTO、目标池要求、unknown能力；静态与mock桥测试 |
| E04 | [bridge:490](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L490)，490–538、783–812、1003–1048；[queryStore:4141](../../../dbx/apps/desktop/src/stores/queryStore.ts#L4141)，4141–4205；[commandRegistry:35](../../../dbx/apps/desktop/src/lib/plugins/pluginCommandRegistry.ts#L35)，35–96；[floating:474](../../../dbx/apps/desktop/src/lib/plugins/pluginFloatingWindow.ts#L474)，474–493 | capabilities、tab复用、dock命令、浮窗贡献级复用 |
| E05 | [ContentArea.vue:1573](../../../dbx/apps/desktop/src/components/layout/ContentArea.vue#L1573)，1573–1598；[pluginData.ts:3](../../../dbx/apps/desktop/src/lib/plugins/pluginData.ts#L3)，3–25 | result-view 500行、SQL/schema、snapshot 2MiB；truncated未表达上游完整性 |
| E06 | [pluginAiCompletion.ts:90](../../../dbx/apps/desktop/src/lib/plugins/pluginAiCompletion.ts#L90)，90–103、115–154、199–201；[bridge:652](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L652)，652–738；[aiPluginConversation:27](../../../dbx/apps/desktop/src/lib/ai/aiPluginConversation.ts#L27)，27–47、77–97；[AiAssistant.vue:4646](../../../dbx/apps/desktop/src/components/editor/AiAssistant.vue#L4646)，4646–4686、6466–6481 | completion文本/限额/同意记忆、Ask/Agent分支、对话不回传内容 |
| E07 | [plugin_tools.rs:270](../../../dbx/crates/dbx-core/src/ai/plugin_tools.rs#L270)，270–329、371–385、419–471、1284–1319；[agent_loop.rs:334](../../../dbx/crates/dbx-core/src/ai/agent_loop.rs#L334)，334–346、645–708、1435–1448；[runtime.rs:774](../../../dbx/crates/dbx-plugin-runtime/src/plugins/runtime.rs#L774)，774–785 | opt-in、插件连接、native Agent组合、非只读审批、sidecar反向API |
| E07b | [manifest.rs:1068](../../../dbx/crates/dbx-plugin-runtime/src/plugins/manifest.rs#L1068)，1068–1073、1565–1580；[mcp backend.rs:957](../../../dbx/crates/dbx-mcp/src/backend.rs#L957)，957–990；[mcp plugin_tools.rs:158](../../../dbx/crates/dbx-mcp/src/plugin_tools.rs#L158)，158–167；[mcp server.rs:3438](../../../dbx/crates/dbx-mcp/src/server.rs#L3438)，3438–3474、3743–3771 | 外部MCP缺声明探测、连接归属、connection-less与scope区别 |
| E08 | [plugin_storage.rs:24](../../../dbx/src-tauri/src/commands/plugin_storage.rs#L24)，24–42、81–140、175–189；[WorkbenchHost:282](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L282)，282–313；[cloud_sync.rs:675](../../../dbx/crates/dbx-core/src/persistence/cloud_sync.rs#L675)，675–704、904–922 | native配额、原子单次写、非CAS、web差异、加密同步 |
| E09 | [bridge:882](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L882)，882–904、932–975；[WorkbenchHost:734](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L734)，734–756 | 文件传输、512MiB保存字节cap、保存对话框/取消、web下载；不等于导出计算 |
| E10 | [WorkbenchHost:613](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L613)，613–648；[bridge:820](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L820)，820–860 | 连接摘要脱敏、dialect实际db_type、元数据/plan适配 |
| E11 | [sql_risk.rs:602](../../../dbx/crates/dbx-sql-core/src/sql_risk.rs#L602)，43–66、602–638、667–688、843–888；[query_execution_sql.rs:324](../../../dbx/crates/dbx-sql-core/src/query_execution_sql.rs#L324)，324–345；[query/mod.rs:1924](../../../dbx/crates/dbx-core/src/query/mod.rs#L1924)，1924–1942、1971–1980、2240–2272、2974–2981；[connection/mod.rs:2776](../../../dbx/crates/dbx-core/src/connection/mod.rs#L2776)，2776–2820；[plugin_plan.rs:590](../../../dbx/crates/dbx-core/src/query/plugin_plan.rs#L590)，590–606 | 方言/有限副作用黑名单/fallback、非SQL排除、字节非峰值、取消、目标池/timeout |
| E12 | [WorkbenchHost:920](../../../dbx/apps/desktop/src/components/plugins/PluginWorkbenchHost.vue#L920)；[bridge:1124](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.ts#L1124)，1124–1161；[runtime.rs:1133](../../../dbx/crates/dbx-plugin-runtime/src/plugins/runtime.rs#L1133)，1133–1158 | iframe opaque sandbox、CSP/网络/eval、原生sidecar进程信任 |
| E13 | [installer.rs:875](../../../dbx/crates/dbx-plugin-runtime/src/plugins/installer.rs#L875)，875–944；[marketplace.rs:594](../../../dbx/crates/dbx-plugin-runtime/src/plugins/marketplace.rs#L594)，594–615、120；[marketplace.schema.json:83](../../../dbx/plugins/marketplace.schema.json#L83)，83–98 | 哈希、Ed25519、catalog权限一致；license可选字符串，未等同SPDX合规 |
| E14 | [pluginPlanHostApi.test.ts:88](../../../dbx/packages/app-tests/pluginPlanHostApi.test.ts#L88)，88–205；[bridge tests:1562](../../../dbx/apps/desktop/src/lib/plugins/pluginHostBridge.spec.ts#L1562)，1562–1654、1721–1795；[plugin_data.rs:392](../../../dbx/crates/dbx-core/src/query/plugin_data.rs#L392)，392–471 | 前端契约与mock行为；已有SQLite集成测试，但本轮未跑Rust |
| E15 | [plugins/README.md:375](../../../dbx/plugins/README.md#L375)，375–381、572–583、885–886；[plugin_tools.rs:7](../../../dbx/crates/dbx-core/src/ai/plugin_tools.rs#L7)，7–12 | 文档/注释差异的原文位置 |

### B. 外部一手来源（非DBX能力证明）

| ID | 一手材料 | 本报告使用范围与独立复现 |
|---|---|---|
| X1 | [dbt About MetricFlow](https://docs.getdbt.com/docs/build/about-metricflow?version=2) | YAML语义模型、实体、指标、维度及SQL生成；固定版本按官方quickstart编译，不用“指标词典”冒称其能力 |
| X2 | [dbt Semantic Layer quickstart](https://docs.getdbt.com/guides/sl-qs) | 模型定义、semantic manifest与Git/部署工作流；固定commit重编译manifest比较 |
| X3 | [Cube measures](https://docs.cube.dev/reference/data-modeling/measures)、[dimensions](https://docs.cube.dev/reference/data-modeling/dimensions) | measure的SQL/聚合类型与dimension属性；独立模型编译/查询；未运行 |
| X4 | [Vega-Lite data](https://vega.github.io/vega-lite/docs/data.html) | 内联、URL、named data；只取安全子集，不把schema通过当无外连 |
| X5 | [Vega-Lite v6.4.1 schema:31530](https://github.com/vega/vega-lite/blob/v6.4.1/build/vega-lite-schema.json#L31530) | UrlData.url是string；固定schema验证合法外部URL，再测试插件策略必须拒绝 |
| X6 | [Vega View API](https://vega.github.io/vega/docs/api/view/) | Canvas/SVG及图像导出接口；需在DBX CSP实跑，不能推导PDF或资产持久化 |
| X7 | [PostgreSQL 18 SELECT](https://www.postgresql.org/docs/18/sql-select.html) | 锁定SELECT、可写WITH；隔离库重放，不凭关键词判只读 |
| X8 | [MySQL 8.4 SELECT INTO](https://dev.mysql.com/doc/refman/8.4/en/select-into.html) | INTO OUTFILE/DUMPFILE副作用；无FILE权限账号验证，不对生产库测试 |
| X9 | [SQLite stmt_readonly](https://sqlite.org/c3ref/stmt_readonly.html) | SELECT UDF仍可能间接写；只读判断非任意函数纯度证明 |
| X10 | [PostgreSQL lexical](https://www.postgresql.org/docs/18/sql-syntax-lexical.html)、[MySQL strings](https://dev.mysql.com/doc/refman/8.4/en/string-literals.html)、[SQLite expressions](https://sqlite.org/lang_expr.html) | 字符串/反斜杠行为受方言和会话配置影响；固定配置重放引号/Unicode/NULL/LIKE语料 |
| X11 | [WHATWG iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)、[W3C CSP3](https://www.w3.org/TR/CSP3/) | sandbox与CSP不同；opaque origin及网络策略需要真实浏览器验证；meta不能承载CSP sandbox指令 |
| X12 | [ASVS v5.0.0 V1](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x10-V1-Encoding-and-Sanitization.md#L31)、[V3](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x12-V3-Web-Frontend-Security.md#L45)、[V14](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x23-V14-Data-Protection.md#L19) | 注入、出站目标、postMessage、敏感信息外发/本地存储，转成V8测试；非认证声明 |
| X13 | [ASVS v5.0.0 V1:31](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x10-V1-Encoding-and-Sanitization.md#L31) | 参数化或有效注入防护要求；标识符与值参数分开；作为参数能力延后的安全依据 |
| X14 | [SPDX 2.3.1 Annex D](https://spdx.github.io/spdx-spec/v2.3.1/SPDX-license-expressions/) | ID及AND/OR/WITH表达许可；表达式校验不代替LICENSE/NOTICE核对与兼容裁决 |

### C. 竞品拆解：仅提取可验证边界，不转成需求

| 竞品与实际读取快照 | 仓库内证据 | 可借鉴 / 不纳入 |
|---|---|---|
| Evidence，commit 497ade4b7c3b49c8c891c38909b447a30e579025 | [markdown.mdx:35](https://github.com/evidence-dev/evidence/blob/497ade4b7c3b49c8c891c38909b447a30e579025/docs/core-concepts/markdown.mdx#L35)，35–55：命名SQL供组件引用；[metrics.mdx:6](https://github.com/evidence-dev/evidence/blob/497ade4b7c3b49c8c891c38909b447a30e579025/docs/core-concepts/metrics.mdx#L6)，6–10、109–113、218–228：YAML指标、同view引用/拒循环、AI与组件共用定义和编译器 | X15：借鉴查询与呈现分离、人机同源；不移植编译器、不照搬Markdown插值。是固定commit仓库文档事实，未实测；不用旧版产品印象替代现快照 |
| Metabase，commit 49b6b75d3fbb5c92cdd89774cfa1c570187fd2bf | [questions/introduction.md:12](https://github.com/metabase/metabase/blob/49b6b75d3fbb5c92cdd89774cfa1c570187fd2bf/docs/questions/introduction.md#L12)，12–38；[dashboards/introduction.md:13](https://github.com/metabase/metabase/blob/49b6b75d3fbb5c92cdd89774cfa1c570187fd2bf/docs/dashboards/introduction.md#L13)，13–22；[sql-parameters.md:71](https://github.com/metabase/metabase/blob/49b6b75d3fbb5c92cdd89774cfa1c570187fd2bf/docs/questions/native-editor/sql-parameters.md#L71)，71–83 | X16：借鉴报表/看板分离与显式过滤映射；不引入集合权限、订阅、参数引擎。固定commit可独立阅读复核，未安装运行 |

### D. 加权矩阵与ADR记录

评分是本次工程判断，不是实验数据：1差/5好；权重为宿主契合35%、正确性可验证30%、当前复杂度可控20%、后续演进15%。硬性安全门不被分数抵消。

| 分叉选项 | 宿主契合 | 可验证 | 复杂度可控 | 演进 | 加权分 / 裁决 |
|---|---:|---:|---:|---:|---|
| 纯SQL+字段词典 | 5 | 4 | 5 | 3 | 4.40，选 |
| 自持完整语义层 | 3 | 3 | 2 | 5 | 3.10，延后 |
| 外部语义层 | 2 | 4 | 2 | 4 | 2.90，待用户已有系统 |
| 作者工具 | 5 | 4 | 5 | 4 | 4.55，选 |
| 自助分析 | 2 | 2 | 1 | 4 | 2.10，不首发 |
| AI草稿 | 5 | 4 | 4 | 4 | 4.35，选 |
| AI自动发布 | 1 | 1 | 1 | 3 | 1.30，否决本次 |
| 本机文档 | 5 | 4 | 5 | 3 | 4.40，选 |
| 团队共享 | 1 | 2 | 1 | 5 | 1.90，否决本次 |

ADR-01：SQL是计算真相，词典不升级成语义编译器。ADR-02：作者负责SQL，读者不做任意探索。ADR-03：模型仅提出候选，正式版本由人确认。ADR-04：本机文件为正式资产，不把tab/session/storage当服务器资产库。四项均是“建议，待用户决策”，复议触发条件见第1、7节。

### E. 报表格式兼容策略与待验证假设

定义格式采用独立formatVersion；首版只承诺一个major及明确字段集合，未知major只读说明/拒绝运行，不静默重写。内容revision不是格式版本；确认版本固定query/metric/report依赖hash，编辑从父hash分叉。导出不含自动历史链和结果数据；旧文件保留，迁移只在未来真实格式变更时增加明确转换与round-trip用例。DBX Host API兼容由engines约束和capabilities共同判断，图表schema/依赖版本另锁定。[I；V6]

| H | 尚未验证的假设 | 决定性证据 |
|---|---|---|
| H1 | UI-only可在实际DBX完成查询、基础图表和JSON/CSV闭环 | V2/V8真实安装；失败可能换渲染依赖，不能假定放宽CSP |
| H2 | 拟支持两数据库的黄金SQL、decimal/时区及性能满足需求 | V3/V7；通过前不能宣称生产支持 |
| H3 | Agent组合路线可稳定提交有效草稿且拒绝无副作用 | V5真实工具调用/审批/关闭连接复现 |
| H4 | AI能达到准确率和人工耗时阈值 | V4固定任务集；不凭模型名或演示推断 |
| H5 | 文档中重连/外部MCP的差异在目标发布包中可复现 | V5/V7或上游维护者答复；当前只确认源码分支差异 |
| H6 | 用户接受作者工具和文件保存的边界 | 第7节拍板及V2用户演练 |
| H7 | 图表依赖许可义务和商店人工审核可满足 | V8具体依赖清单、原始许可与商店review/CI；本轮未做完整法律许可审查 |

**未纳入本次范围：** external MCP默认发现差异修复、连接池/取消机制重构、原生sidecar OS沙箱、云同步产品重设、团队协作与共享服务、ETL/语义编译器、商业模式。仅登记，不在本报告扩展设计。
