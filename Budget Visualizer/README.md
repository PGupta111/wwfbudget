# West Windsor 2026 Budget Visualizer

A resident-friendly visual guide to West Windsor Township's 2026 adopted
municipal budget, built by West Windsor Forward.

## Primary site: `web/`

The site is a static HTML/CSS/JS page in [`web/`](web/) — no build step, no
server required, and easy to host anywhere or embed in the West Windsor
Forward website (e.g. as a subpage or iframe).

What's inside:

- **At a glance** — headline totals with sources
- **Money flow (Sankey)** — every revenue source flowing into the 2026
  budget, then out into spending categories, with no input required
- **What's your share** — a personal property-tax estimator that runs
  entirely in the browser (nothing is sent or stored) and rescales the
  spending breakdown to your numbers
- **Caps** — appropriation cap and 2% levy cap status
- **Explorer** — searchable/filterable table of all 170 appropriation rows
- **Capital projects** — 2026 funding and the 2026–2031 six-year program
- **Glossary** — plain-English definitions, with inline tooltips
- **Light & dark mode** — a header toggle that respects the visitor's
  system preference and remembers their choice (charts re-color themselves)
- **Scroll progress + active-section nav** and animated headline counters

### Fully self-contained

The site ships every dependency it needs, so it loads with no third-party
network calls (good for privacy, performance, and offline/embedded use):

- D3 and d3-sankey are vendored in [`web/js/vendor/`](web/js/vendor/)
- The Inter and Lora webfonts are self-hosted in
  [`web/assets/fonts/`](web/assets/fonts/) and declared in
  [`web/css/fonts.css`](web/css/fonts.css)

### Run locally

```sh
cd web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Deploy to Vercel

The repo includes a root [`vercel.json`](../vercel.json) that deploys the
static site in `Budget Visualizer/web/` with no build step and no dashboard
configuration required:

1. In Vercel, **Add New → Project** and import this Git repository.
2. Leave every setting at its default and click **Deploy**. `vercel.json`
   already sets the framework to "Other" (no build/install command) and
   serves `Budget Visualizer/web` at the site root.

Or from the repo root with the [Vercel CLI](https://vercel.com/docs/cli):

```sh
vercel        # preview deployment
vercel --prod # production deployment
```

The config also adds long-lived, immutable caching for the vendored
libraries and self-hosted fonts, a short cache for `data/budget.json`, and
baseline security headers. Framing is intentionally left enabled so the page
can still be embedded as an iframe on westwindsorforward.org.

> If you'd rather configure Vercel by hand instead of using `vercel.json`,
> set the project's **Root Directory** to `Budget Visualizer/web`,
> **Framework Preset** to *Other*, and leave the build command empty.

### Data

`web/data/budget.json` is a copy of [`src/data/budget.json`](src/data/budget.json),
which was extracted from `source/WW_2026_Adopted_Budget_FULL.xlsx` and
verified page-by-page against the township's adopted budget PDF. Blank source
cells remain `null`, and published totals are preserved rather than
recalculated. If `src/data/budget.json` is updated, copy it into `web/data/`
again:

```sh
cp src/data/budget.json web/data/budget.json
```

## Legacy: Streamlit app (`app.py`)

An earlier Python/Streamlit version of this tool still exists at
[`app.py`](app.py) for reference, with similar headline, revenue/spending,
tax-estimate, capital, and glossary views. It is no longer the primary site;
the static site in `web/` supersedes it.

```sh
python3 -m pip install -r requirements.txt
python3 -m streamlit run app.py
```
