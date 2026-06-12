// Inline tooltip wiring for `.gloss-term` spans across the page.

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
