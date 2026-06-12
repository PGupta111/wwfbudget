// West Windsor 2026 Budget Visualizer — index page rendering
import { renderSankey, renderDonut } from "./charts.js";
import { initCalculator } from "./calculator.js";
import { attachGlossaryTooltips } from "./glossary.js";
import {
  GROUP_DETAILS,
  REVENUE_DETAILS,
  dollars,
  compactDollars,
  getSpendingByGroup,
  getDepartmentBreakdown,
  getMiscRevenueBreakdown,
  getRevenueSources,
  getTotalAppropriationsYoY,
  getSpendingByGroupYoY,
  getLargestSpendingLines,
  loadBudget,
} from "./helpers.js";

// Maps functional-group / revenue-source labels used throughout the page to
// their matching glossary term, so an inline "?" tooltip can be attached.
const GROUP_GLOSS_TERM = {
  "Debt Service": "Debt Service",
  "Pensions & Statutory Expenditures": "Statutory Expenditures",
  "Reserve for Uncollected Taxes": "Reserve for Uncollected Taxes",
  "Shared Service Agreements (Interlocal)": "Shared Service / Interlocal Agreement",
  "Capital Improvements": "Capital Improvement Fund",
  "Grants — Public & Private Programs": "Grants / Public & Private Programs",
};

const REVENUE_GLOSS_TERM = {
  "Surplus used (savings)": "Surplus / Fund Balance",
  "Fees, state aid & other revenue": "Anticipated Revenue",
};

/** A small "?" badge that opens the glossary popover for `term`, or an empty
 * string if there's no matching term. */
function glossBadge(term) {
  if (!term) return "";
  return `<span class="gloss-term gloss-btn" data-term="${term.replace(/"/g, "&quot;")}" tabindex="0">?</span>`;
}

function renderHeadlineStats(data) {
  const h = data.headline;
  const otherRevenue = h.total_budget.amount - h.municipal_property_tax.amount - h.surplus_used.amount;

  const featured = {
    label: "Total 2026 municipal budget",
    value: compactDollars(h.total_budget.amount),
    source: h.total_budget.source,
  };

  const secondary = [
    { label: "Paid for by property taxes", value: compactDollars(h.municipal_property_tax.amount), source: h.municipal_property_tax.source },
    { label: "Surplus (savings) used", value: compactDollars(h.surplus_used.amount), source: h.surplus_used.source, term: "Surplus / Fund Balance" },
    { label: "Other revenue, fees & aid", value: compactDollars(otherRevenue), source: "Revenues Summary, Sheet 11", term: "Anticipated Revenue" },
    { label: "Spending within the state cap", value: compactDollars(h.appropriations_within_caps.amount), source: h.appropriations_within_caps.source, term: "Within CAPS / Excluded from CAPS" },
    { label: "Spending excluded from the cap", value: compactDollars(h.appropriations_excluded_from_caps.amount), source: h.appropriations_excluded_from_caps.source, term: "Within CAPS / Excluded from CAPS" },
    { label: "Savings remaining after 2026", value: compactDollars(h.fund_balance_at_2025_year_end.amount - h.surplus_used.amount), source: h.fund_balance_at_2025_year_end.source, term: "Surplus / Fund Balance" },
  ];

  const container = document.getElementById("headline-stats");
  container.innerHTML = `
    <div class="stat-feature">
      <div class="stat-feature-label">${featured.label}</div>
      <div class="stat-feature-value">${featured.value}</div>
      <div class="stat-note">Source: ${featured.source}</div>
    </div>
    <div class="stats-grid-secondary">
      ${secondary
        .map(
          (item) => `
        <div class="stat-card">
          <div class="stat-label">${item.label}${glossBadge(item.term)}</div>
          <div class="stat-value">${item.value}</div>
          <div class="stat-note">Source: ${item.source}</div>
        </div>`
        )
        .join("")}
    </div>`;
}

/** Render the 4 revenue-source cards linked to the revenue donut, and wire
 * up two-way hover/click highlighting via the donut controller's
 * highlight()/togglePin(). Returns the card elements so the donut's
 * onSliceActivate callback can mirror highlight state back onto them. */
function renderRevenueCards(items, total, getDonut) {
  const container = document.getElementById("revenue-cards");
  container.innerHTML = items
    .map((item, i) => {
      const pct = ((item.amount / total) * 100).toFixed(1);
      return `
      <div class="donut-card" data-index="${i}" tabindex="0">
        <div class="donut-card-head">
          <span class="donut-card-swatch" style="background:${item.color}"></span>
          <span class="donut-card-label">${item.label}${glossBadge(REVENUE_GLOSS_TERM[item.label])}</span>
        </div>
        <div class="donut-card-amount">${dollars(item.amount, 0)} &middot; ${pct}% of the budget</div>
        <div class="donut-card-hint">Click for details</div>
      </div>`;
    })
    .join("");

  const cards = [...container.querySelectorAll(".donut-card")];
  cards.forEach((card, i) => {
    card.addEventListener("mouseenter", () => getDonut()?.highlight(i));
    card.addEventListener("mouseleave", () => getDonut()?.highlight(null));
    card.addEventListener("click", () => getDonut()?.togglePin(i));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        getDonut()?.togglePin(i);
      }
    });
  });
  return cards;
}

