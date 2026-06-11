// Sankey "money flow" diagram: revenue sources -> total budget -> spending groups
import { dollars, getRevenueSources, getSpendingByGroup } from "./helpers.js";

const WIDTH = 1180;
const HEIGHT = 720;
const TOP_MARGIN = 30;
const LEFT_MARGIN = 200;
const RIGHT_MARGIN = 240;

function resolveColor(cssVar) {
  if (!cssVar.startsWith("var(")) return cssVar;
  const name = cssVar.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Wrap a label into at most `maxLines` tspans of roughly `maxChars` characters.
function wrapLabel(text, maxChars, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  // Whatever's left over gets folded into the last line (with ellipsis if needed)
  const consumed = lines.join(" ").length;
  if (consumed < text.length) {
    const last = lines.pop();
    let combined = `${last} ${words.slice(text.split(" ").length - 0).join("")}`.trim();
    // Simpler: just append remaining words and ellipsize
    const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length;
    const remaining = words.slice(usedWords + last.split(/\s+/).length).join(" ");
    combined = remaining ? `${last}…` : last;
    lines.push(combined);
  }
  return lines;
}

/** Push down/up a sorted-by-y array of label objects so none overlap, while
 * staying within [minY, maxY]. */
function layoutLabels(items, minGap, minY, maxY) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) {
    if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
  }
  const overflow = items[items.length - 1]?.y - maxY;
  if (overflow > 0) {
    items.forEach((d) => (d.y -= overflow));
    for (let i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
    }
  }
  if (items[0] && items[0].y < minY) items[0].y = minY;
}

/** Render a big donut chart of {label/group, amount, color} into svgId, with
 * external leader-line labels (name + amount) placed next to each slice, a
 * centered running total, and a hover popover with a fuller description
 * (from getDetail). Arcs draw in and labels fade in with a stagger the first
 * time the chart scrolls into view. */
