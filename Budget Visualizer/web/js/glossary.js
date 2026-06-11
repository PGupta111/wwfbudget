// Glossary as a grid of flip cards, grouped by topic, plus inline tooltip
// wiring for `.gloss-term` spans elsewhere on the page.

// Group every glossary term into a topic so the cards can be filtered by
// pill, with a distinct accent color per topic.
const TERM_TOPICS = {
  "Anticipated Revenue": { topic: "Revenue & reserves", color: "var(--grp-2)" },
  "Surplus / Fund Balance": { topic: "Revenue & reserves", color: "var(--grp-2)" },
  "Reserve for Uncollected Taxes": { topic: "Revenue & reserves", color: "var(--grp-2)" },
  "Dedicated Revenue / Dedication by Rider": { topic: "Revenue & reserves", color: "var(--grp-2)" },
  "New Ratables": { topic: "Revenue & reserves", color: "var(--grp-2)" },
  "Local Purpose Tax Rate (per $100)": { topic: "Revenue & reserves", color: "var(--grp-2)" },

  Appropriation: { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "Salaries & Wages (S&W)": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "Other Expenses (OE)": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "Paid or Charged": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  Reserved: { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "As Modified by All Transfers": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  FCOA: { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "Statutory Expenditures": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  "PERS / PFRS": { topic: "Spending & appropriations", color: "var(--grp-9)" },
  DCRP: { topic: "Spending & appropriations", color: "var(--grp-9)" },

  '"CAPS" (Appropriation Cap)': { topic: "Caps & limits", color: "var(--grp-7)" },
  "Levy Cap (2% Tax Levy Cap)": { topic: "Caps & limits", color: "var(--grp-7)" },
  "Within CAPS / Excluded from CAPS": { topic: "Caps & limits", color: "var(--grp-7)" },

  "Debt Service": { topic: "Debt & capital projects", color: "var(--grp-12)" },
  "Bond Anticipation Notes (BANs)": { topic: "Debt & capital projects", color: "var(--grp-12)" },
  "Capital Improvement Fund": { topic: "Debt & capital projects", color: "var(--grp-12)" },
  "Capital Budget vs Capital Program": { topic: "Debt & capital projects", color: "var(--grp-12)" },
  "Open Space Trust Fund": { topic: "Debt & capital projects", color: "var(--grp-12)" },

  "Grants / Public & Private Programs": { topic: "Grants & partnerships", color: "var(--grp-4)" },
  "Shared Service / Interlocal Agreement": { topic: "Grants & partnerships", color: "var(--grp-4)" },
};

export function initGlossary(data) {
  const grid = document.getElementById("glossary-list");
  const search = document.getElementById("glossary-search");
  const count = document.getElementById("glossary-count");
  const pillsEl = document.getElementById("gloss-pills");
  const rows = [...data.tables.glossary.rows].sort((a, b) => a.term.localeCompare(b.term));

  const topics = ["All topics", ...new Set(Object.values(TERM_TOPICS).map((t) => t.topic))];
  let activeTopic = "All topics";

  if (pillsEl) {
    pillsEl.innerHTML = topics
      .map((t, i) => `<button class="gloss-pill${i === 0 ? " is-active" : ""}" data-topic="${t}">${t}</button>`)
      .join("");
    pillsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".gloss-pill");
      if (!btn) return;
      activeTopic = btn.dataset.topic;
      pillsEl.querySelectorAll(".gloss-pill").forEach((p) => p.classList.toggle("is-active", p === btn));
      render(search?.value || "");
    });
  }

  // Build all the cards once; filtering toggles a `.is-hidden` class so the
  // flip transitions and layout stay smooth.
  grid.innerHTML = rows
    .map((row, i) => {
      const meta = TERM_TOPICS[row.term] || { topic: "Other", color: "var(--grp-13)" };
      return `
        <button class="gloss-card" type="button" data-term="${row.term.toLowerCase()}" data-def="${row.plain_english_meaning
          .toLowerCase()
          .replace(/"/g, "&quot;")}" data-topic="${meta.topic}" style="--gloss-accent:${meta.color}" aria-label="What does '${row.term}' mean? Tap to flip.">
          <span class="gloss-card-inner">
            <span class="gloss-card-face gloss-card-front">
              <span class="gloss-card-topic">${meta.topic}</span>
              <span class="gloss-card-term">${row.term}</span>
              <span class="gloss-card-hint">Tap to reveal &rarr;</span>
            </span>
            <span class="gloss-card-face gloss-card-back">
              <span class="gloss-card-def">${row.plain_english_meaning}</span>
            </span>
          </span>
        </button>`;
    })
    .join("");

  grid.querySelectorAll(".gloss-card").forEach((card) => {
    card.addEventListener("click", () => card.classList.toggle("is-flipped"));
  });

  function render(filter = "") {
    const f = filter.trim().toLowerCase();
    const cards = [...grid.querySelectorAll(".gloss-card")];
    let visible = 0;

    cards.forEach((card) => {
      const matchesTopic = activeTopic === "All topics" || card.dataset.topic === activeTopic;
      const matchesSearch = !f || card.dataset.term.includes(f) || card.dataset.def.includes(f);
      const show = matchesTopic && matchesSearch;
      card.classList.toggle("is-hidden", !show);
      if (show) visible++;
    });

    if (count) {
      count.textContent = `Showing ${visible} of ${rows.length} terms`;
    }
  }

  render();
  search?.addEventListener("input", (e) => render(e.target.value));
}

/** Wire up any element with class="gloss-term" data-term="..." to show the
 * glossary definition in a small popover on click/tap/keyboard activation. */
export function attachGlossaryTooltips(data) {
  const rows = data.tables.glossary.rows;
  const lookup = new Map(rows.map((r) => [r.term, r.plain_english_meaning]));

  let popover = document.getElementById("gloss-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "gloss-popover";
    popover.className = "gloss-popover";
    document.body.appendChild(popover);
  }

  function hidePopover() {
    popover.classList.remove("visible");
  }

  function showPopover(el, definition) {
    popover.textContent = definition;
    popover.classList.add("visible");

    const rect = el.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    let left = rect.left + window.scrollX + rect.width / 2 - popRect.width / 2;
    left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - popRect.width - 8));
    const top = rect.bottom + window.scrollY + 8;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  document.querySelectorAll(".gloss-term[data-term]").forEach((el) => {
    const definition = lookup.get(el.dataset.term);
    if (!definition) return;
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `What does "${el.dataset.term}" mean?`);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = popover.classList.contains("visible") && popover.dataset.for === el.dataset.term;
      if (isOpen) {
        hidePopover();
      } else {
        popover.dataset.for = el.dataset.term;
        showPopover(el, definition);
      }
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });

  document.addEventListener("click", hidePopover);
  window.addEventListener("scroll", hidePopover, { passive: true });
  window.addEventListener("resize", hidePopover);
}
