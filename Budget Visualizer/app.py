"""West Windsor Forward's resident-friendly 2026 budget visualizer."""

from __future__ import annotations

import json
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st


ROOT = Path(__file__).parent
DATA_PATH = ROOT / "src" / "data" / "budget.json"
LOGO_PATH = ROOT / "public" / "wwf-logo.png"
SOURCE_WORKBOOK_PATH = ROOT / "source" / "WW_2026_Adopted_Budget_FULL.xlsx"

SLATE_900 = "#0f172a"
SLATE_700 = "#334155"
SLATE_500 = "#64748b"
SKY_700 = "#0369a1"
SKY_500 = "#0ea5e9"
SKY_300 = "#7dd3fc"
SKY_100 = "#e0f2fe"
WHITE = "#ffffff"


st.set_page_config(
    page_title="2026 Budget Visualizer | West Windsor Forward",
    page_icon=str(LOGO_PATH),
    layout="wide",
)


@st.cache_data
def load_budget() -> dict:
    """Load the verified workbook extraction once and reuse it across reruns."""
    with DATA_PATH.open(encoding="utf-8") as budget_file:
        return json.load(budget_file)


def dollars(value: float | int | None, decimals: int = 0) -> str:
    """Format a budget value for resident-facing display."""
    if value is None:
        return "—"
    return f"${value:,.{decimals}f}"


def compact_dollars(value: float | int | None) -> str:
    """Format a large budget value in millions or thousands."""
    if value is None:
        return "—"
    if abs(value) >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if abs(value) >= 1_000:
        return f"${value / 1_000:.0f}K"
    return dollars(value)


def summary_row(data: dict, description: str) -> dict:
    """Find one official appropriations-summary row by its printed label."""
    rows = data["tables"]["appropriations_summary"]["rows"]
    return next(row for row in rows if description in row["description"])


def revenue_row(data: dict, description: str) -> dict:
    """Find one official revenues-summary row by its printed label."""
    rows = data["tables"]["revenues_summary"]["rows"]
    return next(row for row in rows if row["description"] == description)


