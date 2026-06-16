// Personal tax estimator + spending breakdown bars (also used as the
// default, no-input "whole township" view).
import { dollars, compactDollars, getSpendingByGroup, getRevenueSources, getLineItems } from "./helpers.js";

// Most recently published municipal (local-purpose) tax rate per $100 of
// assessed value, from the 2026 Levy CAP Calculation (Sheet 3-Levy CAP).
const LOCAL_PURPOSE_TAX_RATE = 0.427;

// Illustrative West Windsor home assessed values for a quick "where do I land"
// comparison (the estimate is the same published formula applied to each).
const BENCHMARKS = [350000, 500000, 650000, 800000, 1000000];

export function initCalculator(data) {
  const total = data.headline.total_budget.amount;
  const groups = getSpendingByGroup(data);
  const propertyTaxTotal = getRevenueSources(data).find((r) => r.label === "Property taxes")?.amount || 0;

  const input = document.getElementById("assessed-value");
  const resultValue = document.getElementById("calc-result-value");
  const title = document.getElementById("breakdown-title");
  const rowsEl = document.getElementById("breakdown-rows");
  const compareFill = document.getElementById("compare-fill");
  const compareLabel = document.getElementById("compare-label");

  // Largest line items inside each functional group, so the breakdown can
  // drill down to "the biggest checks" without a separate section.
  const linesByGroup = new Map();
  for (const r of getLineItems(data)) {
    const amount = r.appropriated_2026_usd || 0;
    if (amount <= 0) continue;
    const grp = r.functional_group;
    if (!linesByGroup.has(grp)) linesByGroup.set(grp, []);
    linesByGroup.get(grp).push({
      label: r.account_program || r.department_division_as_printed || "Unlabeled",
      amount,
    });
  }
  for (const arr of linesByGroup.values()) arr.sort((a, b) => b.amount - a.amount);

  const chevron =
    '<svg class="breakdown-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Build the row markup once so the fill bars and numbers can transition
  // smoothly between renders instead of being torn down and rebuilt.
  rowsEl.innerHTML = groups
    .map((g) => {
      const all = linesByGroup.get(g.group) || [];
      const top = all.slice(0, 5);
      const more = all.length - top.length;
      const lines = top
        .map((l) => {
          const pctOfGroup = g.amount ? ((l.amount / g.amount) * 100).toFixed(1) : "0.0";
          return `<li><span class="bl-name">${l.label}</span><span class="bl-amt">${dollars(
            l.amount,
            0
          )} &middot; ${pctOfGroup}%</span></li>`;
        })
        .join("");
      const moreRow =
        more > 0
          ? `<li class="bl-more"><a href="data.html#explorer">+${more} smaller line${
              more === 1 ? "" : "s"
            } &mdash; see all in the data tables &rarr;</a></li>`
          : "";
      return `
        <details class="breakdown-row" title="${g.blurb}">
          <summary>
            <div class="breakdown-row-head">
              <span class="group-name">${chevron}${g.group}</span>
              <span class="group-amounts" data-amount></span>
            </div>
            <div class="breakdown-track">
              <div class="breakdown-fill" data-fill style="background:${g.color};"></div>
            </div>
          </summary>
          <ul class="breakdown-lines">${lines}${moreRow}</ul>
        </details>`;
    })
    .join("");

  const fillEls = rowsEl.querySelectorAll("[data-fill]");
  const amountEls = rowsEl.querySelectorAll("[data-amount]");

  // Benchmark "typical homes" comparison.
  const benchRowsEl = document.getElementById("calc-benchmarks-rows");
  const maxBench = BENCHMARKS[BENCHMARKS.length - 1];
  if (benchRowsEl) {
    benchRowsEl.innerHTML = BENCHMARKS.map((v) => {
      const tax = (v * LOCAL_PURPOSE_TAX_RATE) / 100;
      return `
        <div class="bench-row" data-val="${v}">
          <span class="bench-home">${compactDollars(v)} home</span>
          <div class="bench-track"><span class="bench-fill" style="width:${((v / maxBench) * 100).toFixed(0)}%"></span></div>
          <span class="bench-tax">${dollars(tax, 0)}</span>
        </div>`;
    }).join("");
  }
  const benchRows = benchRowsEl ? [...benchRowsEl.querySelectorAll(".bench-row")] : [];

  function render({ animateFills = true } = {}) {
    const raw = input.value.trim();
    const assessedValue = raw === "" ? null : Number(raw);
    const hasValue = assessedValue !== null && !Number.isNaN(assessedValue) && assessedValue > 0;
    const personalTotal = hasValue ? (assessedValue * LOCAL_PURPOSE_TAX_RATE) / 100 : null;

    resultValue.textContent = hasValue ? dollars(personalTotal, 2) : "Enter a value above";

    title.textContent = hasValue
      ? `Where your estimated ${dollars(personalTotal, 2)} goes`
      : "Where the 2026 budget goes";

    groups.forEach((g, i) => {
      const share = g.amount / total;
      const displayAmount = hasValue ? personalTotal * share : g.amount;
      const widthPct = `${(share * 100).toFixed(2)}%`;

      amountEls[i].textContent = `${dollars(displayAmount, hasValue ? 2 : 0)} · ${(share * 100).toFixed(1)}%`;

      const fill = fillEls[i];
      fill.style.width = widthPct;

      if (animateFills) {
        fill.classList.remove("is-pulsing");
        // Restart the pulse animation on every change.
        void fill.offsetWidth;
        fill.classList.add("is-pulsing");
      }
    });

    // "Compared to everyone else" meter: how the resident's estimated bill
    // stacks up against the total amount raised townwide via property taxes.
    if (hasValue && propertyTaxTotal > 0) {
      const sharePct = (personalTotal / propertyTaxTotal) * 100;
      const displayPct = Math.min(sharePct, 100);
      compareFill.style.width = `${displayPct.toFixed(4)}%`;
      compareFill.classList.add("has-value");
      const precision = sharePct < 0.01 ? 4 : sharePct < 1 ? 3 : 2;
      compareLabel.innerHTML = `Your estimated bill is about <strong>${sharePct.toFixed(precision)}%</strong> of the ${dollars(
        propertyTaxTotal,
        0
      )} raised townwide through property taxes in 2026.`;
    } else {
      compareFill.style.width = "0%";
      compareFill.classList.remove("has-value");
      compareLabel.textContent =
        "Enter your assessed value to see how your estimated bill compares to the total raised townwide through property taxes.";
    }

    // Highlight the benchmark closest to the entered value.
    if (benchRows.length) {
      let nearest = null;
      if (hasValue) {
        nearest = BENCHMARKS.reduce((a, b) =>
          Math.abs(b - assessedValue) < Math.abs(a - assessedValue) ? b : a
        );
      }
      benchRows.forEach((r) => r.classList.toggle("is-active", hasValue && Number(r.dataset.val) === nearest));
    }
  }

  input.addEventListener("input", () => render({ animateFills: true }));

  // Initial draw-in: start every bar at 0 width, then animate to its real
  // share once the page has painted.
  render({ animateFills: false });
  fillEls.forEach((fill) => {
    fill.style.transition = "none";
    fill.style.width = "0%";
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fillEls.forEach((fill) => {
        fill.style.transition = "";
      });
      render({ animateFills: false });
    });
  });
}
