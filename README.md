# dbx-report

DBX 桌面端插件，规划为**面向 SQL 作者的本地报表工具**：固定 SQL → 报表 → 小看板，资产是本机 JSON 文件。当前状态：可行性、宿主能力边界、开发路线与测试方案已完成；插件代码尚未开始。

## 文档入口

- 总索引与推荐阅读顺序：[docs/README.md](docs/README.md)
- 范围与产品边界：[docs/product/scope.md](docs/product/scope.md)
- 宿主能力与硬限制：[docs/host/capabilities.md](docs/host/capabilities.md)、[docs/host/limits.md](docs/host/limits.md)
- 开发路线与第一刀：[docs/development/roadmap.md](docs/development/roadmap.md)、[docs/development/first-slice.md](docs/development/first-slice.md)
- 测试与验收：[docs/testing/test-strategy.md](docs/testing/test-strategy.md)、[docs/testing/acceptance.md](docs/testing/acceptance.md)

## 基线

DBX `b160d130560f71c5c429be15cec6147f677a4b3a`（main HEAD，package 版本 0.6.51，Host API 1.4.0）。代码证据路径按 DBX 仓库根解析；若两仓库不是同级目录，先按 `docs/analysis/evidence-index.md` 调整。

## 边界提醒

本文档集描述的是**拟定方案**，不是 DBX 已提供的能力。开工前先确认 `docs/product/decisions.md` 中待拍板的 5 项决策；不要引入 sidecar、宿主新 API、写操作、后台调度或团队共享。

## 约定

F＝源码/一手规范事实；I＝由事实推导的裁决；H＝待运行验证的假设。未验证的结论保持 H，不得写成产品现状。
