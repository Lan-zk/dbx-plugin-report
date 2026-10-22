# 命名与身份

> 状态：建议方案，尚待商店命名空间确认。  
> 当天快照：DBX 官方商店目录 56 个插件，无 BI/报表/图表类插件（来源 `t8y2/dbx-store` catalog）。

## 结论

| 项 | 取值 |
|---|---|
| 仓库 / npm 包名 | `dbx-plugin-report` |
| manifest id | `io.dbx.report`（若命名空间不可用，退 `io.github.<user>.report`） |
| 展示名（en） | `DBX Report` |
| 展示名（zh-CN） | `DBX 报表` |
| 贡献点 id 前缀 | `io.dbx.report.` |
| 版本起点 | `0.1.0` |

> **注意**：`manifest.id` 必须匹配 `^[a-z0-9][a-z0-9._-]*$`，发布后不可改（见 `plugins/manifest.schema.json` 的 `$defs.identifier`）；`name` 可本地化。仓库名与 id 是两套命名，不要混用。

## 理由

1. **诚实**：首版是“面向 SQL 作者的报表工具”，不是完整 BI；“report”直接说明产出物。
2. **可搜索**：插件中心按报表/报告搜索时语义明确；避免 `bi` 带来的自助分析预期。
3. **可演进**：看板、AI 草稿、更多数据库都可以作为 report 的能力扩展，不需要改 id；展示名可随产品阶段调整。
4. **与生态一致**：官方目录已有 `io.dbx.files`、`io.dbx.kafka` 等命名，`io.dbx.report` 符合惯例；插件源码仓库按 `dbx-plugin-<name>` 惯例命名（DBX 文档示例 `https://github.com/example/dbx-plugin-files`），故仓库 / npm 包名取 `dbx-plugin-report`。

## 备选与取舍

| 名称 | 评价 |
|---|---|
| `dbx-insight` | 品牌感更好、可扩展到分析；但“insight”容易被理解为自助探索，和 ADR-02 冲突。若确定长期扩成平台，可用。 |
| `dbx-sql-report` | 定位最准、搜索友好；偏长，AI/看板后显得窄。 |
| `dbx-lens` | 短、好记；不直白，可能被当成数据浏览器/可观测工具。 |
| `dbx-mosaic` | 卡片组合看板的意象好；首版只有报表时略超前。 |
| `dbx-bi` | 品类明确，但首版过度承诺；建议只作未来产品线名，不作首版插件名。 |

**不建议**：`dbx-chart`（太窄）、`dbx-dashboard`/`dbx-dash`（暗示自动刷新/监控）、`dbx-query`（与 `host.queryData` 混淆）、`dbx-canvas`/`dbx-atlas`（像设计器/数据目录）。

## 待办

1. 向 `t8y2/dbx-store` 维护者确认 `io.dbx.report` 是否可用（`io.dbx.*` 被多个 publisher 共用，不等于自动保留）。
2. 发布前做一次 GitHub 仓库名与商标检索（本文档未做）。
3. 若 id 变更，必须同步 `manifest.json`、贡献点 id、商店 catalog、文档与测试；已发布 id 不可改。

## 插件身份样例（草案）

```json
{
  "manifest_version": 1,
  "id": "io.dbx.report",
  "name": "DBX Report",
  "publisher": "dbx",
  "version": "0.1.0",
  "engines": { "host_api": "^1.4" },
  "contributions": [
    { "type": "workbench", "id": "io.dbx.report.workbench", "label": "Report" },
    { "type": "result-view", "id": "io.dbx.report.result-view", "label": "Create report" }
  ]
}
```

实际字段以当前 `manifest.schema.json` 为准；上例只表达命名约定，不是可安装包。

## 变更记录

- **2026-10-22**：GitHub 仓库名与 npm 包名由 `dbx-report` 改为 `dbx-plugin-report`，对齐 DBX 生态 `dbx-plugin-*` 仓库惯例；`manifest.id`、展示名、贡献点 id 前缀不变（`io.dbx.report` / `DBX Report` / `DBX 报表`），仓库名与 id 是两套命名（见上）。本机 checkout 目录名仍为 `dbx-report`，文档中的本地路径与脚手架目录参数不改；若本机目录改名，需同步 `docs/README.md:63`、`docs/development/dev-environment.md:21`、`.agents/rules/delivery.md:8` 及脚手架命令。
  - 备选：保持 `dbx-report`（放弃：与生态仓库命名不一致）；只改 GitHub 仓库名、不同步文档（放弃：文档与仓库两套名字）。
  - 复议条件：商店命名空间确认要求调整可安装包名/仓库名，或本机目录改名后需同步路径引用。