/** Render the top-5 spending-group cards plus a compact list for the
 * remaining categories, linked to the spending donut. Returns all
 * label elements (cards + rows) indexed to match the donut's slice order
 * (getSpendingByGroup's sort order, which is what feeds the pie). */
function renderSpendingCards(items, total, getDonut) {
  const top = items.slice(0, 5);
  const rest = items.slice(5);

  const cardsContainer = document.getElementById("spending-cards");
  cardsContainer.innerHTML = top
    .map((item, i) => {
      const pct = ((item.amount / total) * 100).toFixed(1);
      return `
      <div class="donut-card" data-index="${i}" tabindex="0">
        <div class="donut-card-head">
          <span class="donut-card-swatch" style="background:${item.color}"></span>
          <span class="donut-card-label">${item.group}${glossBadge(GROUP_GLOSS_TERM[item.group])}</span>
        </div>
        <div class="donut-card-amount">${dollars(item.amount, 0)} &middot; ${pct}% of the budget</div>
        <div class="donut-card-hint">Click for details</div>
      </div>`;
    })
    .join("");

  const otherContainer = document.getElementById("spending-other");
  otherContainer.innerHTML = rest
    .map((item, i) => {
      const idx = i + top.length;
      return `
      <div class="donut-other-row" data-index="${idx}" tabindex="0">
        <span class="donut-other-swatch" style="background:${item.color}"></span>
        <span class="donut-other-label">${item.group}${glossBadge(GROUP_GLOSS_TERM[item.group])}</span>
        <span class="donut-other-amount">${dollars(item.amount, 0)}</span>
      </div>`;
    })
    .join("");

  const cards = [...cardsContainer.querySelectorAll(".donut-card"), ...otherContainer.querySelectorAll(".donut-other-row")];
  cards.forEach((el) => {
    const idx = Number(el.dataset.index);
    el.addEventListener("mouseenter", () => getDonut()?.highlight(idx));
    el.addEventListener("mouseleave", () => getDonut()?.highlight(null));
    el.addEventListener("click", () => getDonut()?.togglePin(idx));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        getDonut()?.togglePin(idx);
      }
    });
  });
  return cards;
}

/** "What changed from 2025?" — overall township appropriations total
 * year-over-year, plus the functional groups with the biggest dollar swings.
 * Both the headline figure and the comparison bars animate into view, and
 * the bars re-trigger every time the section scrolls into view. */
function renderYoY(data, total) {
  const overall = getTotalAppropriationsYoY(data);
  const totalUp = overall.change >= 0;
  const totalPct2025 = (overall.total2025 / overall.total2026) * 100;

  const totalEl = document.getElementById("yoy-total");
  totalEl.innerHTML = `
    <div class="yoy-total-card">
      <div class="yoy-total-label">Total municipal appropriations, 2026</div>
      <div class="yoy-total-figure">
        <span class="yoy-total-amount" id="yoy-total-amount">$0</span>
        <span class="yoy-total-badge ${totalUp ? "is-up" : "is-down"}">${totalUp ? "+" : ""}${overall.pctChange.toFixed(1)}% vs. 2025</span>
      </div>
      <div class="yoy-bars">
        <div class="yoy-bar-row">
          <span class="yoy-bar-year">2025</span>
          <div class="yoy-bar-track"><div class="yoy-bar-fill" style="--target:${totalPct2025}%"></div></div>
          <span class="yoy-bar-amount">${dollars(overall.total2025, 0)}</span>
        </div>
        <div class="yoy-bar-row">
          <span class="yoy-bar-year">2026</span>
          <div class="yoy-bar-track"><div class="yoy-bar-fill yoy-bar-fill--now" style="--target:100%"></div></div>
          <span class="yoy-bar-amount">${dollars(overall.total2026, 0)}</span>
        </div>
      </div>
      <div class="yoy-total-change ${totalUp ? "is-up" : "is-down"}">
        ${totalUp ? "+" : ""}${dollars(overall.change, 0)} more than 2025
      </div>
    </div>`;

  const groups = getSpendingByGroupYoY(data).slice(0, 6);
  const gridEl = document.getElementById("yoy-grid");
  gridEl.innerHTML = groups
    .map((g) => {
      const up = g.change >= 0;
      const pct = g.pctChange == null ? "—" : `${up ? "+" : ""}${g.pctChange.toFixed(1)}%`;
      const max = Math.max(g.amount2025, g.amount2026) || 1;
      const pct2025 = (g.amount2025 / max) * 100;
      const pct2026 = (g.amount2026 / max) * 100;
      return `
      <div class="yoy-card">
        <div class="yoy-card-head">
          <span class="donut-card-swatch" style="background:${g.color}"></span>
          <span class="yoy-card-label">${g.group}${glossBadge(GROUP_GLOSS_TERM[g.group])}</span>
          <span class="yoy-card-badge ${up ? "is-up" : "is-down"}">${pct}</span>
        </div>
        <div class="yoy-bars yoy-bars--compact">
          <div class="yoy-bar-row">
            <span class="yoy-bar-year">2025</span>
            <div class="yoy-bar-track"><div class="yoy-bar-fill" style="--target:${pct2025}%; background:${g.color}; opacity:.4"></div></div>
            <span class="yoy-bar-amount">${dollars(g.amount2025, 0)}</span>
          </div>
          <div class="yoy-bar-row">
            <span class="yoy-bar-year">2026</span>
            <div class="yoy-bar-track"><div class="yoy-bar-fill" style="--target:${pct2026}%; background:${g.color}"></div></div>
            <span class="yoy-bar-amount">${dollars(g.amount2026, 0)}</span>
          </div>
        </div>
        <div class="yoy-card-change ${up ? "is-up" : "is-down"}">
          ${up ? "+" : ""}${dollars(g.change, 0)} since 2025
        </div>
      </div>`;
    })
    .join("");

  // Animate the headline figure once and the comparison bars every time the
  // section scrolls into view (mirrors the donut float-in/out behavior).
  const section = document.getElementById("changed");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const amountEl = document.getElementById("yoy-total-amount");

  if (reduceMotion) {
    amountEl.textContent = dollars(overall.total2026, 0);
    section.classList.add("is-visible");
    return;
  }

  let countedUp = false;
  if (section && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!countedUp) {
              d3.select(amountEl)
                .transition()
                .duration(1100)
                .ease(d3.easeCubicOut)
                .tween("text", () => {
                  const interp = d3.interpolateNumber(0, overall.total2026);
                  return (t) => {
                    amountEl.textContent = dollars(interp(t), 0);
                  };
                });
              countedUp = true;
            }
            section.classList.add("is-visible");
          } else {
            section.classList.remove("is-visible");
          }
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(section);
  } else {
    amountEl.textContent = dollars(overall.total2026, 0);
    section.classList.add("is-visible");
  }
}

