// West Windsor 2026 Budget Visualizer — index page rendering
import { renderSankey, renderDonut } from "./charts.js";
import { initCalculator } from "./calculator.js";
import { initGlossary, attachGlossaryTooltips } from "./glossary.js";
import {
  GROUP_DETAILS,
  REVENUE_DETAILS,
  dollars,
  compactDollars,
  getSpendingByGroup,
  getDepartmentBreakdown,
  getMiscRevenueBreakdown,
  getRevenueSources,
  loadBudget,
} from "./helpers.js";

function renderHeadlineStats(data) {
  const h = data.headline;
  const items = [
    { label: "Total 2026 budget", value: compactDollars(h.total_budget.amount), source: h.total_budget.source },
    { label: "Paid for by property taxes", value: compactDollars(h.municipal_property_tax.amount), source: h.municipal_property_tax.source },
    { label: "Prior-year savings (surplus) used", value: compactDollars(h.surplus_used.amount), source: h.surplus_used.source },
    { label: "Savings remaining after 2026", value: compactDollars(h.fund_balance_at_2025_year_end.amount - h.surplus_used.amount), source: h.fund_balance_at_2025_year_end.source },
    { label: "Spending within the state cap", value: compactDollars(h.appropriations_within_caps.amount), source: h.appropriations_within_caps.source },
    { label: "Spending excluded from the cap (debt, capital, grants, etc.)", value: compactDollars(h.appropriations_excluded_from_caps.amount), source: h.appropriations_excluded_from_caps.source },
  ];

  const container = document.getElementById("headline-stats");
  container.innerHTML = items
    .map(
      (item) => `
      <div class="stat-card">
        <div class="stat-label">${item.label}</div>
        <div class="stat-value">${item.value}</div>
        <div class="stat-note">Source: ${item.source}</div>
      </div>`
    )
    .join("");
}

function renderCaps(data) {
  const h = data.headline;
  const appropMax = h.appropriations_within_caps.amount + Math.abs(h.appropriation_cap_under.amount);
  const levyMax = h.municipal_property_tax.amount + Math.abs(h.levy_cap_under.amount);

  const cards = [
    {
      label: "Appropriation Cap",
      used: h.appropriations_within_caps.amount,
      max: appropMax,
      under: Math.abs(h.appropriation_cap_under.amount),
      desc: "This caps how much the township can budget for most day-to-day spending (it doesn't apply to debt payments, capital projects, or grants). The 2026 budget spends almost the entire amount allowed.",
      source: h.appropriation_cap_under.source,
    },
    {
      label: "2% Levy Cap",
      used: h.municipal_property_tax.amount,
      max: levyMax,
      under: Math.abs(h.levy_cap_under.amount),
      desc: "This caps how much the total property-tax bill collected townshipwide can grow each year &mdash; by law, no more than 2% over last year (with limited exceptions). It directly limits how much your tax bill can rise.",
      source: h.levy_cap_under.source,
    },
  ];

  const container = document.getElementById("caps-grid");
  container.innerHTML = cards
    .map((c) => {
      const pct = (c.used / c.max) * 100;
      return `
      <div class="cap-card">
        <div class="cap-label">${c.label}</div>
        <div class="cap-bar-row">
          <div class="cap-bar-track">
            <div class="cap-bar-fill" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="cap-bar-pct">${pct.toFixed(1)}% used</div>
        </div>
        <div class="cap-bar-labels">
          <span>${dollars(c.used, 0)} budgeted</span>
          <span>${dollars(c.max, 0)} legal limit</span>
        </div>
        <div class="cap-value">${dollars(c.under, 0)} under</div>
        <p>${c.desc}</p>
        <p class="cap-source">Source: ${c.source}</p>
      </div>`;
    })
    .join("");
}

function renderSankeyDetail(data, node, total) {
  const panel = document.getElementById("sankey-detail");
  const inner = document.getElementById("sankey-detail-inner");

  if (!node) {
    panel.classList.remove("is-open");
    panel.style.maxHeight = "0px";
    return;
  }

  let summary = "";
  let breakdown = [];

  if (node.side === "right") {
    summary = GROUP_DETAILS[node.name] || "";
    breakdown = getDepartmentBreakdown(data, node.name);
  } else if (node.side === "left") {
    summary = REVENUE_DETAILS[node.name] || "";
    if (node.name === "Fees, state aid & other revenue") {
      breakdown = getMiscRevenueBreakdown(data);
    }
  } else {
    summary = "The total of every revenue source on the left, which is then spent across the categories on the right. This is the township's full 2026 municipal budget.";
  }

  const pct = ((node.value / total) * 100).toFixed(1);

  inner.innerHTML = `
    <h4>${node.name}</h4>
    <div class="detail-amount">${dollars(node.value, 2)} (${pct}% of the budget)</div>
    <p>${summary}</p>
    ${
      breakdown.length
        ? `<div class="detail-breakdown">${breakdown
            .map((b) => `<div class="detail-breakdown-row"><span>${b.label}</span><span>${dollars(b.amount, 0)}</span></div>`)
            .join("")}</div>`
        : ""
    }`;

  inner.style.borderLeftColor = node.color || "var(--brand-500)";

  // Animate to the content's natural height.
  panel.style.maxHeight = "0px";
  panel.classList.remove("is-open");
  requestAnimationFrame(() => {
    panel.classList.add("is-open");
    panel.style.maxHeight = `${inner.scrollHeight + 24}px`;
  });
}

async function init() {
  const data = await loadBudget();

  const total = data.headline.total_budget.amount;
  renderHeadlineStats(data);
  renderCaps(data);
  renderDonut(getRevenueSources(data), total, "revenue-donut", "revenue-total", (item) => REVENUE_DETAILS[item.label] || "");
  renderDonut(getSpendingByGroup(data), total, "spending-donut", "spending-total", (item) => GROUP_DETAILS[item.group] || item.blurb || "");
  renderSankey(data, (node, nodeTotal) => renderSankeyDetail(data, node, nodeTotal ?? total));
  initCalculator(data);
  initGlossary(data);
  attachGlossaryTooltips(data);
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="background:#fee2e2;color:#991b1b;padding:1rem;text-align:center;font-family:sans-serif;">
      Sorry, something went wrong loading the budget data. Please refresh the page.
    </div>`
  );
});
