// West Windsor 2026 Budget Visualizer — shared UI behaviors.
// Theme toggle, scroll-progress indicator, and active-section nav.
// No third-party dependencies; safe to import from any page.

/** Wire up the light/dark theme toggle. The initial theme is already applied
 * by a tiny inline script in <head> (to avoid a flash of the wrong theme), so
 * this only handles user toggles and persistence. Charts read their colors
 * from CSS custom properties / classes, so no re-render is needed on switch. */
export function initTheme() {
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");

  const reflect = (theme) => {
    if (toggle) toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b1220" : "#082f49");
  };

  reflect(root.getAttribute("data-theme") || "light");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("wwf-theme", next);
    } catch (e) {
      /* storage unavailable — theme still applies for this session */
    }
    reflect(next);
  });

  // Follow the OS preference if the visitor hasn't explicitly chosen.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change", (e) => {
    let saved = null;
    try {
      saved = localStorage.getItem("wwf-theme");
    } catch (err) {}
    if (saved) return;
    const theme = e.matches ? "dark" : "light";
    root.setAttribute("data-theme", theme);
    reflect(theme);
  });
}

/** Thin gradient bar under the header that fills as the page is scrolled. */
export function initScrollProgress() {
  const bar = document.getElementById("scroll-progress");
  if (!bar) return;

  let ticking = false;
  const update = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? (window.scrollY || doc.scrollTop) / max : 0;
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, pct))})`;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", update);
  update();
}

/** Highlight the in-page nav link for whichever section is currently in view. */
export function initScrollSpy() {
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  if (!links.length || !("IntersectionObserver" in window)) return;

  const sections = new Map();
  for (const link of links) {
    const id = link.getAttribute("href").slice(1);
    const section = document.getElementById(id);
    if (section) sections.set(section, link);
  }
  if (!sections.size) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          links.forEach((l) => l.classList.remove("is-active"));
          sections.get(entry.target)?.classList.add("is-active");
        }
      }
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((_, section) => observer.observe(section));
}

/** Initialize every shared UI behavior. */
export function initUI() {
  initTheme();
  initScrollProgress();
  initScrollSpy();
}
