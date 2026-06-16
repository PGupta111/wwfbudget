// Floating "Budget reference desk" assistant.
//
// Self-contained: injects its own launcher + panel, so a page only needs
// `<script type="module" src="js/chat.js"></script>`. It talks to the
// /api/chat serverless function, which is grounded in the budget data and
// guard-railed to answer only questions about the 2026 adopted budget.

const SUGGESTIONS = [
  "What is the biggest category of spending?",
  "How much is budgeted for Public Safety?",
  "What does “Reserve for Uncollected Taxes” mean?",
  "What changed from 2025 to 2026?",
];

const WELCOME =
  "Hi — I’m the budget reference desk. Ask me about any figure in West Windsor’s **2026 adopted municipal budget** and I’ll look it up and explain what it means. I stick to the numbers as printed — no opinions or projections.";

const state = {
  open: false,
  busy: false,
  messages: [], // { role: "user" | "assistant", content }
};

let els = {};

function h(tag, attrs = {}, html) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("aria") || k === "role" || k === "type" || k === "tabindex")
      el.setAttribute(k, v);
    else el[k] = v;
  }
  if (html !== undefined) el.innerHTML = html;
  return el;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Defense in depth: if the model ever emits a Markdown/ASCII table despite
 * the instruction not to, degrade it to readable text instead of broken pipes. */
function detableify(text) {
  return text
    .split("\n")
    // Drop separator rows like |---|:--:|---|
    .filter((l) => !(/\|/.test(l) && /^[\s|:.-]+$/.test(l)))
    // Turn pipe columns into middot-separated text
    .map((l) =>
      l.includes("|")
        ? l
            .replace(/^\s*\|/, "")
            .replace(/\|\s*$/, "")
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(" · ")
        : l
    )
    .join("\n");
}

/** Tiny, safe markdown: escapes first, then re-adds bold, lists, paragraphs. */
function renderMarkdown(text) {
  const esc = escapeHtml(detableify(text).trim());
  const blocks = esc.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const linesArr = block.split(/\n/);
      const isList = linesArr.every((l) => /^\s*[-*•]\s+/.test(l));
      let out;
      if (isList) {
        out =
          "<ul>" +
          linesArr.map((l) => `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>`).join("") +
          "</ul>";
      } else {
        out = "<p>" + linesArr.join("<br>") + "</p>";
      }
      return out;
    })
    .join("")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function scrollToEnd() {
  requestAnimationFrame(() => {
    els.log.scrollTop = els.log.scrollHeight;
  });
}

function addBubble(role, contentHtml, opts = {}) {
  const bubble = h("div", { class: `wwf-chat-msg wwf-chat-msg--${role}` });
  bubble.innerHTML = contentHtml;
  if (opts.id) bubble.id = opts.id;
  els.log.appendChild(bubble);
  scrollToEnd();
  return bubble;
}

function renderSuggestions() {
  const wrap = h("div", { class: "wwf-chat-suggest" });
  SUGGESTIONS.forEach((q) => {
    const b = h("button", { type: "button", class: "wwf-chat-chip" }, escapeHtml(q));
    b.addEventListener("click", () => {
      wrap.remove();
      send(q);
    });
    wrap.appendChild(b);
  });
  els.log.appendChild(wrap);
  scrollToEnd();
}

function setBusy(busy) {
  state.busy = busy;
  els.input.disabled = busy;
  els.sendBtn.disabled = busy;
  els.form.classList.toggle("is-busy", busy);
}

