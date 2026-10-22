/*
 * 原型假数据。
 *
 * 所有数字都是编的，但形状必须真实：列名是 SQL 输出列名（不是中文标题），
 * 数值列用字符串承载（宿主 result 的 transport 决定），时间列是 ISO 字符串。
 * 看到这份数据就该能反推 data-model.md 里的 Dataset.fields[].transport。
 */
(function () {
  "use strict";

  var MOCK = {};

  /* ---------- 文档（本机 JSON 资产） ---------- */
  MOCK.doc = {
    name: "零售经营周报.dbxreport.json",
    documentId: "doc_7f3c1b",
    formatVersion: "0.1",
    revision: 18,
    savedAt: "10:24",
    timezone: "Asia/Shanghai",
    counts: { datasets: 2, metrics: 5, reports: 3, dashboards: 1 },
    sourceAliases: [
      { id: "src_sales", label: "销售库（只读）", required: true },
      { id: "src_ops", label: "履约库（只读）", required: true },
      { id: "src_member", label: "会员库", required: false },
      { id: "src_region", label: "区域维表", required: false },
      { id: "src_coupon", label: "营销库", required: false }
    ]
  };

  /* ---------- 可用连接（宿主枚举，插件不能自己连） ---------- */
  MOCK.connections = [
    { id: "conn_pg_prod", name: "pg-sales-prod", engine: "PostgreSQL", status: "open", detail: "库 sales · 账号 sales_ro" },
    { id: "conn_pg_prod2", name: "pg-sales-prod", engine: "PostgreSQL", status: "open", detail: "库 sales_archive · 账号 sales_ro" },
    { id: "conn_sqlite", name: "sqlite-local", engine: "SQLite", status: "closed", detail: "data\\sales.db" },
    { id: "conn_mysql", name: "mysql-legacy", engine: "MySQL 5.6", status: "open", detail: "未适配方言" }
  ];

  /* ---------- 结果集样本 A：区域 × 渠道 ---------- */
  MOCK.columns = [
    { key: "region", label: "region", mono: false },
    { key: "channel", label: "channel", mono: false },
    { key: "orders", label: "orders", num: true },
    { key: "gmv", label: "gmv", num: true, mono: true },
    { key: "aov", label: "aov", num: true, mono: true }
  ];

  MOCK.rows = [
    { region: "华东", channel: "天猫", orders: "1,284", gmv: "1289345.67", aov: "1004.16" },
    { region: "华南", channel: "抖音", orders: "1,102", gmv: "742180.44", aov: "673.48" },
    { region: "华东", channel: "京东", orders: "968", gmv: "986220.10", aov: "1018.82" },
    { region: "华北", channel: "天猫", orders: "874", gmv: "701332.09", aov: "802.44" },
    { region: "华中", channel: "抖音", orders: "611", gmv: "310770.23", aov: "508.63" },
    { region: "西南", channel: "京东", orders: "402", gmv: "288140.55", aov: "716.77" },
    { region: "东北", channel: "天猫", orders: "233", gmv: "141206.80", aov: "606.04" },
    { region: "西北", channel: null, orders: "96", gmv: "48213.05", aov: "502.22" }
  ];

  /* 运行元信息：以宿主 queryData 返回字段为准 */
  MOCK.run = {
    elapsedMs: 412,
    rowsReturned: 8,
    maxRows: 500,
    truncated: false,
    columnsCount: 5,
    bytesApprox: "1.2 KiB",
    ranAt: "10:23:58"
  };

  /* 截断样本：同一句 SQL 把 maxRows 调小 */
  MOCK.runTruncated = {
    elapsedMs: 168,
    rowsReturned: 500,
    maxRows: 500,
    truncated: true,
    columnsCount: 5,
    bytesApprox: "6.7 MiB",
    ranAt: "10:31:02"
  };

  /* ---------- 报表（已确认口径） ---------- */
  MOCK.report = {
    id: "rpt_gmv_region",
    title: "各区成交额",
    datasetId: "ds_sales_week",
    datasetName: "周销售明细（按区域×渠道聚合）",
    viewType: "bar",
    x: "region",
    y: ["gmv"],
    limit: { mode: "top_n", n: 6 },
    totals: { mode: "sql_marker", column: "is_total", value: "1" },
    basis: { queryHash: "q_8f21ac", fieldsHash: "f_2d90b1", confirmedAt: "2026-10-21 18:12" },
    allowedControls: { filter: true, sort: true }
  };

  /* 与当前数据集不一致的 basis（触发 stale） */
  MOCK.basisStale = {
    saved: { queryHash: "q_8f21ac", fieldsHash: "f_2d90b1", confirmedAt: "2026-10-21 18:12" },
    current: { queryHash: "q_c41e77", fieldsHash: "f_2d90b1", confirmedAt: "2026-10-22 09:40" }
  };

  /* ---------- 看板 ---------- */
  MOCK.dashboard = {
    id: "dash_weekly",
    title: "零售经营周报",
    onOpenRefresh: false,
    cardCount: 6,
    refreshedAt: "10:32"
  };

  /* ---------- 错误码样本（states.html 与各页内联提示共用） ---------- */
  MOCK.errors = [
    { code: "HOST_API_UNSUPPORTED", title: "宿主版本不支持", detail: "当前 DBX 未提供 host.data.query。", form: "全屏阻断", retry: "no", owner: "M0" },
    { code: "PLUGIN_PERMISSION_DENIED", title: "缺少声明权限", detail: "manifest 未声明 host.data:read。", form: "内联阻断", retry: "no", owner: "M0" },
    { code: "DATA_ACCESS_NOT_GRANTED", title: "本次未授予数据访问", detail: "授权弹框被拒绝，本次运行不再弹。", form: "内联 + 重新授权", retry: "yes", owner: "M0" },
    { code: "CONNECTION_NOT_OPEN", title: "连接已关闭", detail: "请在 DBX 中打开连接后重试。", form: "绑定行内", retry: "yes", owner: "M1" },
    { code: "CONNECTION_UNSUPPORTED", title: "连接类型不支持", detail: "该连接方言未适配。", form: "绑定行内", retry: "no", owner: "M1" },
    { code: "SQL_REJECTED", title: "SQL 被拒绝", detail: "宿主只读分类器判定不可执行。", form: "编辑器内联", retry: "edit", owner: "M1" },
    { code: "QUERY_TIMEOUT", title: "执行超时", detail: "达到 timeoutMs 上限，服务端仍在执行。", form: "结果区内联", retry: "yes", owner: "M1" },
    { code: "QUERY_TRUNCATED", title: "结果已截断", detail: "只取回前 N 行，不是完整结果。", form: "样本横幅", retry: "no", owner: "M1" },
    { code: "RESULT_TOO_LARGE", title: "结果过大", detail: "序列化超过 8 MiB，请减列或先聚合。", form: "结果区内联", retry: "yes", owner: "M1" },
    { code: "SCHEMA_MISMATCH", title: "字段契约不符", detail: "当前字段与已确认契约不一致。", form: "确认对话框", retry: "confirm", owner: "M1" },
    { code: "SCHEMA_DRIFT", title: "结构漂移", detail: "打开时字段与保存时不同。", form: "报表角标 + 差异", retry: "confirm", owner: "M2" },
    { code: "FILE_CANCELED", title: "已取消保存", detail: "用户取消，未写入任何文件。", form: "toast", retry: "yes", owner: "M0" },
    { code: "FILE_WRITE_FAILED", title: "写入失败", detail: "磁盘或权限错误。", form: "对话框", retry: "yes", owner: "M0" },
    { code: "FILE_TOO_LARGE", title: "文件过大", detail: "超过单次保存上限。", form: "对话框", retry: "no", owner: "M0" },
    { code: "FILE_UNSUPPORTED", title: "文件不受支持", detail: "不是本工具的文档文件。", form: "打开失败页", retry: "no", owner: "M0" },
    { code: "FILE_HANDLE_EXHAUSTED", title: "打开文件过多", detail: "请先关闭部分已打开文件。", form: "内联", retry: "yes", owner: "M1" },
    { code: "DRAFT_SAVE_FAILED", title: "草稿未保存", detail: "storage 写入失败，正文不受影响。", form: "轻提示", retry: "yes", owner: "M1" },
    { code: "BINDING_REQUIRED", title: "源未绑定", detail: "先选择本机连接才能运行。", form: "绑定区内联", retry: "bind", owner: "M1" },
    { code: "BINDING_AMBIGUOUS", title: "存在多个候选", detail: "同名连接多于一个，需指定。", form: "绑定选择器", retry: "bind", owner: "M1" },
    { code: "BINDING_MISMATCH", title: "连接与保存时不同", detail: "确认后继续，或改回原连接。", form: "行内警告", retry: "confirm", owner: "M1" },
    { code: "ABANDONED", title: "已放弃等待", detail: "响应被丢弃，但宿主可能仍在执行。", form: "卡片状态", retry: "yes", owner: "M2" },
    { code: "FORMAT_VERSION_UNSUPPORTED", title: "文件版本不兼容", detail: "formatVersion 高于本插件支持范围。", form: "全屏阻断", retry: "no", owner: "M1" },
    { code: "STORAGE_QUOTA", title: "存储配额不足", detail: "偏好/草稿写入受限。", form: "轻提示", retry: "yes", owner: "M1" },
    { code: "AI_UNAVAILABLE", title: "AI 不可用", detail: "仅 M3 之后存在。", form: "未实现", retry: "no", owner: "M3" }
  ];

  /* ---------- 表格渲染挂载（配合 proto.js 的 Proto.table） ---------- */
  window.PROTO_TABLES = {
    sample: { columns: MOCK.columns, rows: MOCK.rows }
  };

  window.MOCK = MOCK;
})();
