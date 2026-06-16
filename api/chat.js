// Vercel serverless function: the West Windsor 2026 Budget "reference desk".
//
// It answers questions strictly about the figures in the adopted 2026 municipal
// budget. The model never sees the open internet — it is grounded only in the
// budget data assembled below — and a tight system instruction keeps it acting
// like a reference librarian (look up and explain the numbers) rather than a
// consultant (no advice, predictions, opinions, or hypotheticals).
//
// Configuration (set in Vercel → Project → Settings → Environment Variables):
//   GEMINI_API_KEY   (required)  your Google AI Studio / Gemini API key
//   GEMINI_MODEL     (optional)  defaults to "gemini-3.1-flash-lite"

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

// Functional-group color/order is not needed here; we only need the numbers.
const AGGREGATE_TYPES = new Set(["Total", "Grand Total", "Detail"]);
const RESERVE_FCOA = "50-899";

let cachedContext = null; // built once per warm instance

function isLineItem(row) {
  if (!AGGREGATE_TYPES.has(row.type)) return true;
  return row.fcoa === RESERVE_FCOA;
}

function usd(n) {
  if (n === null || n === undefined || n === "") return "(blank)";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fetch the site's own budget.json (single source of truth) and turn it into a
 * compact but complete plain-text brief the model can quote from exactly. */
async function buildContext(req) {
  if (cachedContext) return cachedContext;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const res = await fetch(`${proto}://${host}/data/budget.json`);
  if (!res.ok) throw new Error(`budget data fetch failed: ${res.status}`);
  const data = await res.json();

  const lines = [];
  lines.push(`SOURCE: ${data.metadata?.title || "West Windsor 2026 Adopted Budget"}`);
  lines.push("");
  lines.push("== PLAIN-ENGLISH OVERVIEW & FIDELITY RULES ==");
  (data.overview || []).forEach((l) => lines.push(l));

  lines.push("");
  lines.push("== HEADLINE FIGURES ==");
  for (const [k, v] of Object.entries(data.headline || {})) {
    lines.push(`${k.replace(/_/g, " ")}: ${usd(v.amount)} [${v.source}]`);
  }

  // Spending grouped by functional category (reconciles with the charts).
  const approps = data.tables?.appropriations?.rows || [];
  const items = approps.filter(isLineItem);
  const byGroup = new Map();
  for (const r of items) {
    const g = r.functional_group || "Other";
    byGroup.set(g, (byGroup.get(g) || 0) + (r.appropriated_2026_usd || 0));
  }
  lines.push("");
  lines.push("== 2026 SPENDING BY FUNCTIONAL GROUP (sums of real line items) ==");
  [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, amt]) => lines.push(`${g}: ${usd(amt)}`));

  lines.push("");
  lines.push("== EVERY APPROPRIATION LINE ITEM (2026 vs 2025) ==");
  lines.push("group | department/division | account/program | FCOA | CAPS status | 2026 | 2025 | source sheet");
  for (const r of items) {
    lines.push(
      [
        r.functional_group || "",
        r.department_division_as_printed || "",
        r.account_program || "",
        r.fcoa || "",
        r.caps_status || "",
        usd(r.appropriated_2026_usd),
        usd(r.appropriated_2025_usd),
        r.source_sheet || "",
      ].join(" | ")
    );
  }

  // Capital projects.
  const cap2026 = data.tables?.capital_budget_2026;
  if (cap2026) {
    lines.push("");
    lines.push(`== CAPITAL PROJECTS — 2026 (${cap2026.source_sheet || ""}) ==`);
    for (const r of cap2026.rows.filter((x) => x.project_no !== null)) {
      lines.push(`${r.department_category || ""} — ${r.project_title || ""}: est. total ${usd(r.estimated_total_cost)}`);
    }
  }
  const cap6 = data.tables?.["6_year_capital_program"];
  if (cap6) {
    lines.push("");
    lines.push(`== CAPITAL PROGRAM — 6-YEAR (${cap6.source_sheet || ""}) ==`);
    for (const r of cap6.rows.filter((x) => x.project_no !== null)) {
      lines.push(`${r.department_category || ""} — ${r.project_title || ""}: est. total ${usd(r.estimated_total_cost)}`);
    }
  }

  cachedContext = lines.join("\n");
  return cachedContext;
}

