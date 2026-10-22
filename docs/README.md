# dbx-report 文档索引

> **项目**：DBX 桌面插件，面向 SQL 作者的本地报表工具。  
> **DBX 基线**：`b160d130560f71c5c429be15cec6147f677a4b3a`（main HEAD，package 版本 0.6.51），Host API 1.4.0，manifest v1，sidecar protocol v1。  
> **文档状态**：可行性、能力边界、开发路线与技术选型已完成分析；M0（walking skeleton）尚未开始；5 项范围决策尚未书面拍板。  
> **最后更新**：2026-10-22（Asia/Shanghai）。

## 一句话范围

作者写固定 SQL，把查询结果做成可重复打开的报表，再组合成小看板；资产是本机 JSON 文件。**不是**自助 BI、语义层、团队共享或自动发布平台。

## 新 agent 上手顺序

1. [product/scope.md](product/scope.md)：做什么、首版承诺什么、明确不做什么。
2. [host/capabilities.md](host/capabilities.md) + [host/limits.md](host/limits.md)：宿主到底提供什么、硬限制是什么。
3. [development/roadmap.md](development/roadmap.md) + [development/first-slice.md](development/first-slice.md)：按什么顺序做、第一件事是什么。
4. [development/architecture.md](development/architecture.md) + [development/data-model.md](development/data-model.md) + [development/tech-stack.md](development/tech-stack.md)：模块、状态机、文档格式草案、语言/框架/依赖选型。
5. [testing/test-strategy.md](testing/test-strategy.md) + [testing/acceptance.md](testing/acceptance.md)：怎么验、什么算通过。
6. 需要论证依据时读 [analysis/feasibility-report.md](analysis/feasibility-report.md)（完整报告）和 [analysis/assessment.md](analysis/assessment.md)（对报告的评审与分歧）。
7. 开工前确认 [product/decisions.md](product/decisions.md) 中的待拍板项；命名见 [product/naming.md](product/naming.md)。

## 文档地图

| 目录 | 文档 | 内容 |
|---|---|---|
| `product/` | `scope.md` | 产品定位、MVP、后续、非目标、成功/止损标准 |
| | `decisions.md` | ADR-01~05、5 项待拍板决策、变更控制 |
| | `naming.md` | 仓库名、manifest id、展示名、贡献点 id |
| `host/` | `capabilities.md` | UI 通道、sidecar、贡献点、Host API、权限、安全模型 |
| | `limits.md` | 硬限制速查 + 对 BI 的后果 + 误读澄清 |
| | `plugin-system.md` | manifest、打包、签名、商店、dev-host |
| `analysis/` | `feasibility-report.md` | 完整可行性/边界报告（迁移版） |
| | `assessment.md` | 对报告的独立评审、缺口、分歧、下一步 |
| | `evidence-index.md` | E01–E15 证据索引（DBX 相对路径） |
| `development/` | `roadmap.md` | M0–M4 里程碑、依赖、退出条件、止损门 |
| | `first-slice.md` | M0 walking skeleton 任务书与验收清单 |
| | `architecture.md` | 模块划分、数据流、状态机、错误模型、并发 |
| | `data-model.md` | 文档 JSON Schema v0 草案、指标词典、版本规则 |
| | `dev-environment.md` | 脚手架、真机安装、dev-host、测试命令 |
| | `tech-stack.md` | 语言、框架、UI、图表、校验、测试、工具链选型与版本基线 |
| `testing/` | `test-strategy.md` | 测试分层、V1–V8、黄金数据、AI 评估集 |
| | `acceptance.md` | 各里程碑验收门与签收模板 |
| `operations/` | `release-and-security.md` | 打包签名、商店审核、威胁模型、隐私、许可 |
| `reference/` | `prior-art.md` | 开源 BI+AI 项目与可借鉴/不可移植的部分 |
| | `methodology.md` | F/I/H 证据约定与分析方法，防止后续降级为拍脑袋 |

## 硬边界（任何里程碑都不得越过）

- 不实现、不承诺 DBX 宿主没有的 API；需要新增 Host API 的能力一律进“后续”，不当首版依赖。
- 不给插件加连接凭据复制、绕过 `host.data:read` 授权、或直接连数据库的旁路。
- 不把 SQL 参数做字符串拼接；首版不支持绑定参数与自由文本插值。
- 不把截断结果标记为完整结果；不做“导出全量 CSV”。
- 不做跨连接 JOIN、后台调度、无人值守刷新、团队 ACL、自动发布。
- 不把 `host.storage` 或 tab 标题当资产库；正式资产是本机 JSON 文件。
- 不引入 sidecar（M0–M2 不需要）；如后续引入，必须另做信任边界评审。

## 文档约定

- **F**＝源码/一手规范可直接核对的事实；**I**＝由 F 推导的裁决；**H**＝尚待运行验证的假设。
- 证据路径均按 DBX 仓库根（本机 `E:\File\self\github\dbx`，与 `dbx-report` 同级）解析，基线 commit 见文首。
- 行号会随 DBX 升级漂移；引用前先按当前 HEAD 重核，或固定到文首 commit。
- 报告/分析中的对象、阈值、验收标准是**拟定**，不是宿主已有行为；不得写成产品现状。

## 维护规则

1. DBX Host API、权限、限制变化时，更新 `host/` 与 `analysis/evidence-index.md`，并在 `docs/README.md` 更新基线 commit。
2. 范围变化必须先改 `product/decisions.md`（新增 ADR 或修订待拍板项），再改 `development/roadmap.md`；禁止在里程碑里悄悄扩大范围。
3. 每个里程碑结束时更新 `testing/acceptance.md` 的签收记录和 `development/roadmap.md` 的状态。
4. 任何“已验证”的结论都必须附命令、环境、日期；未运行的验证保持 H 标记。
5. 技术选型或版本基线变更时，先改 `development/tech-stack.md`（§5 版本表 + §9 变更记录），再改 `AGENTS.md` §7 与相关模块文档。