async function send(text) {
  const q = text.trim();
  if (!q || state.busy) return;

  state.messages.push({ role: "user", content: q });
  addBubble("user", escapeHtml(q));
  els.input.value = "";
  autoGrow();
  setBusy(true);

  const typing = addBubble(
    "assistant",
    '<span class="wwf-chat-typing"><i></i><i></i><i></i></span>',
    { id: "wwf-chat-typing" }
  );

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages }),
    });
    const data = await res.json().catch(() => ({}));
    typing.remove();

    if (!res.ok) {
      addBubble(
        "assistant",
        `<p class="wwf-chat-err">${escapeHtml(
          data.error || "The assistant is unavailable right now. Please try again."
        )}</p>`
      );
      return;
    }
    const reply = data.reply || "Sorry, I don’t have an answer for that.";
    state.messages.push({ role: "assistant", content: reply });
    addBubble("assistant", renderMarkdown(reply));
  } catch (err) {
    typing.remove();
    addBubble(
      "assistant",
      '<p class="wwf-chat-err">I couldn’t reach the assistant. Please check your connection and try again.</p>'
    );
  } finally {
    setBusy(false);
    els.input.focus();
  }
}

function openPanel() {
  state.open = true;
  // Make it visible immediately and unconditionally — the `is-open` class only
  // drives the entrance animation, it must never gate whether the panel shows.
  els.panel.hidden = false;
  els.root.classList.add("is-open");
  els.launcher.setAttribute("aria-expanded", "true");
  if (!els.log.dataset.greeted) {
    addBubble("assistant", renderMarkdown(WELCOME));
    renderSuggestions();
    els.log.dataset.greeted = "1";
  }
  requestAnimationFrame(() => els.input.focus());
}

function closePanel() {
  state.open = false;
  els.root.classList.remove("is-open");
  els.panel.hidden = true;
  els.launcher.setAttribute("aria-expanded", "false");
  els.launcher.focus();
}

function autoGrow() {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";
}

function build() {
  const root = h("div", { class: "wwf-chat" });

  const launcher = h(
    "button",
    {
      type: "button",
      class: "wwf-chat-launcher",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-label": "Ask about the 2026 budget",
    },
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.55L3 21l1.95-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg><span>Ask about the budget</span>`
  );
  launcher.addEventListener("click", () => (state.open ? closePanel() : openPanel()));

  const panel = h("div", {
    class: "wwf-chat-panel",
    role: "dialog",
    "aria-label": "Budget reference desk",
  });
  panel.hidden = true;
  panel.innerHTML = `
    <div class="wwf-chat-head">
      <div class="wwf-chat-head-id">
        <span class="wwf-chat-dot" aria-hidden="true"></span>
        <div>
          <strong>Budget reference desk</strong>
          <span>Answers from the 2026 adopted budget</span>
        </div>
      </div>
      <button type="button" class="wwf-chat-close" aria-label="Close">&times;</button>
    </div>
    <div class="wwf-chat-log" id="wwf-chat-log" aria-live="polite"></div>
    <form class="wwf-chat-form" id="wwf-chat-form">
      <textarea id="wwf-chat-input" rows="1" placeholder="Ask about a category, line item, or term…"
        aria-label="Your question" autocomplete="off"></textarea>
      <button type="submit" class="wwf-chat-send" aria-label="Send">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/></svg>
      </button>
    </form>
    <p class="wwf-chat-foot">Looks up figures only — no advice or predictions. Verify against the <a href="data.html">data tables</a>.</p>
  `;

  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);

  els = {
    root,
    launcher,
    panel,
    log: panel.querySelector("#wwf-chat-log"),
    form: panel.querySelector("#wwf-chat-form"),
    input: panel.querySelector("#wwf-chat-input"),
    sendBtn: panel.querySelector(".wwf-chat-send"),
  };

  panel.querySelector(".wwf-chat-close").addEventListener("click", closePanel);
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(els.input.value);
  });
  els.input.addEventListener("input", autoGrow);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(els.input.value);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.open) closePanel();
  });

  // Let any element opt in to opening the assistant (e.g. the header button).
  document.querySelectorAll("[data-open-chat]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      openPanel();
    })
  );
}

function boot() {
  try {
    build();
  } catch (err) {
    console.error("Budget chat failed to initialize:", err);
  }
}

if (document.body) boot();
else document.addEventListener("DOMContentLoaded", boot);
