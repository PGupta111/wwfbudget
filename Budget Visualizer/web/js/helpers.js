// West Windsor 2026 Budget Visualizer — shared data helpers (no side effects,
// safe to import from any page).

// Appropriation rows whose `type` is one of these are the form's own
// subtotal/total/detail rows, not individual line items. Summing them
// alongside real line items would double- (or triple-) count spending.
// FCOA 50-899 ("Reserve for Uncollected Taxes") is the one exception: it is
// printed as a "Total" row but is itself a single real appropriation, not a
// sum of other rows shown elsewhere.
const AGGREGATE_TYPES = new Set(["Total", "Grand Total", "Detail"]);
const RESERVE_FCOA = "50-899";

export const FUNCTIONAL_GROUPS = {
  "Public Safety": { color: "var(--grp-9)", blurb: "Police, fire services, and the fire official's office." },
  "Public Works & Utilities": { color: "var(--grp-3)", blurb: "Roads, snow removal, sewers, garbage and recycling, street lighting, and municipal facilities." },
  "Insurance & Employee Benefits": { color: "var(--grp-7)", blurb: "Health insurance, liability insurance, and workers' compensation for township employees." },
  "Debt Service": { color: "var(--grp-12)", blurb: "Principal and interest payments on money the township has borrowed for past projects." },
  "Pensions & Statutory Expenditures": { color: "var(--grp-6)", blurb: "Required contributions to state pension systems (PERS, PFRS) and Social Security." },
  "General Government & Administration": { color: "var(--grp-1)", blurb: "Township council, clerk, finance, mayor's office, legal, and general administration." },
  "Land Use, Planning & Community Development": { color: "var(--grp-11)", blurb: "Engineering, planning board, zoning, environmental commission, and community development." },
  "Reserve for Uncollected Taxes": { color: "var(--grp-13)", blurb: "Money set aside in case some property taxes aren't collected during the year." },
  "Shared Service Agreements (Interlocal)": { color: "var(--grp-2)", blurb: "Services shared with neighboring towns, like animal control and regional health services." },
  "Health & Human Services": { color: "var(--grp-4)", blurb: "Board of Health, senior citizen services, and related programs." },
  "Recreation & Parks": { color: "var(--grp-5)", blurb: "Township recreation programs and park maintenance." },
  "Capital Improvements": { color: "var(--grp-8)", blurb: "Cash set aside this year to help pay for next year's equipment and infrastructure projects." },
  "Grants — Public & Private Programs": { color: "var(--grp-10)", blurb: "Spending funded by grants from the state, county, or other outside sources." },
};

// Plain-English summaries of what each functional group covers, based on the
// Township of West Windsor's own department descriptions
// (westwindsortwp.gov/government/departments).
export const GROUP_DETAILS = {
  "Public Safety": "Covers the Police Department (community policing, animal control, traffic safety) and Fire & Emergency Services (fire suppression, EMS, the fire marshal's office, and emergency management), including township aid to the volunteer fire companies.",
  "Public Works & Utilities": "Covers the Department of Public Works — garbage and recycling collection, snow removal, and street and road maintenance — plus the sewer system, public buildings and grounds, and the township's share of the regional sewerage authority.",
  "Insurance & Employee Benefits": "Covers health insurance, liability insurance, and workers' compensation for township employees, plus accrued sick-leave payouts.",
  "Debt Service": "Principal and interest payments on bonds and loans the township has taken out to pay for past capital projects (roads, buildings, equipment, etc.).",
  "Pensions & Statutory Expenditures": "Required township contributions to state pension systems for police/fire (PFRS) and other employees (PERS), plus Social Security and unemployment insurance.",
  "General Government & Administration": "Covers Township Council and the Clerk's office (elections, licensing, public records), the Mayor's office and administration, the Finance division (tax billing/collection, budgeting), the Township Attorney, and the Municipal Court.",
  "Land Use, Planning & Community Development": "Covers Planning & Zoning (master plan, zoning board, land use approvals), Engineering (infrastructure, stormwater management), and Community Development (affordable housing, code enforcement).",
  "Reserve for Uncollected Taxes": "A required set-aside: since the township must send the school district and county their full share of taxes regardless of how much it actually collects from residents, it reserves money in case some property taxes go unpaid during the year.",
  "Shared Service Agreements (Interlocal)": "Services West Windsor shares with neighboring towns, the county, or the school district — for example, providing police or health services to another municipality, or receiving animal control, refuse collection, or recycling services from a neighboring town or county authority.",
  "Health & Human Services": "Covers the Division of Health (animal licensing, vital statistics, health inspections, Board of Health), the Municipal Alliance (substance-abuse prevention programs), and affordable housing administration.",
  "Recreation & Parks": "Covers the Division of Recreation & Parks, which operates the township's recreation facilities and programs (including the aquatic center) and the Senior Citizens Program.",
  "Capital Improvements": "Cash the township sets aside this year (rather than borrowing) to help pay for next year's equipment purchases and infrastructure projects.",
  "Grants — Public & Private Programs": "Spending that is funded dollar-for-dollar by grants from the state, county, or other outside sources — these appropriations exactly match anticipated grant revenue.",
};

export const REVENUE_DETAILS = {
  "Property taxes": "The portion of your property tax bill that goes to the township's municipal budget (separate from school and county taxes), based on each property's assessed value and the local tax rate.",
  "Surplus used (savings)": "Money left over from prior years (the township's \"fund balance\" or savings account) that is being applied to reduce how much needs to be raised from this year's taxes.",
  "Fees, state aid & other revenue": "Everything besides property taxes and surplus: state aid, fees for services and permits, utility/UCC fees, shared-service payments from other towns, grants, and other miscellaneous revenue.",
  "Delinquent tax receipts": "Payments received during 2026 for property taxes that were owed from prior years but not yet collected.",
};