export function renderDonut(items, total, svgId, centerId, getDetail) {
  const width = 760;
  const height = 480;
  const cx = width / 2;
  const cy = height / 2;
  const outerR = 92;
  const innerR = 60;
  const bendR = 108;
  const labelX = 270;

  const svg = d3.select(`#${svgId}`).attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll("*").remove();

  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
  const labelLayer = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  const pie = d3.pie().value((d) => d.amount).sort(null).padAngle(0.006);
  const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(2);
  const outerArc = d3.arc().innerRadius(bendR).outerRadius(bendR);
  const hoverArc = d3.arc().innerRadius(innerR).outerRadius(outerR + 6).cornerRadius(2);

  const arcsData = pie(items);
  const sum = items.reduce((s, d) => s + d.amount, 0);
  const midAngle = (d) => d.startAngle + (d.endAngle - d.startAngle) / 2;

  const popover = ensureDonutPopover();

  function showPopover(d, target) {
    const item = d.data;
    const pct = ((item.amount / total) * 100).toFixed(1);
    const desc = getDetail ? getDetail(item) : "";
    popover.html(`
      <div class="donut-pop-swatch" style="background:${resolveColor(item.color)}"></div>
      <div class="donut-pop-body">
        <h4>${item.label || item.group}</h4>
        <div class="donut-pop-amount">${dollars(item.amount, 0)} &middot; ${pct}% of the budget</div>
        ${desc ? `<p>${desc}</p>` : ""}
      </div>
    `);
    const rect = target.getBoundingClientRect();
    const wrapRect = svg.node().closest(".donut-feature-wrap").getBoundingClientRect();
    popover.classed("visible", true);
    const popRect = popover.node().getBoundingClientRect();
    let left = rect.left + window.scrollX + rect.width / 2 - popRect.width / 2;
    left = Math.max(
      wrapRect.left + window.scrollX,
      Math.min(left, wrapRect.right + window.scrollX - popRect.width)
    );
    let top = rect.top + window.scrollY - popRect.height - 12;
    if (top < window.scrollY) top = rect.bottom + window.scrollY + 12;
    popover.style("left", `${left}px`).style("top", `${top}px`);
  }

  function hidePopover() {
    popover.classed("visible", false);
  }

  // Slices
  const paths = g
    .selectAll("path")
    .data(arcsData)
    .join("path")
    .attr("fill", (d) => resolveColor(d.data.color))
    .attr("stroke", resolveColor("var(--card)"))
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .attr("d", (d) => arc({ ...d, startAngle: d.startAngle, endAngle: d.startAngle }))
    .on("mouseenter", function (event, d) {
      d3.select(this).transition().duration(160).attr("d", hoverArc);
      showPopover(d, this);
    })
    .on("mouseleave", function () {
      d3.select(this).transition().duration(160).attr("d", arc);
      hidePopover();
    });

  // Center running total
  const centerEl = centerId ? document.getElementById(centerId) : null;

  // External leader-line labels, split left/right and collision-avoided.
  const leftItems = [];
  const rightItems = [];
  arcsData.forEach((d) => {
    const angle = midAngle(d);
    const isRight = angle < Math.PI;
    const [, y] = outerArc.centroid(d);
    const entry = { d, y, angle, isRight };
    (isRight ? rightItems : leftItems).push(entry);
  });
  layoutLabels(rightItems, 46, -cy + 16, cy - 16);
  layoutLabels(leftItems, 46, -cy + 16, cy - 16);

  const allLabelItems = [...leftItems, ...rightItems];

  const labelGroups = labelLayer
    .selectAll("g")
    .data(allLabelItems)
    .join("g")
    .attr("class", "donut-label-group")
    .style("cursor", "pointer")
    .style("opacity", 0)
    .on("mouseenter", function (entry) {
      const idx = arcsData.indexOf(entry.d);
      const path = paths.nodes()[idx];
      d3.select(path).transition().duration(160).attr("d", hoverArc);
      showPopover(entry.d, path);
    })
    .on("mouseleave", function (entry) {
      const idx = arcsData.indexOf(entry.d);
      const path = paths.nodes()[idx];
      d3.select(path).transition().duration(160).attr("d", arc);
      hidePopover();
    });

  // Leader lines
  labelGroups
    .append("polyline")
    .attr("class", "donut-leader")
    .attr("points", (entry) => {
      const d = entry.d;
      const arcPoint = arc.centroid(d);
      const bendPoint = outerArc.centroid(d);
      const labelPoint = [entry.isRight ? labelX : -labelX, entry.y];
      return [arcPoint, bendPoint, labelPoint].map((p) => p.join(",")).join(" ");
    });

  // Swatch
  labelGroups
    .append("circle")
    .attr("class", "donut-label-swatch")
    .attr("r", 4)
    .attr("fill", (entry) => resolveColor(entry.d.data.color))
    .attr("cx", (entry) => (entry.isRight ? labelX - 8 : -labelX + 8))
    .attr("cy", (entry) => entry.y);

  // Term + amount text (wrapped to 2 lines)
  labelGroups.each(function (entry) {
    const group = d3.select(this);
    const anchor = entry.isRight ? "start" : "end";
    const textX = entry.isRight ? labelX + 2 : -labelX - 2;
    const lines = wrapLabel(entry.d.data.label || entry.d.data.group, 22, 2);
    const startDy = lines.length > 1 ? -5 : 4;

    const nameText = group
      .append("text")
      .attr("class", "donut-label-name")
      .attr("x", textX)
      .attr("y", entry.y)
      .attr("text-anchor", anchor);

    lines.forEach((line, i) => {
      nameText
        .append("tspan")
        .attr("x", textX)
        .attr("dy", i === 0 ? startDy : 13)
        .text(line);
    });

    group
      .append("text")
      .attr("class", "donut-label-amount")
      .attr("x", textX)
      .attr("y", entry.y)
      .attr("dy", startDy + (lines.length - 1) * 13 + 13)
      .attr("text-anchor", anchor)
      .text(dollars(entry.d.data.amount, 0));
  });

  function animateNumber(el, target, duration) {
    if (!el) return;
    d3.select(el)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .tween("text", function () {
        const interp = d3.interpolateNumber(0, target);
        return (t) => {
          el.textContent = dollars(interp(t), 0);
        };
      });
  }

  function animate() {
    paths
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attrTween("d", function (d) {
        const interp = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
        return (t) => arc(interp(t));
      });

    labelGroups
      .transition()
      .delay((_, i) => 300 + i * 45)
      .duration(450)
      .ease(d3.easeCubicOut)
      .style("opacity", 1);

    animateNumber(centerEl, sum, 900);
  }

  const wrap = svg.node().closest(".donut-grid") || svg.node().closest(".donut-feature");
  if (wrap && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate();
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(wrap);
  } else {
    animate();
  }
}

let donutPopoverEl = null;
function ensureDonutPopover() {
  if (!donutPopoverEl) {
    donutPopoverEl = d3.select("body").append("div").attr("class", "donut-popover").attr("id", "donut-popover");
  }
  return donutPopoverEl;
}

