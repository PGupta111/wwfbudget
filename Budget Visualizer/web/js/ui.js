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
}

/** Reveal sections and cards as they scroll into view (once each).
 * Uses a scroll/resize check rather than IntersectionObserver so that fast
 * scrolling or anchor jumps can never leave an element stuck hidden. */
export function initReveals() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const selectors = [
    ".section-head",
    ".stats-grid",
    ".donut-grid",
    ".donut-hint",
    ".yoy-total",
    ".yoy-grid",
    ".caps-grid",
    ".calculator-grid",
    ".rankbars",
    ".table-wrap",
    ".faq-facts",
    ".faq-list",
    ".callout",
    ".sankey-card",
    ".filters",
  ];
  let remaining = [];
  document.querySelectorAll(selectors.join(",")).forEach((el) => {
    if (el.closest("#stage")) return; // the 3D stage animates itself
    el.setAttribute("data-reveal", "");
    remaining.push(el);
  });
  if (!remaining.length) return;

  const check = () => {
    const trigger = window.innerHeight * 0.9;
    remaining = remaining.filter((el) => {
      if (el.getBoundingClientRect().top < trigger) {
        el.classList.add("in-view");
        return false;
      }
      return true;
    });
    if (!remaining.length) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  };

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      check();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  check(); // reveal anything already in view on load
}

/** Thin gradient bar under the header that fills as the page is scrolled. */
export function initScrollProgress() {
  const bar = document.getElementById("scroll-progress");
  const header = document.querySelector(".site-header");

  let ticking = false;
  const update = () => {
    const doc = document.documentElement;
    const y = window.scrollY || doc.scrollTop;
    if (bar) {
      const max = doc.scrollHeight - doc.clientHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, y / max)) : 0})`;
    }
    if (header) header.classList.toggle("is-scrolled", y > 8);
    ticking = false;
  };
  if (!bar && !header) return;

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

/** Collapsible mobile nav (hamburger menu). */
export function initNav() {
  const header = document.querySelector(".site-header");
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!header || !toggle || !nav) return;

  const close = () => {
    header.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };
  const open = () => {
    header.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    header.classList.contains("nav-open") ? close() : open();
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
  document.addEventListener("click", (e) => {
    if (header.classList.contains("nav-open") && !header.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) close();
  });
}

/** Initialize every shared UI behavior. */
export function initUI() {
  initTheme();
  initScrollProgress();
  initScrollSpy();
  initReveals();
  initNav();
}
