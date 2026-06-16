// Data page — at-a-glance stats, searchable/sortable appropriations explorer,
// and the capital projects table. All figures come straight from budget.json.
import { dollars, compactDollars, isLineItem, FUNCTIONAL_GROUPS } from "./helpers.js";

const NON_NUMERIC_KEYS = new Set([
  "department_category",
  "project_title",
  "project_no",
  "source_sheet",
  "notes",
]);

function cell(value, isNumeric) {
  if (value === null || value === undefined || value === "") return "—";
  if (isNumeric) return dollars(value, 2);
  return value;
}

// --------------------------------------------------------------- CSV helper

function toCsv(headers, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

function downloadCsv(filename, csv) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------- At-a-glance stats

export function initDataStats(data) {
  const host = document.getElementById("data-stats");
  if (!host) return;
  const h = data.headline;
  const cards = [
    { label: "Total 2026 budget", v: h.total_budget },
    { label: "Raised by property taxes", v: h.municipal_property_tax },
    { label: "Surplus (savings) used", v: h.surplus_used },
    { label: "Spending within the state cap", v: h.appropriations_within_caps },
    { label: "Spending excluded from the cap", v: h.appropriations_excluded_from_caps },
    { label: "Reserve for uncollected taxes", v: h.reserve_for_uncollected_taxes },
  ];
  host.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${compactDollars(c.v.amount)}</div>
        <div class="stat-note">Source: ${c.v.source}</div>
      </div>`
    )
    .join("");
}

// ---------------------------------------------------------------- Explorer

const SORTERS = {
  "amount-desc": (a, b) => (b.appropriated_2026_usd || 0) - (a.appropriated_2026_usd || 0),
  "amount-asc": (a, b) => (a.appropriated_2026_usd || 0) - (b.appropriated_2026_usd || 0),
  "change-desc": (a, b) =>
    Math.abs((b.appropriated_2026_usd || 0) - (b.appropriated_2025_usd || 0)) -
    Math.abs((a.appropriated_2026_usd || 0) - (a.appropriated_2025_usd || 0)),
  "name-asc": (a, b) =>
    (a.account_program || a.department_division_as_printed || "").localeCompare(
      b.account_program || b.department_division_as_printed || ""
    ),
};

function changeCell(row) {
  const a = row.appropriated_2026_usd;
  const b = row.appropriated_2025_usd;
  if (a === null || a === undefined || b === null || b === undefined)
    return '<span class="data-change">—</span>';
  const d = a - b;
  if (d === 0) return '<span class="data-change is-flat">$0</span>';
  const up = d > 0;
  return `<span class="data-change ${up ? "is-up" : "is-down"}">${up ? "▲" : "▼"} ${dollars(
    Math.abs(d),
    0
  )}</span>`;
}

export function initExplorer(data) {
  const rows = data.tables.appropriations.rows;
  const search = document.getElementById("explorer-search");
  const groupSelect = document.getElementById("explorer-group");
  const capsSelect = document.getElementById("explorer-caps");
  const sortSelect = document.getElementById("explorer-sort");
  const showTotals = document.getElementById("explorer-show-totals");
  const exportBtn = document.getElementById("explorer-export");
  const body = document.getElementById("explorer-body");
  const count = document.getElementById("explorer-count");

  // Functional-group filter, ordered by spend (largest first) to match the chart.
  const groupOrder = Object.keys(FUNCTIONAL_GROUPS).filter((g) =>
    rows.some((r) => r.functional_group === g)
  );
  for (const group of groupOrder) {
    const opt = document.createElement("option");
    opt.value = group;
    opt.textContent = group;
    groupSelect.appendChild(opt);
  }

  function matchesSearch(row, term) {
    if (!term) return true;
    const haystack = [
      row.department_division_as_printed,
      row.account_program,
      row.type,
      row.fcoa,
      row.source_sheet,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  }

  function getFiltered() {
    const term = search.value.trim().toLowerCase();
    const groupFilter = groupSelect.value;
    const capsFilter = capsSelect.value;
    const includeTotals = showTotals.checked;
    return rows.filter((row) => {
      if (!includeTotals && !isLineItem(row)) return false;
      if (groupFilter && row.functional_group !== groupFilter) return false;
      if (capsFilter && row.caps_status !== capsFilter) return false;
      if (!matchesSearch(row, term)) return false;
      return true;
    });
  }

  function render() {
    const filtered = getFiltered();
    const sorter = SORTERS[sortSelect.value] || SORTERS["amount-desc"];

    // Sum only real line items so the figure reconciles with the charts.
    const lineTotal = filtered
      .filter(isLineItem)
      .reduce((acc, r) => acc + (r.appropriated_2026_usd || 0), 0);
    count.innerHTML = `Showing <strong>${filtered.length.toLocaleString()}</strong> of ${rows.length.toLocaleString()} published rows &middot; <strong>${compactDollars(
      lineTotal
    )}</strong> across the line items shown`;

    // Group rows for display, largest-group-first, sorting within each group.
    const byGroup = new Map();
    for (const row of filtered) {
      if (!byGroup.has(row.functional_group)) byGroup.set(row.functional_group, []);
      byGroup.get(row.functional_group).push(row);
    }
    const orderedGroups = groupOrder.filter((g) => byGroup.has(g));
    for (const g of byGroup.keys()) if (!orderedGroups.includes(g)) orderedGroups.push(g);

    let html = "";
    for (const group of orderedGroups) {
      const groupRows = byGroup.get(group).slice().sort(sorter);
      const groupTotal = groupRows
        .filter(isLineItem)
        .reduce((acc, r) => acc + (r.appropriated_2026_usd || 0), 0);
      html += `<tr class="group-header-row"><td colspan="3">${group}</td><td class="num">${compactDollars(
        groupTotal
      )}</td><td colspan="3"></td></tr>`;
      for (const row of groupRows) {
        const isTotal = row.type === "Total" || row.type === "Grand Total";
        const capsBadge =
          row.caps_status === "Within CAPS"
            ? '<span class="badge badge-within">Within CAPS</span>'
            : row.caps_status === "Excluded from CAPS"
            ? '<span class="badge badge-excluded">Excluded</span>'
            : "—";
        // Primary = the specific account/program; the department path is a
        // muted subtitle, so the line reads in one wide column instead of two.
        const primary = row.account_program || row.department_division_as_printed || "—";
        const sub =
          row.account_program && row.department_division_as_printed
            ? `<span class="cell-sub">${row.department_division_as_printed}</span>`
            : "";
        html += `
          <tr class="${isTotal ? "row-total" : ""}">
            <td class="cell-item"><strong>${primary}</strong>${sub}</td>
            <td>${row.fcoa || "—"}</td>
            <td>${capsBadge}</td>
            <td class="num">${cell(row.appropriated_2026_usd, true)}</td>
            <td class="num">${cell(row.appropriated_2025_usd, true)}</td>
            <td class="num">${changeCell(row)}</td>
            <td class="cell-src">${row.source_sheet || "—"}</td>
          </tr>`;
      }
    }
    body.innerHTML = html || `<tr><td colspan="7" class="table-empty">No rows match those filters.</td></tr>`;
  }

  function exportCsv() {
    const filtered = getFiltered().slice().sort(SORTERS[sortSelect.value] || SORTERS["amount-desc"]);
    const headers = [
      "Functional group",
      "Department / Division",
      "Account / Program",
      "Type",
      "FCOA",
      "CAPS status",
      "2026 amount",
      "2025 amount",
      "Change",
      "Source sheet",
    ];
    const csv = toCsv(
      headers,
      filtered.map((r) => {
        const a = r.appropriated_2026_usd;
        const b = r.appropriated_2025_usd;
        const change = a !== null && a !== undefined && b !== null && b !== undefined ? a - b : "";
        return [
          r.functional_group,
          r.department_division_as_printed,
          r.account_program,
          r.type,
          r.fcoa,
          r.caps_status,
          a ?? "",
          b ?? "",
          change,
          r.source_sheet,
        ];
      })
    );
    downloadCsv("ww-2026-appropriations.csv", csv);
  }

  search.addEventListener("input", render);
  groupSelect.addEventListener("change", render);
  capsSelect.addEventListener("change", render);
  sortSelect.addEventListener("change", render);
  showTotals.addEventListener("change", render);
  exportBtn?.addEventListener("click", exportCsv);
  render();
}

// ------------------------------------------------------------ Capital table

const CAPITAL_VIEWS = {
  "2026": "capital_budget_2026",
  "6yr": "6_year_capital_program",
};

// Instead of a dozen tiny numeric columns, each project shows ONE wide
// "funding mix" cell — a stacked bar of these sources, with the exact figures
// on hover and in the CSV. This uses the horizontal space and ends the scroll.
const CAPITAL_SOURCES = {
  "2026": [
    { key: "2026_budget_appropriations", label: "2026 appropriation", color: "#0ea5e9" },
    { key: "capital_improvement_fund", label: "Capital Improvement Fund", color: "#22c55e" },
    { key: "capital_surplus", label: "Capital surplus", color: "#14b8a6" },
    { key: "grants_in_aid_and_other_funds", label: "Grants & other funds", color: "#a855f7" },
    { key: "debt_authorized", label: "Debt authorized", color: "#f59e0b" },
    { key: "to_be_funded_in_future_years", label: "To be funded (future years)", color: "#94a3b8" },
  ],
  "6yr": [
    { key: "fy2026", label: "FY2026", color: "#0c4a6e" },
    { key: "fy2027", label: "FY2027", color: "#0369a1" },
    { key: "fy2028", label: "FY2028", color: "#0ea5e9" },
    { key: "fy2029", label: "FY2029", color: "#22d3ee" },
    { key: "fy2030", label: "FY2030", color: "#5eead4" },
    { key: "fy2031", label: "FY2031", color: "#a7f3d0" },
  ],
};

function fundingBar(sources, getVal) {
  const parts = sources
    .map((s) => ({ ...s, v: Number(getVal(s.key)) || 0 }))
    .filter((p) => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (!total) return '<span class="cap-bar-empty">—</span>';
  const segs = parts
    .map((p) => {
      const t = `${p.label}: ${dollars(p.v, 2)}`.replace(/"/g, "&quot;");
      return `<span style="width:${((p.v / total) * 100).toFixed(2)}%;background:${p.color}" title="${t}"></span>`;
    })
    .join("");
  const full = parts.map((p) => `${p.label}: ${dollars(p.v, 2)}`).join(" · ").replace(/"/g, "&quot;");
  return `<div class="cap-bar" title="${full}">${segs}</div>`;
}

export function initCapital(data) {
  const search = document.getElementById("capital-search");
  const deptSelect = document.getElementById("capital-dept");
  const toggle = document.getElementById("capital-view-toggle");
  const exportBtn = document.getElementById("capital-export");
  const legendEl = document.getElementById("capital-legend");
  const thead = document.getElementById("capital-thead");
  const body = document.getElementById("capital-body");
  const count = document.getElementById("capital-count");

  const allDepartments = [
    ...new Set(data.tables.capital_budget_2026.rows.map((r) => r.department_category)),
  ].sort();
  for (const dept of allDepartments) {
    const opt = document.createElement("option");
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  }

  let currentView = "2026";

  function getView() {
    const table = data.tables[CAPITAL_VIEWS[currentView]];
    const columns = table.columns.filter((c) => c.key !== "notes");
    const deptFilter = deptSelect.value;
    const term = (search?.value || "").trim().toLowerCase();
    const realRows = table.rows.filter((row) => row.project_no !== null);
    const filtered = realRows
      .filter((row) => !deptFilter || row.department_category === deptFilter)
      .filter((row) => {
        if (!term) return true;
        return [row.project_title, row.department_category, row.project_no]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => (b.estimated_total_cost || 0) - (a.estimated_total_cost || 0));
    return { columns, realRows, filtered };
  }

  function render() {
    const { realRows, filtered } = getView();
    const sources = CAPITAL_SOURCES[currentView];
    const mixLabel = currentView === "2026" ? "How it's funded" : "Spending by fiscal year";

    if (legendEl) {
      legendEl.innerHTML = sources
        .map((s) => `<span class="cap-legend-item"><i style="background:${s.color}"></i>${s.label}</span>`)
        .join("");
    }

    thead.innerHTML = `<tr>
      <th>Project</th>
      <th>No.</th>
      <th class="num">Estimated total</th>
      <th>${mixLabel}</th>
    </tr>`;

    count.innerHTML = `Showing <strong>${filtered.length.toLocaleString()}</strong> of ${realRows.length.toLocaleString()} projects`;

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="4" class="table-empty">No projects match that filter.</td></tr>`;
      return;
    }

    let html = "";
    for (const row of filtered) {
      const dept = row.department_category
        ? `<span class="cell-sub">${row.department_category}</span>`
        : "";
      html += `
        <tr>
          <td class="cell-item"><strong>${row.project_title || "—"}</strong>${dept}</td>
          <td>${row.project_no || "—"}</td>
          <td class="num">${cell(row.estimated_total_cost, true)}</td>
          <td>${fundingBar(sources, (k) => row[k])}</td>
        </tr>`;
    }

    // Totals row, with an aggregate funding-mix bar across the filtered set.
    const sumEst = filtered.reduce((acc, r) => acc + (r.estimated_total_cost || 0), 0);
    const sumByKey = {};
    for (const s of sources)
      sumByKey[s.key] = filtered.reduce((acc, r) => acc + (Number(r[s.key]) || 0), 0);
    html += `
      <tr class="row-total">
        <td class="cell-item"><strong>Total &middot; ${filtered.length} project${
      filtered.length === 1 ? "" : "s"
    }</strong></td>
        <td>—</td>
        <td class="num">${dollars(sumEst, 2)}</td>
        <td>${fundingBar(sources, (k) => sumByKey[k])}</td>
      </tr>`;

    body.innerHTML = html;
  }

  function exportCsv() {
    const { columns, filtered } = getView();
    const headers = columns.map((c) => c.label);
    const csv = toCsv(
      headers,
      filtered.map((row) => columns.map((c) => row[c.key] ?? ""))
    );
    downloadCsv(`ww-capital-${currentView === "2026" ? "2026" : "6yr"}.csv`, csv);
  }

  search?.addEventListener("input", render);
  deptSelect.addEventListener("change", render);
  toggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    currentView = btn.dataset.view;
    toggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
  exportBtn?.addEventListener("click", exportCsv);

  render();
}
