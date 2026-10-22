/*
 * 原型交互脚本：主题切换、场景切换、对话框、toast、表格渲染。
 *
 * 只做"让评审者能点开看状态"的最小交互，不承载任何产品逻辑。
 * 任何真实行为（取数、保存、绑定、计算）都由 mock 数据直接写成静态结果。
 *
 * 页面约定：
 *   <body data-page="报告设计">
 *   <script src="../proto.js"></script> 之后声明 window.PROTO_SCENARIOS = [{id,label}...]
 *   内容区用 <section class="scenario" data-scenario="ok">…</section> 分场景，Proto 负责显示/隐藏。
 *   场景按钮由原型工具条自动生成（data-proto-scenarios），页面不要手写。
 */
(function () {
  "use strict";

  var Proto = {};
  var theme = "light";
  var scenarios = [];
  var activeScenario = null;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* ---------- 主题 ---------- */
  Proto.theme = function (mode) {
    theme = mode === "dark" ? "dark" : "light";
    document.documentElement.dataset.dbxTheme = theme;
    $$("[data-proto-theme]").forEach(function (btn) {
      btn.textContent = theme === "dark" ? "亮色" : "暗色";
      btn.setAttribute("aria-label", theme === "dark" ? "切换到亮色主题" : "切换到暗色主题");
    });
    try {
      location.replace("#" + theme);
    } catch (err) {
      /* file:// 下个别环境禁止改 hash，忽略即可 */
    }
  };

  /* ---------- 场景切换 ---------- */
  Proto.scenario = function (id) {
    if (!id) {
      return;
    }

    activeScenario = id;
    document.body.dataset.activeScenario = id;

    // 只切应用表面：场景按钮也带 data-scenario，必须排除，否则按钮会被一起隐藏
    $$(".scenario[data-scenario]").forEach(function (el) {
      el.hidden = el.dataset.scenario !== id;
    });

    $$("[data-proto-scenarios] > button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.scenario === id ? "true" : "false");
    });

    // 场景标题写在工具条里，截图时能看清当前是哪个状态
    var caption = $("#proto-scenario-caption");
    if (caption) {
      var found = scenarios.filter(function (s) {
        return s.id === id;
      })[0];
      caption.textContent = found ? found.label : "";
    }
  };

  /* ---------- 对话框 ---------- */
  Proto.dialog = function (id, open) {
    var el = $('[data-dialog="' + id + '"]');
    if (!el) {
      return;
    }

    el.hidden = open === undefined ? !el.hidden : !open;

    if (!el.hidden) {
      var focusable = el.querySelector("button, input, select, textarea, [tabindex]");
      if (focusable) {
        focusable.focus({ preventScroll: true });
      }
    }
  };

  /* ---------- toast ---------- */
  Proto.toast = function (text, kind) {
    var wrap = $(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }

    var el = document.createElement("div");
    el.className = "toast";
    var dot = document.createElement("span");
    dot.className = "dot " + (kind === "ok" ? "dot-ok" : kind === "err" ? "dot-err" : "");
    el.appendChild(dot);
    el.appendChild(document.createTextNode(text));
    wrap.appendChild(el);

    setTimeout(function () {
      el.remove();
    }, 3200);
  };

  /* ---------- 表格渲染 ----------
   * spec: { columns:[{key,label,num,mono,width}], rows:[{...}], total:{...} }
   * 只用于把 mock 行变成静态表格，避免在 HTML 里手抄 30 行 <td>。
   */
  Proto.table = function (mount, spec) {
    if (!mount) {
      return;
    }

    var table = document.createElement("table");
    table.className = "table";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    spec.columns.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col.label;
      if (col.num) {
        th.className = "num";
      }
      if (col.width) {
        th.style.width = col.width;
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");

    function buildRow(row, isTotal) {
      var tr = document.createElement("tr");
      if (isTotal) {
        tr.className = "total";
      }
      spec.columns.forEach(function (col) {
        var td = document.createElement("td");
        var value = row[col.key];
        if (value === null || value === undefined || value === "") {
          td.classList.add("null");
          td.textContent = "NULL";
        } else {
          td.textContent = value;
        }
        if (col.num) {
          td.classList.add("num");
        }
        if (col.mono) {
          td.classList.add("mono");
        }
        tr.appendChild(td);
      });
      return tr;
    }

    spec.rows.forEach(function (row) {
      tbody.appendChild(buildRow(row, false));
    });

    if (spec.total) {
      tbody.appendChild(buildRow(spec.total, true));
    }

    table.appendChild(tbody);
    mount.innerHTML = "";
    mount.appendChild(table);
  };

  /* ---------- 格式化（mock 数值直接用字符串，这里只做兜底） ---------- */
  Proto.fmt = {
    int: function (n) {
      return typeof n === "number" ? n.toLocaleString("zh-CN") : n;
    },
    money: function (n) {
      return typeof n === "number"
        ? "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : n;
    },
    pct: function (n, digits) {
      return typeof n === "number" ? (n * 100).toFixed(digits === undefined ? 1 : digits) + "%" : n;
    }
  };

  /* ---------- 启动 ---------- */
  function boot() {
    var hashTheme = location.hash.replace("#", "");
    Proto.theme(hashTheme === "dark" ? "dark" : "light");

    scenarios = window.PROTO_SCENARIOS || [];
    var mount = $("[data-proto-scenarios]");
    if (mount && scenarios.length) {
      scenarios.forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        btn.dataset.scenario = item.id;
        btn.addEventListener("click", function () {
          Proto.scenario(item.id);
        });
        mount.appendChild(btn);
      });
      Proto.scenario(scenarios[0].id);
    }

    $$("[data-proto-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Proto.theme(theme === "dark" ? "light" : "dark");
      });
    });

    // 打开/关闭对话框：data-proto-dialog="id"（打开），data-proto-close 关闭最近的
    $$("[data-proto-dialog]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Proto.dialog(btn.dataset.protoDialog, true);
      });
    });

    $$("[data-proto-toast]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Proto.toast(btn.dataset.protoToast, btn.dataset.protoToastKind);
      });
    });

    document.addEventListener("click", function (ev) {
      var closer = ev.target.closest("[data-proto-close]");
      if (closer) {
        var dialog = closer.closest("[data-dialog]");
        if (dialog) {
          dialog.hidden = true;
        }
        return;
      }

      if (ev.target.classList && ev.target.classList.contains("dialog-backdrop")) {
        ev.target.hidden = true;
      }
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        $$("[data-dialog]").forEach(function (el) {
          el.hidden = true;
        });
      }
    });

    // 表格挂载点：<div data-table="demo"></div> + window.PROTO_TABLES.demo
    var tables = window.PROTO_TABLES || {};
    $$("[data-table]").forEach(function (mountEl) {
      Proto.table(mountEl, tables[mountEl.dataset.table]);
    });
  }

  window.Proto = Proto;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