export const REVENUE_SOURCES = [
  {
    label: "Property taxes",
    description: "Total Amount to be Raised by Taxes for Support of Municipal Budget",
    color: "var(--brand-700)",
  },
  {
    label: "Surplus used (savings)",
    description: "Surplus Anticipated",
    color: "var(--brand-500)",
  },
  {
    label: "Fees, state aid & other revenue",
    description: "Total Miscellaneous Revenues",
    color: "var(--brand-300)",
  },
  {
    label: "Delinquent tax receipts",
    description: "Receipts from Delinquent Taxes",
    color: "#a5b4fc",
  },
];

export function dollars(value, decimals = 0) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function compactDollars(value) {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return dollars(value);
}

/** True if an appropriations row is a real line item (not a printed subtotal/total). */
export function isLineItem(row) {
  if (!AGGREGATE_TYPES.has(row.type)) return true;
  return row.fcoa === RESERVE_FCOA;
}

/** All real appropriation line items (no double-counted subtotal/total rows). */
export function getLineItems(data) {
  return data.tables.appropriations.rows.filter(isLineItem);
}

/** 2026 spending grouped by functional category, sorted largest first. */
export function getSpendingByGroup(data) {
  const totals = new Map();
  for (const row of getLineItems(data)) {
    const amount = row.appropriated_2026_usd || 0;
    totals.set(row.functional_group, (totals.get(row.functional_group) || 0) + amount);
  }
  return [...totals.entries()]
    .map(([group, amount]) => ({
      group,
      amount,
      color: FUNCTIONAL_GROUPS[group]?.color || "var(--grp-13)",
      blurb: FUNCTIONAL_GROUPS[group]?.blurb || "",
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Township-wide 2026 vs. 2025 appropriations total, from the same line items
 * used everywhere else (so it reconciles with the spending donut/Sankey). */
export function getTotalAppropriationsYoY(data) {
  let total2026 = 0;
  let total2025 = 0;
  for (const row of getLineItems(data)) {
    total2026 += row.appropriated_2026_usd || 0;
    total2025 += row.appropriated_2025_usd || 0;
  }
  const change = total2026 - total2025;
  return { total2026, total2025, change, pctChange: total2025 ? (change / total2025) * 100 : null };
}

/** 2026 vs. 2025 spending by functional category, sorted by the size of the
 * dollar change (largest movers first, regardless of direction). */
export function getSpendingByGroupYoY(data) {
  const totals2026 = new Map();
  const totals2025 = new Map();
  for (const row of getLineItems(data)) {
    const group = row.functional_group;
    totals2026.set(group, (totals2026.get(group) || 0) + (row.appropriated_2026_usd || 0));
    totals2025.set(group, (totals2025.get(group) || 0) + (row.appropriated_2025_usd || 0));
  }
  const groups = new Set([...totals2026.keys(), ...totals2025.keys()]);
  return [...groups]
    .map((group) => {
      const amount2026 = totals2026.get(group) || 0;
      const amount2025 = totals2025.get(group) || 0;
      const change = amount2026 - amount2025;
      return {
        group,
        amount2026,
        amount2025,
        change,
        pctChange: amount2025 ? (change / amount2025) * 100 : null,
        color: FUNCTIONAL_GROUPS[group]?.color || "var(--grp-13)",
      };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** The largest individual 2026 appropriation line items, largest first. */
export function getLargestSpendingLines(data, n = 10) {
  return getLineItems(data)
    .filter((row) => (row.appropriated_2026_usd || 0) > 0)
    .map((row) => ({
      label: row.account_program || row.department_division_as_printed || "Unlabeled",
      department: row.department_division_as_printed,
      group: row.functional_group,
      amount: row.appropriated_2026_usd,
      amount2025: row.appropriated_2025_usd || 0,
      fcoa: row.fcoa,
      source: row.source_sheet,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

/** Real 2026 line items within a functional group, broken down by department/division
 * (using the most specific part of the printed department label), largest first. */
export function getDepartmentBreakdown(data, group) {
  const totals = new Map();
  for (const row of getLineItems(data)) {
    if (row.functional_group !== group) continue;
    const amount = row.appropriated_2026_usd || 0;
    if (!amount) continue;
    const printed = row.department_division_as_printed || "Other / unclassified";
    const parts = printed.split(">").map((p) => p.trim());
    const label = parts[parts.length - 1];
    totals.set(label, (totals.get(label) || 0) + amount);
  }
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Breakdown of "Fees, state aid & other revenue" (Total Miscellaneous Revenues)
 * into its published sections (A-G), largest first. */
export function getMiscRevenueBreakdown(data) {
  const rows = data.tables.revenues_summary.rows;
  return rows
    .filter((r) => r.description.startsWith("Total Section ") && r.anticipated_2026_usd)
    .map((r) => ({
      label: r.description.replace(/^Total Section [A-Z]: /, ""),
      amount: r.anticipated_2026_usd,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** 2026 revenue, broken into the four headline sources (sums to the grand total). */
export function getRevenueSources(data) {
  const rows = data.tables.revenues_summary.rows;
  return REVENUE_SOURCES.map((source) => {
    const row = rows.find((r) => r.description === source.description);
    return { ...source, amount: (row && row.anticipated_2026_usd) || 0 };
  });
}

export function findSummaryRow(data, descriptionContains) {
  return data.tables.appropriations_summary.rows.find((r) =>
    r.description.includes(descriptionContains)
  );
}

export async function loadBudget() {
  const response = await fetch("data/budget.json");
  if (!response.ok) throw new Error(`Failed to load budget data: ${response.status}`);
  return response.json();
}
