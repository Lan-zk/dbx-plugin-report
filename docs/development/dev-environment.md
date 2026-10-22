# 开发环境与迭代方式

> 基线：DBX `b160d130`（0.6.51）；插件目标 Host API `^1.4`。  
> 原则：**UI 可用 dev-host 加速，数据和保存闭环必须真机验证。**

## 1. 前置

| 项 | 要求 |
|---|---|
| DBX | ≥0.6.51，桌面端（数据 API/result-view/保存对话框以桌面为准） |
| Node.js | 22（与 DBX 仓库一致） |
| 包管理 | npm 或 pnpm；插件 CLI 全局安装 |
| 数据库 | SQLite（零配置）优先；PostgreSQL 用于 M4 认证 |
| 系统 | Windows/macOS 均可；路径/换行差异需测 |

DBX 仓库（宿主）与本仓库是 sibling：

```
E:\File\self\github\
  dbx\          # 宿主源码，基线 b160d130
  dbx-report\   # 本插件仓库（当前只有 docs/）
```

## 2. 脚手架与打包

```bash
npm install --global @dbx-app/plugin-cli
dbx-plugin create dbx-report --template frontend
dbx-plugin package --path ./dbx-report
```

命令/模板以当前 CLI 为准；`plugins/README.md` 是宿主侧权威说明。打包产物为 `.dbxp`。

## 3. 真机安装与迭代（必须）

1. 打开 DBX → 插件中心 → 从本地文件安装 `.dbxp`；
2. 打开插件的 workbench tab；
3. 用 DBX 开发者工具查看 iframe 控制台（CSP/权限/postMessage 错误）；
4. 准备一个已打开的 SQLite/PostgreSQL 连接；
5. 每次改动：重新打包 → 重装（或宿主支持的热重载方式）→ 复测。

**检查点**：

- `window.dbxPlugin` 存在；init 后 `capabilities.dataApi === true`；
- `listConnections` 能看到脱敏摘要；
- `queryData` 首次弹授权；拒绝后可恢复；
- `saveFile` 弹保存对话框；取消返回 null；
- 无 `Refused to ...` CSP 报错、无 `postMessage` origin 报错。

## 4. dev-host（UI 加速，不覆盖数据闭环）

```bash
dbx-plugin dev --path ./dbx-report --port 5190
```

事实（`plugins/sdk/dev-host/README`）：

- **Host API 1.0 subset**：ready/contributionId/context/locale/theme/request/invoke/notify/onEvent/onBinary/sendBinary/资源读取/openWorkbench；
- 未实现的方法（如 `host.openFilesystem`）返回错误；权限只强制 event/binary/workbench 等；
- **不模拟** native connection actions、query-result contributions、DBX 组件库；
- 无 `queryData`、`getTableMetadata`、`saveFile`；
- 支持 sidecar（JSONL/framed）、连接 provider 表单、workbench tab、storage、诊断面板（500 条）、仅 `127.0.0.1`。

**因此**：dev-host 适合工作台 UI、表单、主题、storage、事件；不适合数据/保存/result-view。  
**M0 决策**：评估给 dev-host 加 `queryData`/`saveFile` mock（fixture 返回固定 rows）。若 <1 人日，值得做；否则接受真机迭代成本，并在记录中写明。

## 5. 数据库夹具

### SQLite（M0/M1）

- 单文件 `fixtures/sales.db`；只读打开。
- 表：`orders(id, paid_at, status, amount, currency, region, product_id)`；`products(id, name, category)`。
- 数据：至少 10000 行，覆盖 NULL、负数、退款、跨年、同月多行；金额 decimal 用 TEXT/NUMERIC 存。
- 查询：固定 SQL 示例（月度销售、Top 产品、区域占比）。

### PostgreSQL（M4）

- Docker 或本地实例；只读账号（`GRANT SELECT` only）。
- 覆盖：`numeric` 大精度、`timestamptz`/DST、`date_trunc`、`NULLS`、标识符大小写/引号、schema/database 作用域。
- 不允许 `CREATE TEMP`/写操作；失败用例要真实触发分类器。

## 6. 测试命令

### 宿主契约（升级 DBX 后回归，非插件测试）

见 [host/plugin-system.md](../host/plugin-system.md#54-测试命令宿主契约非插件测试)。要点：155 项 Vitest + 可选 Rust 契约；只证明宿主行为。

### 插件自身（代码建立后）

```bash
pnpm install
pnpm run typecheck
pnpm run test        # 单元：schema、hash、队列、错误映射、格式化
pnpm run build
pnpm run package     # 产出 .dbxp
```

E2E/真机用例不在 CI 中自动跑；按 [testing/acceptance.md](../testing/acceptance.md) 手工执行并记录。

## 7. 诊断与日志

- 插件日志只输出 code/耗时/行数/截断标记，**不输出 SQL 字面量、结果值、连接串、token**。
- 开发期可在 iframe 控制台打 debug；发布构建移除敏感日志。
- 记录每次失败：宿主版本、插件版本、连接 dbType、错误 code、可复现步骤；不含业务数据。
- DBX 侧日志可查 `[plugin-data]` 审计（plugin/connection/rows/truncated），不含 SQL 文本。

## 8. 基线固定与升级

1. 文档头部固定 DBX commit + Host API 版本；本仓库 `README` 同步更新。
2. 升级 DBX：先跑宿主契约测试，再跑 M0/M1 手工回归（安装、授权、queryData、saveFile、result-view），最后更新文档与证据行号。
3. 不跟随 DBX main 每日漂移；升级以 release/tag 为节点，记录差异。
4. 发现 Host API 行为变化：更新 `host/` 文档 + `analysis/evidence-index.md`，并在 `assessment` 标注影响。

## 9. 常见问题

| 现象 | 排查 |
|---|---|
| iframe 空白 | CSP、资源路径越界、`ui.root` 配置、控制台错误 |
| `queryData` 不可用 | `capabilities.dataApi`、DBX 版本、桌面 vs web、manifest 权限 |
| 授权弹窗不出现/直接拒绝 | grant 已撤销、连接未打开、插件 id 变化 |
| 保存无反应 | `host.saveFile` 是否可用、字节类型（Uint8Array）、取消返回 null |
| 图表不显示 | 图表库 eval/worker 被 CSP 阻止、容器尺寸、主题变量 |
| dev-host 报方法未实现 | 预期行为：dev-host 不覆盖 data API/result-view/文件系统 |
| 升级后权限报错 | manifest 权限未声明、后端校验加强、版本能力变化 |

## 10. 产出物

- `M0` 记录：`docs/development/records/<date>-m0.md`（环境、命令、观察、go/no-go）。
- 每个里程碑更新 `testing/acceptance.md` 的签收表与 `development/roadmap.md` 状态。
