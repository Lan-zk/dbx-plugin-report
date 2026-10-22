# .agents/rules

本目录是 dbx-report 的**可执行开发规则**：面向参与者和 agent 的硬约束、判断顺序、验收口径。它不复述 `docs/` 的分析全文，只沉淀"动手时必须遵守什么"；产品背景与论证读 `docs/`（`docs/README.md` 有阅读顺序）。

## 使用方式

- 动手前按任务读对应文件；改 DBX 插件代码前至少读 `plugin-contract.md` 与 `data-and-security.md`。
- 规则与 `docs/` 冲突：以 `docs/` 中已标注状态的分析结论为准，但先确认该结论是否只是拟定；与 DBX 源码冲突：以源码为准（本目录可能滞后）。
- 每条事实带 `path:line` 与基线；行号会漂移，引用前按 DBX 基线 `b160d130` 或当前 HEAD 重核。
- 新规则只写可执行约束，不写叙事；过时条目直接删除，不保留兼容层。

## 文件索引

| 文件 | 覆盖 |
|---|---|
| `plugin-contract.md` | DBX 插件平台合同：manifest v1、贡献点、权限、UI 沙箱、打包/签名/安装、sidecar、兼容策略 |
| `data-and-security.md` | 数据路径（queryData/元数据/资产/存储/AI/MCP）硬限制、错误模型、安全与隐私不变量 |
| `product-scope.md` | 产品边界、MVP/非目标、8 条产品不变量、决策状态与门禁、文档矛盾、反模式 |
| `delivery.md` | 环境、命令、真机验收、测试分层与证据、文档维护、交付格式、发布检查 |
| `../skills/dbx-plugin-dev/` | 平台操作手册：CLI、Host API 表、dev-host 边界、footgun |
| `../skills/dbx/` | DBX CLI 用法（查连接/schema/只读查询/DBML），与插件开发无关时使用 |

## 事实等级（与 `docs/reference/methodology.md` 一致）

- **F**：源码或一手规范可直接核对；给路径 + 行号 + 基线。
- **I**：由 F 推导的裁决；写清推导链，可被新证据推翻。
- **H**：未运行验证的假设；写验证方案与负责人，不得当事实引用。

**决策状态必须原样保留**：ADR-01~04 **暂定**；ADR-05（技术栈）、ADR-06（看板坐标模型）、ADR-07（卡数上限 + gridstack 引擎）**已定（2026-10-22；ADR-06 同日修订）**；D1–D5 **待定**；M0–M4 **未开始**（`docs/README.md:5`、`docs/product/decisions.md:6`（ADR-01 起）、`docs/development/roadmap.md:5`）。未经用户书面确认，不得把待定项写成已定，也不得把拟定阈值写成宿主现状。

## 维护

1. DBX 基线升级 → 先更新 `docs/host/`、`docs/analysis/evidence-index.md`、`docs/README.md` 基线 commit，再改本目录与技能。
2. 范围变化 → 先改 `docs/product/decisions.md`（新增 ADR 或修订待拍板项），再改 `docs/development/roadmap.md`，最后同步 `product-scope.md`。
3. 每条规则附证据；写不出证据的标 H，不得升格为 F。
4. 不改 `docs/` 的分析结论来"迁就"实现；发现错误在任务内报告，不悄悄修正历史结论。
