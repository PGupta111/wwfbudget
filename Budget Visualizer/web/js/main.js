// West Windsor 2026 Budget Visualizer — index page rendering
import { renderSankey, renderDonut } from "./charts.js";
import { initCalculator } from "./calculator.js";
import { attachGlossaryTooltips } from "./glossary.js";
import { initUI } from "./ui.js";
import { initBudget3D, isWebGLAvailable } from "./viz3d.js";
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

  // Year-over-year deltas where we have a genuine 2025 figure.
  const rev = data.tables.revenues_summary.rows;
  const rev2025 = (description) => {
    const row = rev.find((r) => r.description === description);
    return row ? row.anticipated_2025_usd : null;
  };
  const totals = getTotalAppropriationsYoY(data);
  const delta = (cur, prev) => {
    if (!prev) return "";
    const pct = ((cur - prev) / prev) * 100;
    const up = cur >= prev;
    return `<span class="stat-delta ${up ? "is-up" : "is-down"}" title="vs. 2025">${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% <span class="stat-delta-ref">vs 2025</span></span>`;
  };

  const featured = {
    label: "Total 2026 municipal budget",
    value: compactDollars(h.total_budget.amount),
    source: h.total_budget.source,
    delta: delta(totals.total2026, totals.total2025),
  };

  const secondary = [
    { label: "Paid for by property taxes", value: compactDollars(h.municipal_property_tax.amount), source: h.municipal_property_tax.source, delta: delta(h.municipal_property_tax.amount, rev2025("Total Amount to be Raised by Taxes for Support of Municipal Budget")) },
    { label: "Surplus (savings) used", value: compactDollars(h.surplus_used.amount), source: h.surplus_used.source, term: "Surplus / Fund Balance", delta: delta(h.surplus_used.amount, rev2025("Surplus Anticipated")) },
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
      ${featured.delta ? `<div class="stat-feature-delta">${featured.delta}</div>` : ""}
      <div class="stat-note">Source: ${featured.source}</div>
    </div>
    <div class="stats-grid-secondary">
      ${secondary
        .map(
          (item) => `
        <div class="stat-card">
          <div class="stat-label">${item.label}${glossBadge(item.term)}</div>
          <div class="stat-value">${item.value}</div>
          ${item.delta ? item.delta : ""}
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

  // Single growth bar: the smaller year is the "base" segment and the
  // difference is the highlighted "change" segment, both measured against
  // the larger year (= 100%). It reads as "this slice is what moved."
  const maxYear = Math.max(overall.total2025, overall.total2026);
  const baseVal = Math.min(overall.total2025, overall.total2026);
  const basePct = (baseVal / maxYear) * 100;
  const changePct = (Math.abs(overall.change) / maxYear) * 100;
  const dir = totalUp ? "is-up" : "is-down";
  const arrow = totalUp ? "▲" : "▼";

  const totalEl = document.getElementById("yoy-total");
  totalEl.innerHTML = `
    <div class="yoy-total-card">
      <span class="yoy-total-label">Total municipal appropriations</span>
      <div class="yoy-headline">
        <span class="yoy-headline-amount" id="yoy-total-amount">$0</span>
        <span class="yoy-headline-year">in 2026</span>
        <span class="yoy-chip ${dir}">${arrow} ${totalUp ? "+" : "−"}${Math.abs(overall.pctChange).toFixed(1)}% vs. 2025</span>
      </div>
      <div class="yoy-growth">
        <div class="yoy-growth-track" role="img"
             aria-label="2025 total ${dollars(overall.total2025, 0)}, 2026 total ${dollars(overall.total2026, 0)}, a ${totalUp ? "rise" : "drop"} of ${dollars(Math.abs(overall.change), 0)}.">
          <span class="yoy-growth-base" style="--w:${basePct.toFixed(1)}%"></span>
          <span class="yoy-growth-add ${dir}" style="--w:${changePct.toFixed(1)}%"></span>
        </div>
        <div class="yoy-growth-key">
          <span class="yoy-growth-keyitem">
            <i class="yoy-growth-dot yoy-growth-dot--base"></i>
            2025 base &middot; ${compactDollars(baseVal)}
          </span>
          <span class="yoy-growth-keyitem">
            <i class="yoy-growth-dot yoy-growth-dot--change ${dir}"></i>
            ${totalUp ? "+" : "−"}${compactDollars(Math.abs(overall.change))} ${totalUp ? "added in" : "cut in"} 2026
          </span>
        </div>
      </div>
    </div>`;

  const groups = getSpendingByGroupYoY(data);
  const maxAbs = Math.max(...groups.map((g) => Math.abs(g.change))) || 1;
  const gridEl = document.getElementById("yoy-grid");
  gridEl.innerHTML = `
    <div class="diverge-head">
      <span>Category</span>
      <span class="diverge-axislabel"><span>&larr; spending less</span><span>spending more &rarr;</span></span>
      <span class="diverge-change-h">Change</span>
    </div>
    ${groups
      .map((g) => {
        const up = g.change >= 0;
        const w = (Math.abs(g.change) / maxAbs) * 47;
        const wFull = (Math.abs(g.change) / maxAbs) * 100; // left-anchored bar for mobile
        const pct = g.pctChange == null ? "—" : `${up ? "+" : ""}${g.pctChange.toFixed(1)}%`;
        return `
        <div class="diverge-row ${up ? "" : "is-down"}">
          <span class="diverge-name">
            <span class="donut-card-swatch" style="background:${g.color}"></span>
            <span class="diverge-name-text">${g.group}${glossBadge(GROUP_GLOSS_TERM[g.group])}</span>
          </span>
          <div class="diverge-track">
            <span class="diverge-axis"></span>
            <span class="diverge-fill ${up ? "is-up" : "is-down"}" style="--w:${w.toFixed(1)}%; --wfull:${wFull.toFixed(1)}%; ${up ? "left" : "right"}:50%;"></span>
          </div>
          <span class="diverge-delta ${up ? "is-up" : "is-down"}">${up ? "▲" : "▼"} ${up ? "+" : "−"}${compactDollars(Math.abs(g.change))}<span class="diverge-delta-pct">${pct}</span></span>
        </div>`;
      })
      .join("")}`;

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

/** Largest individual 2026 appropriation line items, as a ranked horizontal
 * bar chart (clearer and more space-efficient than a wide table). */
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

/** Count a compact-dollar value up from $0 when its element first scrolls
 * into view (used for the hero figure and the featured headline stat). */
function countUpCompact(el, target) {
  if (!el) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    el.textContent = compactDollars(target);
    return;
  }
  let played = false;
  const run = () => {
    played = true;
    d3.select(el)
      .transition()
      .duration(1300)
      .ease(d3.easeCubicOut)
      .tween("text", () => {
        const interp = d3.interpolateNumber(0, target);
        return (t) => {
          el.textContent = compactDollars(interp(t));
        };
      });
  };
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !played) run();
      });
    },
    { threshold: 0.4 }
  );
  observer.observe(el);
}

/** Wire up the interactive 3D stage: view modes, guided tour, dynamic legend,
 * camera controls, and the click-to-open detail panel. Falls back to a short
 * message (and the 2D charts below) if WebGL can't start. */
function initStage(data) {
  const stage = document.getElementById("stage");
  const fallback = document.getElementById("stage-fallback");
  if (!stage) return;

  const failGracefully = () => {
    if (fallback) fallback.hidden = false;
    document.getElementById("budget-3d")?.remove();
    document.getElementById("stage-labels")?.remove();
  };

  if (!isWebGLAvailable()) return failGracefully();

  const legend = document.getElementById("stage-legend");
  const panel = document.getElementById("stage-panel");
  const body = document.getElementById("stage-panel-body");
  const tourBtn = document.getElementById("stage-tour");

  function showPanel(detail) {
    if (!panel || !body) return;
    if (!detail) {
      panel.classList.remove("is-open");
      document.querySelectorAll(".stage-legend-item.is-active").forEach((b) => b.classList.remove("is-active"));
      return;
    }
    body.innerHTML = `
      <span class="stage-panel-eyebrow" style="background:${detail.colorHex}">${detail.kind}</span>
      <h3>${detail.group}</h3>
      <div class="stage-panel-amount" style="color:${detail.colorHex}">${dollars(detail.amount, 0)}</div>
      <div class="stage-panel-sub">${detail.pct.toFixed(1)}% of the 2026 ${detail.kind === "Revenue source" ? "revenue" : "municipal budget"}</div>
      ${detail.blurb ? `<p class="stage-panel-blurb">${detail.blurb}</p>` : ""}
      ${
        detail.breakdown.length
          ? `<div class="stage-panel-bd-title">${detail.kind === "Revenue source" ? "What's included" : "Where it goes"}</div>
             ${detail.breakdown
               .map((b) => `<div class="stage-bd-row"><span>${b.label}</span><span>${dollars(b.amount, 0)}</span></div>`)
               .join("")}`
          : ""
      }`;
    panel.classList.add("is-open");
    // Reflect the selection onto the legend chips.
    document.querySelectorAll(".stage-legend-item").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.group === detail.group);
    });
  }

  // Rebuild the legend whenever the active view changes.
  function rebuildLegend(items) {
    if (!legend) return;
    legend.innerHTML = items
      .map(
        (it) => `
        <button type="button" class="stage-legend-item" data-group="${it.name.replace(/"/g, "&quot;")}">
          <span class="stage-legend-swatch" style="background:${it.colorHex}"></span>
          ${it.name}
        </button>`
      )
      .join("");
    legend.querySelectorAll(".stage-legend-item").forEach((item) => {
      const name = item.dataset.group;
      item.addEventListener("mouseenter", () => viz.hoverItem(name));
      item.addEventListener("mouseleave", () => viz.hoverItem(null));
      item.addEventListener("click", () => viz.focusItem(name));
    });
  }

  let viz;
  try {
    viz = initBudget3D(data, {
      onSelect: showPanel,
      onItems: rebuildLegend,
      onTour: (active) => {
        if (tourBtn) {
          tourBtn.classList.toggle("is-touring", active);
          tourBtn.setAttribute("aria-label", active ? "Stop guided tour" : "Play guided tour");
          tourBtn.title = active ? "Stop tour" : "Guided tour";
        }
      },
    });
  } catch (err) {
    console.error("3D stage failed:", err);
    return failGracefully();
  }
  if (!viz) return failGracefully();

  // View-mode switcher.
  const modeBtns = [...document.querySelectorAll(".stage-mode")];
  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      viz.setMode(btn.dataset.mode);
    });
  });

  // Tour toggle.
  tourBtn?.addEventListener("click", () => {
    if (tourBtn.classList.contains("is-touring")) viz.cancelTour();
    else viz.startTour();
  });

  // Rotation toggle (icon swaps via the .is-paused class) + reset.
  const rotateBtn = document.getElementById("stage-rotate");
  rotateBtn?.addEventListener("click", () => {
    const on = viz.toggleRotate();
    rotateBtn.setAttribute("aria-pressed", String(on));
    rotateBtn.classList.toggle("is-paused", !on);
    rotateBtn.setAttribute("aria-label", on ? "Pause auto-rotate" : "Resume auto-rotate");
  });
  document.getElementById("stage-reset")?.addEventListener("click", () => viz.resetView());
  document.getElementById("stage-panel-close")?.addEventListener("click", () => viz.resetView());
}

/** Wire the Charts / Flow / 3D view toggle. The Sankey and the 3D stage are
 * each rendered lazily the first time their view is shown, so a visitor who
 * stays on the charts never pays the cost of either. */
function setupExplore(data) {
  const toggle = document.getElementById("view-toggle");
  const panels = {
    "2d": document.getElementById("viz-2d"),
    flow: document.getElementById("viz-flow"),
    "3d": document.getElementById("viz-3d"),
  };
  if (!toggle || !panels["2d"]) return;

  const total = data.headline.total_budget.amount;
  let flowStarted = false;
  let stageStarted = false;
  const opts = [...toggle.querySelectorAll(".view-opt")];

  function setView(view) {
    if (!panels[view]) view = "2d";
    opts.forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    Object.entries(panels).forEach(([key, el]) => {
      if (el) el.hidden = key !== view;
    });
    try {
      localStorage.setItem("wwf-view", view);
    } catch (e) {}

    if (view === "flow" && !flowStarted) {
      flowStarted = true;
      requestAnimationFrame(() =>
        renderSankey(data, (node, nodeTotal) => renderSankeyDetail(data, node, nodeTotal ?? total))
      );
    }
    if (view === "3d" && !stageStarted) {
      stageStarted = true;
      requestAnimationFrame(() => initStage(data));
    }
  }

  opts.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  // Honor a saved choice; otherwise Flow on desktop, Charts on mobile (the
  // donuts read far better than a shrunk Sankey on a phone).
  let saved = null;
  try {
    saved = localStorage.getItem("wwf-view");
  } catch (e) {}
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  setView(saved || (isMobile ? "2d" : "flow"));
}

async function init() {
  initUI();
  const data = await loadBudget();

  const total = data.headline.total_budget.amount;
  renderHeadlineStats(data);
  renderCaps(data);

  // Animate the two big "total budget" figures up from zero.
  countUpCompact(document.querySelector(".hero-figure-value"), total);
  countUpCompact(document.querySelector(".stat-feature-value"), total);

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
  initCalculator(data);
  attachGlossaryTooltips(data);
  setupExplore(data);
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