export function renderSankey(data, onNodeClick) {
  const total = data.headline.total_budget.amount;
  const revenues = getRevenueSources(data);
  const spending = getSpendingByGroup(data);

  // Build node list: revenue sources, then the central "2026 Budget" node,
  // then spending groups.
  const nodes = [
    ...revenues.map((r) => ({ name: r.label, color: resolveColor(r.color), side: "left" })),
    { name: "2026 Budget", color: resolveColor("var(--brand-700)"), side: "center" },
    ...spending.map((s) => ({ name: s.group, color: resolveColor(s.color), side: "right" })),
  ];

  const centerIndex = revenues.length;

  const links = [
    ...revenues.map((r, i) => ({
      source: i,
      target: centerIndex,
      value: r.amount,
      color: resolveColor(r.color),
    })),
    ...spending.map((s, i) => ({
      source: centerIndex,
      target: centerIndex + 1 + i,
      value: s.amount,
      color: resolveColor(s.color),
    })),
  ];

  const { sankey, sankeyLinkHorizontal } = d3;
  const layout = sankey()
    .nodeWidth(16)
    .nodePadding(14)
    .extent([
      [LEFT_MARGIN, TOP_MARGIN],
      [WIDTH - RIGHT_MARGIN, HEIGHT - 6],
    ]);

  const graph = layout({
    nodes: nodes.map((d) => ({ ...d })),
    links: links.map((d) => ({ ...d })),
  });

  const svg = d3.select("#sankey-chart").attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.selectAll("*").remove();

  // A flowier custom link path (d3-sankey's bundled sankeyLinkHorizontal
  // doesn't expose .curvature() in this build, so interpolate manually).
  const curvature = 0.58;
  const linkPath = (d) => {
    const x0 = d.source.x1;
    const x1 = d.target.x0;
    const xi = d3.interpolateNumber(x0, x1);
    const x2 = xi(curvature);
    const x3 = xi(1 - curvature);
    const y0 = d.y0;
    const y1 = d.y1;
    return `M${x0},${y0}C${x2},${y0} ${x3},${y1} ${x1},${y1}`;
  };
  const tooltip = d3.select("#sankey-tooltip");

  // Links
  const link = svg
    .append("g")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("class", "sankey-link")
    .attr("d", linkPath)
    .attr("stroke", (d) => d.color)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .style("stroke-linecap", "round")
    .on("mousemove", (event, d) => {
      const pct = ((d.value / total) * 100).toFixed(1);
      tooltip
        .style("opacity", 1)
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 24}px`)
        .html(`${d.source.name} &rarr; ${d.target.name}<br><strong>${dollars(d.value, 2)}</strong> (${pct}%)`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  // Draw-in animation: links sweep in from their source the first time the
  // chart scrolls into view.
  link.each(function () {
    const length = this.getTotalLength();
    d3.select(this)
      .attr("stroke-dasharray", `${length} ${length}`)
      .attr("stroke-dashoffset", length);
  });

  function animateLinks() {
    link
      .transition()
      .duration(1100)
      .delay((_, i) => i * 60)
      .ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0);
  }

  const sankeyWrap = svg.node().closest(".sankey-card");
  if (sankeyWrap && "IntersectionObserver" in window) {
    const sankeyObserver = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateLinks();
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    sankeyObserver.observe(sankeyWrap);
  } else {
    animateLinks();
  }

  // Nodes
  const node = svg
    .append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g")
    .attr("class", "sankey-node-group");

  function setActive(target) {
    node.classed("is-active", false);
    node.classed("is-dimmed", false);
    link.classed("is-dimmed", false);
    link.classed("is-highlighted", false);

    if (!target) return;

    d3.select(target.group).classed("is-active", true);
    node.filter((d) => d !== target.datum).classed("is-dimmed", true);
    link
      .classed("is-highlighted", (d) => d.source === target.datum || d.target === target.datum)
      .classed("is-dimmed", (d) => d.source !== target.datum && d.target !== target.datum);
  }

  node
    .append("rect")
    .attr("class", "sankey-node")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => Math.max(1, d.y1 - d.y0))
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", (d) => d.color)
    .on("mousemove", (event, d) => {
      const pct = ((d.value / total) * 100).toFixed(1);
      tooltip
        .style("opacity", 1)
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 24}px`)
        .html(`<strong>${d.name}</strong><br>${dollars(d.value, 2)} (${pct}%)`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0))
    .on("click", function (event, d) {
      const group = this.parentNode;
      const wasActive = d3.select(group).classed("is-active");
      if (!wasActive) {
        setActive({ group, datum: d });
        onNodeClick?.(d, total);
      } else {
        setActive(null);
        onNodeClick?.(null);
      }
    });

  // Labels: left-side nodes get labels to their left, right-side nodes get
  // labels to their right, center node gets a label above it.
  node
    .append("text")
    .attr("class", "sankey-label")
    .attr("x", (d) => {
      if (d.side === "left") return d.x0 - 10;
      if (d.side === "right") return d.x1 + 10;
      return (d.x0 + d.x1) / 2;
    })
    .attr("y", (d) => {
      if (d.side === "center") return d.y0 - 18;
      return (d.y0 + d.y1) / 2 - 4;
    })
    .attr("text-anchor", (d) => (d.side === "left" ? "end" : d.side === "right" ? "start" : "middle"))
    .style("font-weight", (d) => (d.side === "center" ? 700 : null))
    .text((d) => d.name);

  node
    .append("text")
    .attr("class", "sankey-label amount")
    .attr("x", (d) => {
      if (d.side === "left") return d.x0 - 10;
      if (d.side === "right") return d.x1 + 10;
      return (d.x0 + d.x1) / 2;
    })
    .attr("y", (d) => {
      if (d.side === "center") return d.y0 - 4;
      return (d.y0 + d.y1) / 2 + 12;
    })
    .attr("text-anchor", (d) => (d.side === "left" ? "end" : d.side === "right" ? "start" : "middle"))
    .text((d) => (d.side === "right" ? "" : dollars(d.value, 0)));

  // Legend (spending side)
  const legend = document.getElementById("sankey-legend");
  if (legend) {
    legend.innerHTML = spending
      .map(
        (s) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${resolveColor(s.color)}"></span>
          ${s.group}
        </span>`
      )
      .join("");
  }
}