def inject_wwf_style() -> None:
    """Apply the typography and colors used on westwindsorforward.org."""
    st.markdown(
        f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

        html, body, [class*="css"], [data-testid="stAppViewContainer"] {{
            font-family: "Lora", Georgia, serif;
        }}

        [data-testid="stAppViewContainer"] {{
            background: #f8fafc;
        }}

        [data-testid="stHeader"] {{
            background: rgba(15, 23, 42, 0.96);
        }}

        [data-testid="stMainBlockContainer"] {{
            max-width: 1240px;
            padding-top: 2rem;
            padding-bottom: 5rem;
        }}

        h1, h2, h3 {{
            color: {SLATE_900};
            letter-spacing: -0.025em;
        }}

        .wwf-hero {{
            margin: -0.25rem 0 2.25rem;
            padding: clamp(2rem, 6vw, 4.5rem);
            color: {WHITE};
            background:
                radial-gradient(circle at 80% 15%, rgba(14,165,233,.25), transparent 30%),
                linear-gradient(135deg, #08111f, {SLATE_900} 60%, #0c4a6e);
            border-radius: 1.4rem;
            box-shadow: 0 24px 60px rgba(15,23,42,.18);
        }}

        .wwf-hero h1 {{
            max-width: 900px;
            margin: .45rem 0 1rem;
            color: {WHITE};
            font-size: clamp(2.2rem, 5vw, 4.8rem);
            line-height: 1.04;
        }}

        .wwf-hero p {{
            max-width: 760px;
            margin-bottom: 0;
            color: #dbeafe;
            font-size: 1.08rem;
        }}

        .eyebrow {{
            color: {SKY_300};
            font-size: .76rem;
            font-weight: 700;
            letter-spacing: .14em;
            text-transform: uppercase;
        }}

        .section-intro {{
            max-width: 760px;
            color: {SLATE_500};
            font-size: .98rem;
        }}

        [data-testid="stMetric"] {{
            min-height: 155px;
            padding: 1.25rem;
            background: {WHITE};
            border: 1px solid #e2e8f0;
            border-radius: 1rem;
            box-shadow: 0 12px 35px rgba(15,23,42,.07);
        }}

        [data-testid="stMetricLabel"] {{
            color: {SLATE_500};
        }}

        [data-testid="stMetricValue"] {{
            color: {SLATE_900};
        }}

        div[data-testid="stExpander"] {{
            background: {WHITE};
            border-color: #e2e8f0;
            border-radius: .8rem;
        }}

        .source-note {{
            margin-top: -.55rem;
            color: #94a3b8;
            font-size: .72rem;
        }}

        .cap-card {{
            padding: 1.15rem;
            color: {WHITE};
            background: {SLATE_900};
            border-radius: 1rem;
        }}

        .cap-card strong {{
            display: block;
            margin: .35rem 0;
            color: #86efac;
            font-size: 1.55rem;
        }}

        .cap-card small {{
            color: #94a3b8;
        }}

        .method-note {{
            padding: 1.3rem;
            color: {SLATE_700};
            background: {SKY_100};
            border-left: 4px solid {SKY_500};
            border-radius: .8rem;
        }}

        .privacy-note {{
            padding: .85rem 1rem;
            color: {SLATE_700};
            background: #f1f5f9;
            border-radius: .65rem;
            font-size: .82rem;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def show_source(source: str) -> None:
    st.markdown(f'<p class="source-note">Source: {source}</p>', unsafe_allow_html=True)


budget = load_budget()
headline = budget["headline"]
inject_wwf_style()


# Header and introduction
header_left, header_right = st.columns([5, 1])
with header_left:
    st.image(str(LOGO_PATH), width=220)
with header_right:
    st.link_button("West Windsor Forward ↗", "https://westwindsorforward.org")

st.markdown(
    """
    <section class="wwf-hero">
        <span class="eyebrow">West Windsor Township · Adopted 2026 budget</span>
        <h1>Where does the town's money come from, and where does it go?</h1>
        <p>
            A resident-friendly guide built from the township's published
            figures without changing or inventing data.
        </p>
    </section>
    """,
    unsafe_allow_html=True,
)


# Headline figures
st.header("West Windsor's 2026 budget at a glance")
st.markdown(
    '<p class="section-intro">These are the headline numbers printed in the adopted budget. '
    "Each figure includes the workbook location used to verify it.</p>",
    unsafe_allow_html=True,
)

metric_columns = st.columns(4)
metrics = [
    ("Total adopted budget", headline["total_budget"]),
    ("Municipal property taxes", headline["municipal_property_tax"]),
    ("Prior-year surplus used", headline["surplus_used"]),
    ("Reserve for uncollected taxes", headline["reserve_for_uncollected_taxes"]),
]

for column, (label, item) in zip(metric_columns, metrics):
    with column:
        st.metric(label, compact_dollars(item["amount"]))
        show_source(item["source"])


# Revenue and caps
st.divider()
revenue_column, caps_column = st.columns([1.35, 0.65], gap="large")

with revenue_column:
    st.header("How the budget is funded")

    revenue_data = pd.DataFrame(
        [
            {
                "Source": "Municipal property taxes",
                "Amount": revenue_row(
                    budget,
                    "Total Amount to be Raised by Taxes for Support of Municipal Budget",
                )["anticipated_2026_usd"],
            },
            {
                "Source": "Surplus used",
                "Amount": revenue_row(budget, "Surplus Anticipated")[
                    "anticipated_2026_usd"
                ],
            },
            {
                "Source": "Other miscellaneous revenues",
                "Amount": revenue_row(budget, "Total Miscellaneous Revenues")[
                    "anticipated_2026_usd"
                ],
            },
            {
                "Source": "Receipts from delinquent taxes",
                "Amount": revenue_row(budget, "Receipts from Delinquent Taxes")[
                    "anticipated_2026_usd"
                ],
            },
        ]
    )

    revenue_chart = (
        alt.Chart(revenue_data)
        .mark_bar(cornerRadiusEnd=6, color=SKY_500)
        .encode(
            x=alt.X(
                "Amount:Q",
                title=None,
                axis=alt.Axis(format="$,.2s", grid=False),
            ),
            y=alt.Y("Source:N", title=None, sort="-x"),
            tooltip=[
                alt.Tooltip("Source:N"),
                alt.Tooltip("Amount:Q", format="$,.2f"),
            ],
        )
        .properties(height=270)
    )
    st.altair_chart(revenue_chart, width="stretch")
    st.caption("Source: Revenues Summary, Sheet 11")

with caps_column:
    st.header("Under both state caps")
    st.write(
        "New Jersey applies separate limits to municipal appropriations and "
        "the property-tax levy. The adopted budget remains below both maximums."
    )

    st.markdown(
        f"""
        <div class="cap-card">
            Appropriation cap
            <strong>{dollars(abs(headline["appropriation_cap_under"]["amount"]))} under</strong>
            <small>{headline["appropriation_cap_under"]["source"]}</small>
        </div>
        <br>
        <div class="cap-card">
            2% levy cap
            <strong>{dollars(abs(headline["levy_cap_under"]["amount"]))} under</strong>
            <small>{headline["levy_cap_under"]["source"]}</small>
        </div>
        """,
        unsafe_allow_html=True,
    )

    glossary_rows = budget["tables"]["glossary"]["rows"]
    cap_terms = [
        row
        for row in glossary_rows
        if any(term in row["term"] for term in ("CAPS", "Levy Cap"))
    ]
    with st.expander("What do these terms mean?"):
        for term in cap_terms:
            st.markdown(f"**{term['term']}**")
            st.write(term["plain_english_meaning"])


# Spending composition
st.divider()
st.header("Where the adopted budget goes")
st.markdown(
    '<p class="section-intro">This chart uses the township\'s official summary '
    "categories so every dollar is counted once.</p>",
    unsafe_allow_html=True,
)

spending_data = pd.DataFrame(
    [
        {
            "Category": "Operations within CAPS",
            "Amount": summary_row(budget, "within CAPS")["2026_usd"],
        },
        {
            "Category": "Operations excluded from CAPS",
            "Amount": summary_row(budget, "Total Operations Excluded")["2026_usd"],
        },
        {
            "Category": "Debt service",
            "Amount": summary_row(budget, "Municipal Debt Service")["2026_usd"],
        },
        {
            "Category": "Reserve for uncollected taxes",
            "Amount": summary_row(budget, "Reserve for Uncollected Taxes")["2026_usd"],
        },
        {
            "Category": "Capital improvements",
            "Amount": summary_row(budget, "Capital Improvements")["2026_usd"],
        },
    ]
)
spending_data["Share"] = (
    spending_data["Amount"] / headline["total_budget"]["amount"]
)

spending_chart = (
    alt.Chart(spending_data)
    .mark_arc(innerRadius=90, outerRadius=155)
    .encode(
        theta=alt.Theta("Amount:Q", stack=True),
        color=alt.Color(
            "Category:N",
            scale=alt.Scale(
                range=[SKY_700, SKY_500, SKY_300, "#94a3b8", SLATE_700]
            ),
            legend=alt.Legend(title=None, orient="bottom"),
        ),
        tooltip=[
            alt.Tooltip("Category:N"),
            alt.Tooltip("Amount:Q", format="$,.2f"),
            alt.Tooltip("Share:Q", format=".1%"),
        ],
    )
    .properties(height=430)
)
st.altair_chart(spending_chart, width="stretch")
st.caption("Source: Appropriations Summary, Sheet 30")


# Personal municipal-tax estimate
st.divider()
st.header("Estimate your municipal tax")
st.markdown(
    '<p class="section-intro">Enter a home\'s assessed value to estimate the '
    "municipal-purpose tax using the published prior-year local-purpose rate. "
    "This is not a tax bill or a confirmed 2026 rate.</p>",
    unsafe_allow_html=True,
)

tax_rate_row = next(
    row
    for row in budget["tables"]["levy_cap_calculation"]["rows"]
    if "Prior Year's Local Purpose Tax Rate" in row["line_item"]
)
prior_year_rate = tax_rate_row["amount"]

tax_input, tax_result = st.columns([0.8, 1.2], gap="large")
with tax_input:
    assessed_value = st.number_input(
        "Assessed home value",
        min_value=0,
        value=500_000,
        step=10_000,
        help="Use the assessed value, which may differ from the market value.",
    )
    estimated_tax = assessed_value * prior_year_rate / 100
    st.markdown(
        '<div class="privacy-note">Your value is processed for this Streamlit '
        "session to update the estimate. This app does not save it to the "
        "budget dataset or a database.</div>",
        unsafe_allow_html=True,
    )
    with st.expander("How is this calculated?"):
        st.code(
            f"${assessed_value:,.0f} × {prior_year_rate} ÷ 100 "
            f"= ${estimated_tax:,.2f}",
            language=None,
        )
        st.write(
            "The `0.427` rate is printed in the adopted budget as the "
            "**prior year's local-purpose tax rate per $100** on "
            "Sheet 3-Levy CAP. The final 2026 rate may differ."
        )

with tax_result:
    st.metric("Estimated municipal-purpose tax", dollars(estimated_tax, 2))
    personal_share = spending_data.copy()
    personal_share["Your estimated share"] = personal_share["Share"] * estimated_tax
    personal_chart = (
        alt.Chart(personal_share)
        .mark_bar(cornerRadiusEnd=6, color=SKY_700)
        .encode(
            x=alt.X(
                "Your estimated share:Q",
                title=None,
                axis=alt.Axis(format="$,.0f", grid=False),
            ),
            y=alt.Y("Category:N", title=None, sort="-x"),
            tooltip=[
                alt.Tooltip("Category:N"),
                alt.Tooltip("Your estimated share:Q", format="$,.2f"),
            ],
        )
        .properties(height=260)
    )
    st.altair_chart(personal_chart, width="stretch")
    st.caption(
        "Illustrative proportional allocation across official spending-summary "
        "categories. Municipal revenues are pooled; tax dollars are not traced "
        "to individual expenses."
    )


# Searchable detailed data
st.divider()
st.header("Explore every appropriation")
st.markdown(
    '<p class="section-intro">Search all 170 published rows by department, '
    "program, FCOA code, CAPS status, or source sheet.</p>",
    unsafe_allow_html=True,
)

appropriations = pd.DataFrame(budget["tables"]["appropriations"]["rows"])
filter_columns = st.columns([1.8, 1, 1, 1.25])

with filter_columns[0]:
    search = st.text_input(
        "Search the budget",
        placeholder="Try “police,” “roads,” or an FCOA code",
    )
with filter_columns[1]:
    group = st.selectbox(
        "Functional group",
        ["All groups", *sorted(appropriations["functional_group"].dropna().unique())],
    )
with filter_columns[2]:
    caps_status = st.selectbox(
        "CAPS status",
        ["All statuses", *sorted(appropriations["caps_status"].dropna().unique())],
    )
with filter_columns[3]:
    amount_view = st.selectbox(
        "Amount shown",
        [
            "2026 adopted budget",
            "2025 adopted budget",
            "2025 modified budget",
            "2025 paid/charged (actual)",
            "2025 reserved",
        ],
    )

filtered = appropriations.copy()
if search:
    searchable_columns = [
        "functional_group",
        "department_division_as_printed",
        "account_program",
        "type",
        "fcoa",
        "source_sheet",
    ]
    searchable_text = (
        filtered[searchable_columns]
        .fillna("")
        .astype(str)
        .agg(" ".join, axis=1)
        .str.lower()
    )
    filtered = filtered[searchable_text.str.contains(search.lower(), regex=False)]
if group != "All groups":
    filtered = filtered[filtered["functional_group"] == group]
if caps_status != "All statuses":
    filtered = filtered[filtered["caps_status"] == caps_status]

st.caption(f"Showing {len(filtered)} of {len(appropriations)} published rows")

amount_columns = {
    "2026 adopted budget": ("appropriated_2026_usd", "2026 adopted"),
    "2025 adopted budget": ("appropriated_2025_usd", "2025 adopted"),
    "2025 modified budget": (
        "total_2025_as_modified_by_transfers_usd",
        "2025 modified",
    ),
    "2025 paid/charged (actual)": (
        "2025_paid_or_charged_usd",
        "2025 paid/charged",
    ),
    "2025 reserved": ("2025_reserved_usd", "2025 reserved"),
}
selected_amount_column, selected_amount_label = amount_columns[amount_view]

display_columns = {
    "department_division_as_printed": "Department / division",
    "account_program": "Account / program",
    "type": "Type",
    "fcoa": "FCOA",
    "caps_status": "CAPS status",
    selected_amount_column: selected_amount_label,
    "source_sheet": "Source",
}
display_table = filtered[list(display_columns)].rename(columns=display_columns)

st.dataframe(
    display_table,
    width="stretch",
    hide_index=True,
    column_config={
        selected_amount_label: st.column_config.NumberColumn(format="$%.2f"),
    },
)


# Capital program
st.divider()
st.header("Capital projects: 2026–2031")
st.markdown(
    '<p class="section-intro">Capital projects are large, long-lasting '
    "investments such as roads, facilities, vehicles, and equipment. The "
    "published six-year program contains 37 numbered projects.</p>",
    unsafe_allow_html=True,
)

capital_program = pd.DataFrame(budget["tables"]["6_year_capital_program"]["rows"])
capital_projects = capital_program[
    capital_program["project_no"].notna() & capital_program["project_no"].ne("")
].copy()
capital_total = capital_program.iloc[-1]

capital_metrics = st.columns(3)
capital_metrics[0].metric("Six-year program", compact_dollars(capital_total["estimated_total_cost"]))
capital_metrics[1].metric("Published projects", f"{len(capital_projects)}")
capital_metrics[2].metric("Planned for 2026", compact_dollars(capital_total["fy2026"]))
show_source(capital_total["source_sheet"])

year_columns = [f"fy{year}" for year in range(2026, 2032)]
year_totals = pd.DataFrame(
    {
        "Year": [str(year) for year in range(2026, 2032)],
        "Amount": [capital_total[column] for column in year_columns],
    }
)
capital_timeline = (
    alt.Chart(year_totals)
    .mark_bar(cornerRadiusTopLeft=5, cornerRadiusTopRight=5, color=SKY_500)
    .encode(
        x=alt.X("Year:N", title="Fiscal year"),
        y=alt.Y("Amount:Q", title=None, axis=alt.Axis(format="$,.2s")),
        tooltip=[
            alt.Tooltip("Year:N"),
            alt.Tooltip("Amount:Q", format="$,.2f"),
        ],
    )
    .properties(height=310)
)
st.altair_chart(capital_timeline, width="stretch")

capital_left, capital_right = st.columns([1, 1], gap="large")
with capital_left:
    selected_project_number = st.selectbox(
        "View one project's six-year schedule",
        capital_projects["project_no"].tolist(),
        format_func=lambda number: (
            f"{number} · "
            f"{capital_projects.loc[capital_projects['project_no'] == number, 'project_title'].iloc[0]}"
        ),
    )
    selected_project = capital_projects[
        capital_projects["project_no"] == selected_project_number
    ].iloc[0]
    project_years = pd.DataFrame(
        {
            "Year": [str(year) for year in range(2026, 2032)],
            "Amount": [
                selected_project[column] or 0
                for column in year_columns
            ],
        }
    )
    project_chart = (
        alt.Chart(project_years)
        .mark_bar(cornerRadiusEnd=5, color=SKY_700)
        .encode(
            x=alt.X("Amount:Q", title=None, axis=alt.Axis(format="$,.2s")),
            y=alt.Y("Year:N", title=None),
            tooltip=[
                alt.Tooltip("Year:N"),
                alt.Tooltip("Amount:Q", format="$,.2f"),
            ],
        )
        .properties(height=280)
    )
    st.altair_chart(project_chart, width="stretch")
    st.caption(
        f"{selected_project['department_category']} · "
        f"Estimated total {dollars(selected_project['estimated_total_cost'])} · "
        f"{selected_project['source_sheet']}"
    )

with capital_right:
    funding_rows = pd.DataFrame(budget["tables"]["capital_funding_sources"]["rows"])
    funding_total = funding_rows.iloc[-1]
    funding_data = pd.DataFrame(
        [
            {
                "Funding source": "Capital improvement fund",
                "Amount": funding_total["capital_improvement_fund"],
            },
            {
                "Funding source": "Grants and other funds",
                "Amount": funding_total["grants_in_aid_and_other"],
            },
            {
                "Funding source": "General bonds / notes",
                "Amount": funding_total["bonds_notes_general"],
            },
        ]
    )
    funding_chart = (
        alt.Chart(funding_data)
        .mark_arc(innerRadius=65, outerRadius=120)
        .encode(
            theta=alt.Theta("Amount:Q"),
            color=alt.Color(
                "Funding source:N",
                scale=alt.Scale(range=[SKY_300, SKY_500, SLATE_700]),
                legend=alt.Legend(title=None, orient="bottom"),
            ),
            tooltip=[
                alt.Tooltip("Funding source:N"),
                alt.Tooltip("Amount:Q", format="$,.2f"),
            ],
        )
        .properties(height=350, title="Six-year funding sources")
    )
    st.altair_chart(funding_chart, width="stretch")
    st.caption(f"Source: {funding_total['source_sheet']}")

capital_group = st.selectbox(
    "Filter capital projects by department",
    ["All departments", *sorted(capital_projects["department_category"].unique())],
)
capital_display = capital_projects.copy()
if capital_group != "All departments":
    capital_display = capital_display[
        capital_display["department_category"] == capital_group
    ]

st.dataframe(
    capital_display[
        [
            "project_no",
            "department_category",
            "project_title",
            "estimated_total_cost",
            *year_columns,
            "source_sheet",
        ]
    ].rename(
        columns={
            "project_no": "Project",
            "department_category": "Department",
            "project_title": "Project title",
            "estimated_total_cost": "Estimated total",
            **{f"fy{year}": str(year) for year in range(2026, 2032)},
            "source_sheet": "Source",
        }
    ),
    width="stretch",
    hide_index=True,
)


# Methodology
st.divider()
st.header("About this data")
st.markdown(
    """
    <div class="method-note">
        Every displayed figure comes from the supplied
        <strong>WW 2026 Adopted Budget FULL</strong> workbook. Blank cells
        remain blank, printed totals are not silently recalculated, and
        detailed rows retain their original FCOA and source-sheet references.
    </div>
    """,
    unsafe_allow_html=True,
)
st.write(
    "This tool explains and organizes public budget data. It is not an "
    "official Township of West Windsor publication and does not replace the "
    "adopted budget document."
)

with st.expander("Read the full plain-English glossary"):
    for term in budget["tables"]["glossary"]["rows"]:
        st.markdown(f"**{term['term']}**")
        st.write(term["plain_english_meaning"])

st.subheader("Download the source and cleaned data")
download_columns = st.columns(4)
with download_columns[0]:
    st.download_button(
        "Source workbook",
        data=SOURCE_WORKBOOK_PATH.read_bytes(),
        file_name=SOURCE_WORKBOOK_PATH.name,
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        width="stretch",
    )
with download_columns[1]:
    st.download_button(
        "Complete JSON",
        data=json.dumps(budget, indent=2),
        file_name="ww_2026_budget.json",
        mime="application/json",
        width="stretch",
    )
with download_columns[2]:
    st.download_button(
        "Appropriations CSV",
        data=appropriations.to_csv(index=False),
        file_name="ww_2026_appropriations.csv",
        mime="text/csv",
        width="stretch",
    )
with download_columns[3]:
    st.download_button(
        "Capital projects CSV",
        data=capital_projects.to_csv(index=False),
        file_name="ww_2026_capital_projects.csv",
        mime="text/csv",
        width="stretch",
    )

st.markdown(
    """
    **Known source note:** Sheet 25's printed Operations Excluded from CAPS
    total includes a $3,500 Matching Funds for Grants line that is not assigned
    to either its printed Salaries & Wages or Other Expenses subtotal. The
    dataset retains the printed figures and flags the distinction rather than
    silently changing the source.
    """
)
st.caption("Built by West Windsor Forward · Nonpartisan · Source-first")
