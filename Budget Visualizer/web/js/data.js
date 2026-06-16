// Data Tables page — at-a-glance stats, Explorer + Capital projects
import { initDataStats, initExplorer, initCapital } from "./explorer.js";
import { attachGlossaryTooltips } from "./glossary.js";
import { initUI } from "./ui.js";
import { loadBudget } from "./helpers.js";

async function init() {
  initUI();
  const data = await loadBudget();
  initDataStats(data);
  initExplorer(data);
  initCapital(data);
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
