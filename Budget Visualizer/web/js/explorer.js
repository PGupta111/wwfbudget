// Searchable appropriations explorer + capital projects table
import { dollars, isLineItem, FUNCTIONAL_GROUPS } from "./helpers.js";

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

// ---------------------------------------------------------------- Explorer

export function initExplorer(data) {
  const rows = data.tables.appropriations.rows;
  const search = document.getElementById("explorer-search");
  const groupSelect = document.getElementById("explorer-group");
  const capsSelect = document.getElementById("explorer-caps");
  const showTotals = document.getElementById("explorer-show-totals");
  const body = document.getElementById("explorer-body");
  const count = document.getElementById("explorer-count");

  // Populate functional-group filter, ordered by spend (largest first) to
  // match the chart legend.
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

  function render() {
    const term = search.value.trim().toLowerCase();
    const groupFilter = groupSelect.value;
    const capsFilter = capsSelect.value;
    const includeTotals = showTotals.checked;

    let filtered = rows.filter((row) => {
      if (!includeTotals && !isLineItem(row)) return false;
      if (groupFilter && row.functional_group !== groupFilter) return false;
      if (capsFilter && row.caps_status !== capsFilter) return false;
      if (!matchesSearch(row, term)) return false;
      return true;
    });

    count.textContent = `Showing ${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} published rows`;

    // Group rows for display, ordered largest-group-first (matching the
    // chart), each with a sticky header row.
    const byGroup = new Map();
    for (const row of filtered) {
      if (!byGroup.has(row.functional_group)) byGroup.set(row.functional_group, []);
      byGroup.get(row.functional_group).push(row);
    }

    const orderedGroups = groupOrder.filter((g) => byGroup.has(g));
    // Catch any group not in our known order (shouldn't normally happen).
    for (const g of byGroup.keys()) if (!orderedGroups.includes(g)) orderedGroups.push(g);

    let html = "";
    for (const group of orderedGroups) {
      html += `<tr class="group-header-row"><td colspan="8">${group}</td></tr>`;
      for (const row of byGroup.get(group)) {
        const isTotal = row.type === "Total" || row.type === "Grand Total";
        const capsBadge =
          row.caps_status === "Within CAPS"
            ? '<span class="badge badge-within">Within CAPS</span>'
            : row.caps_status === "Excluded from CAPS"
            ? '<span class="badge badge-excluded">Excluded</span>'
            : "—";
        html += `
          <tr class="${isTotal ? "row-total" : ""}">
            <td>${row.department_division_as_printed || "—"}</td>
            <td>${row.account_program || "—"}</td>
            <td>${row.type || "—"}</td>
            <td>${row.fcoa || "—"}</td>
            <td>${capsBadge}</td>
            <td class="num">${cell(row.appropriated_2026_usd, true)}</td>
            <td class="num">${cell(row.appropriated_2025_usd, true)}</td>
            <td>${row.source_sheet || "—"}</td>
          </tr>`;
      }
    }
    body.innerHTML = html;
  }

  search.addEventListener("input", render);
  groupSelect.addEventListener("change", render);
  capsSelect.addEventListener("change", render);
  showTotals.addEventListener("change", render);
  render();
}

// ------------------------------------------------------------ Capital table

const CAPITAL_VIEWS = {
  "2026": "capital_budget_2026",
  "6yr": "6_year_capital_program",
};

export function initCapital(data) {
  const deptSelect = document.getElementById("capital-dept");
  const toggle = document.getElementById("capital-view-toggle");
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

  function render() {
    const table = data.tables[CAPITAL_VIEWS[currentView]];
    const columns = table.columns.filter((c) => c.key !== "notes");
    const deptFilter = deptSelect.value;

    thead.innerHTML =
      "<tr>" +
      columns
        .map((c) => `<th class="${NON_NUMERIC_KEYS.has(c.key) ? "" : "num"}">${c.label}</th>`)
        .join("") +
      "</tr>";

    const realRows = table.rows.filter((row) => row.project_no !== null);
    const filtered = realRows
      .filter((row) => !deptFilter || row.department_category === deptFilter)
      .sort((a, b) => (b.estimated_total_cost || 0) - (a.estimated_total_cost || 0));
    count.textContent = `Showing ${filtered.length.toLocaleString()} of ${realRows.length.toLocaleString()} projects`;

    let html = "";
    for (const row of filtered) {
      html += "<tr>";
      for (const c of columns) {
        const isNumeric = !NON_NUMERIC_KEYS.has(c.key);
        html += `<td class="${isNumeric ? "num" : ""}">${cell(row[c.key], isNumeric)}</td>`;
      }
      html += "</tr>";
    }

    // Totals row across the filtered projects.
    if (filtered.length) {
      html += '<tr class="row-total">';
      for (const c of columns) {
        if (NON_NUMERIC_KEYS.has(c.key)) {
          html += `<td>${c.key === "department_category" ? "Total" : ""}</td>`;
          continue;
        }
        const sum = filtered.reduce((acc, row) => acc + (row[c.key] || 0), 0);
        html += `<td class="num">${dollars(sum, 2)}</td>`;
      }
      html += "</tr>";
    }

    body.innerHTML = html;
  }

  deptSelect.addEventListener("change", render);
  toggle.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    currentView = btn.dataset.view;
    toggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });

  render();
}