/** Largest individual 2026 appropriation line items. */
function renderLargestSpending(data, total) {
  const lines = getLargestSpendingLines(data, 10);
  const body = document.getElementById("largest-body");
  body.innerHTML = lines
    .map((line) => {
      const pct = ((line.amount / total) * 100).toFixed(1);
      return `
      <tr>
        <td>${line.label}<br><span class="source-tag" style="margin-top:.15rem;">${line.department || ""}</span></td>
        <td>${line.group}${glossBadge(GROUP_GLOSS_TERM[line.group])}</td>
        <td class="num">${dollars(line.amount, 0)}</td>
        <td class="num">${pct}%</td>
        <td class="num">${dollars(line.amount2025, 0)}</td>
      </tr>`;
    })
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

  if (node.side === "link") {
    const pctOfSource = ((node.value / node.source.value) * 100).toFixed(1);
    const pctOfTarget = ((node.value / node.target.value) * 100).toFixed(1);
    const pctOfTotal = ((node.value / total) * 100).toFixed(1);
    inner.innerHTML = `
      <h4>${node.source.name} &rarr; ${node.target.name}</h4>
      <div class="detail-amount">${dollars(node.value, 2)} (${pctOfTotal}% of the budget)</div>
      <p>
        This flow makes up <strong>${pctOfSource}%</strong> of "${node.source.name}"
        and <strong>${pctOfTarget}%</strong> of "${node.target.name}".
      </p>`;
    inner.style.borderLeftColor = node.color || node.source.color || "var(--brand-500)";
    panel.style.maxHeight = "0px";
    panel.classList.remove("is-open");
    requestAnimationFrame(() => {
      panel.classList.add("is-open");
      panel.style.maxHeight = `${inner.scrollHeight + 24}px`;
    });
    return;
  }

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

  const revenueItems = getRevenueSources(data);
  const spendingItems = getSpendingByGroup(data);

  let revenueDonut = null;
  let spendingDonut = null;

  const revenueCards = renderRevenueCards(revenueItems, total, () => revenueDonut);
  const spendingCards = renderSpendingCards(spendingItems, total, () => spendingDonut);

  revenueDonut = renderDonut(revenueItems, total, "revenue-donut", "revenue-total", (item) => REVENUE_DETAILS[item.label] || "", {
    onSliceActivate: (idx) => revenueCards.forEach((c, i) => c.classList.toggle("is-highlighted", i === idx)),
  });
  spendingDonut = renderDonut(spendingItems, total, "spending-donut", "spending-total", (item) => GROUP_DETAILS[item.group] || item.blurb || "", {
    onSliceActivate: (idx) => spendingCards.forEach((c, i) => c.classList.toggle("is-highlighted", i === idx)),
  });
  renderYoY(data, total);
  renderLargestSpending(data, total);
  renderSankey(data, (node, nodeTotal) => renderSankeyDetail(data, node, nodeTotal ?? total));
  initCalculator(data);
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
