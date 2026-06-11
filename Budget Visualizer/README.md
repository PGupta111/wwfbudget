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

### Run locally

```sh
cd web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

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