const SYSTEM_RULES = `You are the reference desk for the Township of West Windsor's ADOPTED 2026 MUNICIPAL BUDGET. You behave like a reference librarian, not a consultant or advisor.

WHAT YOU DO:
- Look up and report figures from the budget data provided below, and explain in plain English what those figures and budget terms mean.
- When you give a dollar figure, name the source sheet shown in the data (e.g. "[Budget Summary, Sheet 3]").
- Keep answers short, factual, and neutral. Use the figures exactly as printed; never recalculate or round in a way that changes a printed total.

WHAT YOU NEVER DO:
- Never answer hypothetical, "what if", projection, or forecasting questions (e.g. "what if we cut police", "how much will taxes be in 2030"). Decline and explain you can only describe the figures that are actually in the 2026 adopted budget.
- Never give advice, recommendations, opinions, predictions, or political/value judgments about whether spending is good, bad, too high, or too low.
- Never use outside knowledge or invent numbers. If a figure or topic is not in the data below, say it is not in the 2026 adopted budget data and suggest the Data Tables page or the named source sheet.
- Do not discuss anything other than this budget. For off-topic or out-of-scope requests, briefly decline and invite a question about the 2026 budget.

STYLE: A calm, precise librarian. Quote the number, cite the sheet, explain the term if helpful. No speculation. If a question is ambiguous, ask which figure they mean.

Below is the complete budget data you may use. It is the ONLY source you may draw on.
`;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        "The assistant isn't configured yet — the site owner needs to add a GEMINI_API_KEY in Vercel.",
    });
    return;
  }

  let body = req.body;
  if (body === undefined || body === null) {
    // Body wasn't pre-parsed by the platform — read it off the stream.
    body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => resolve(raw));
      req.on("error", () => resolve(""));
    });
  }
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) {
    res.status(400).json({ error: "No question provided." });
    return;
  }

  // Keep it lightweight and abuse-resistant: cap history and message length.
  const trimmed = messages
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      text: String(m.content || "").slice(0, 1500),
    }))
    .filter((m) => m.text.trim());

  if (!trimmed.length || trimmed[trimmed.length - 1].role !== "user") {
    res.status(400).json({ error: "No question provided." });
    return;
  }

  let context;
  try {
    context = await buildContext(req);
  } catch (err) {
    console.error("context build failed:", err);
    res.status(502).json({ error: "Couldn't load the budget data right now. Please try again." });
    return;
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_RULES + "\n" + context }] },
    contents: trimmed.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 900,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error("Gemini error", r.status, detail.slice(0, 500));
      const msg =
        r.status === 400 || r.status === 404
          ? "The assistant model is misconfigured (check GEMINI_MODEL). "
          : "";
      res.status(502).json({ error: `${msg}The assistant is unavailable right now.` });
      return;
    }

    const out = await r.json();
    const cand = out.candidates?.[0];
    const reply =
      cand?.content?.parts?.map((p) => p.text).filter(Boolean).join("") || "";

    if (!reply) {
      const blocked =
        out.promptFeedback?.blockReason || cand?.finishReason || "no_content";
      res.status(200).json({
        reply:
          "I can only answer questions about the figures in West Windsor's 2026 adopted budget. Try asking about a specific category, line item, or what a budget term means.",
        meta: { finish: blocked },
      });
      return;
    }

    res.status(200).json({ reply });
  } catch (err) {
    console.error("chat handler failed:", err);
    res.status(502).json({ error: "The assistant is unavailable right now. Please try again." });
  }
};
