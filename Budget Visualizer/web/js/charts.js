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

/** Render a big donut chart of {label/group, amount, color} into svgId, with
 * a centered running total and a hover/click popover with a fuller
 * description (from getDetail) for each slice. The full breakdown (name,
 * amount, color swatch) lives in the linked cards/list rendered alongside
 * the chart. Arcs draw in the first time the chart scrolls into view. */
export function renderDonut(items, total, svgId, centerId, getDetail, opts = {}) {
  const { onSliceActivate } = opts;
  const width = 760;
  const height = 760;
  const cx = width / 2;
  const cy = height / 2;
  const outerR = 336;
  const innerR = 215;

  const svg = d3.select(`#${svgId}`).attr("viewBox", `0 0 ${width} ${height}`);
  svg.selectAll("*").remove();

  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  const pie = d3.pie().value((d) => d.amount).sort(null).padAngle(0.006);
  const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(2);
  const hoverArc = d3.arc().innerRadius(innerR).outerRadius(outerR + 8).cornerRadius(2);

  const arcsData = pie(items);
  const sum = items.reduce((s, d) => s + d.amount, 0);

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

  let pinnedIndex = null;

  /** Highlight/dim from outside (e.g. a linked card). Ignored while a slice is pinned. */
  function highlight(idx) {
    if (pinnedIndex !== null) return;
    setActive(idx == null ? null : [idx]);
  }

  /** Pin/unpin from outside (e.g. a linked card click/tap). */
  function togglePin(idx) {
    if (pinnedIndex === idx) {
      pinnedIndex = null;
      setActive(null);
      hidePopover();
      onSliceActivate?.(null);
    } else {
      pinnedIndex = idx;
      setActive([idx]);
      showPopover(arcsData[idx], paths.nodes()[idx]);
      onSliceActivate?.(idx);
    }
  }

  function setActive(indices) {
    const set = indices == null ? null : new Set(indices);
    paths
      .classed("is-dimmed", (d, i) => set && !set.has(i))
      .classed("is-highlighted", (d, i) => set && set.has(i))
      .each(function (d, i) {
        d3.select(this)
          .transition()
          .duration(160)
          .attr("d", set && set.has(i) ? hoverArc : arc);
      });
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
    .on("mouseenter", function (event, d, i) {
      if (pinnedIndex !== null) return;
      const idx = arcsData.indexOf(d);
      setActive([idx]);
      showPopover(d, this);
      onSliceActivate?.(idx);
    })
    .on("mouseleave", function () {
      if (pinnedIndex !== null) return;
      setActive(null);
      hidePopover();
      onSliceActivate?.(null);
    })
    .on("click", function (event, d) {
      const idx = arcsData.indexOf(d);
      if (pinnedIndex === idx) {
        pinnedIndex = null;
        setActive(null);
        hidePopover();
        onSliceActivate?.(null);
      } else {
        pinnedIndex = idx;
        setActive([idx]);
        showPopover(d, this);
        onSliceActivate?.(idx);
      }
    });

  // Center running total
  const centerEl = centerId ? document.getElementById(centerId) : null;

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

  function animateIn() {
    paths
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attrTween("d", function (d) {
        const interp = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
        return (t) => arc(interp(t));
      });

    animateNumber(centerEl, sum, 900);
  }

  // Collapse the ring back down and zero the running total, so the chart
  // re-plays its draw-in animation each time it scrolls back into view.
  function animateOut() {
    paths
      .transition()
      .duration(500)
      .ease(d3.easeCubicIn)
      .attrTween("d", function (d) {
        const interp = d3.interpolate(d, { startAngle: d.startAngle, endAngle: d.startAngle });
        return (t) => arc(interp(t));
      });

    animateNumber(centerEl, 0, 500);
  }

  const featureEl = svg.node().closest(".donut-feature");
  const wrap = featureEl || svg.node().closest(".donut-grid");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    paths.attr("d", arc);
    if (centerEl) centerEl.textContent = dollars(sum, 0);
  } else if (wrap && "IntersectionObserver" in window) {
    let visible = false;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !visible) {
            visible = true;
            animateIn();
          } else if (!entry.isIntersecting && visible) {
            visible = false;
            animateOut();
          }
        });
      },
      { threshold: 0.2 }
    );
    observer.observe(wrap);
  } else {
    animateIn();
  }

  return { highlight, togglePin };
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
  // doesn't expose .curvature() in this build, so interpolate manually),
  // but with square (butt) ends so flows meet the rectangular nodes flush.
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
    .style("stroke-linecap", "butt")
    .on("mousemove", (event, d) => {
      const pct = ((d.value / total) * 100).toFixed(1);
      tooltip
        .style("opacity", 1)
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 24}px`)
        .html(`${d.source.name} &rarr; ${d.target.name}<br><strong>${dollars(d.value, 2)}</strong> (${pct}%)`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0))
    .on("click", function (event, d) {
      const wasActive = d3.select(this).classed("is-active");
      if (!wasActive) {
        setActive({ type: "link", element: this, datum: d });
        onNodeClick?.(
          {
            name: `${d.source.name} → ${d.target.name}`,
            value: d.value,
            side: "link",
            source: d.source,
            target: d.target,
            color: d.color,
          },
          total
        );
      } else {
        setActive(null);
        onNodeClick?.(null);
      }
    });

  // Draw-in/out animation: links sweep in from their source when the chart
  // scrolls into view, and retreat again when it scrolls out, so the
  // animation re-plays each time the diagram comes back into view.
  link.each(function () {
    const length = this.getTotalLength();
    d3.select(this).attr("stroke-dasharray", `${length} ${length}`);
  });

  function animateLinksIn() {
    link
      .transition()
      .duration(1100)
      .delay((_, i) => i * 60)
      .ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0);
  }

  function animateLinksOut() {
    link
      .transition()
      .duration(600)
      .ease(d3.easeCubicIn)
      .attr("stroke-dashoffset", function () {
        return this.getTotalLength();
      });
  }

  const sankeyWrap = svg.node().closest(".sankey-card");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    link.attr("stroke-dashoffset", 0);
  } else if (sankeyWrap && "IntersectionObserver" in window) {
    link.attr("stroke-dashoffset", function () {
      return this.getTotalLength();
    });
    let visible = false;
    const sankeyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !visible) {
            visible = true;
            animateLinksIn();
          } else if (!entry.isIntersecting && visible) {
            visible = false;
            animateLinksOut();
          }
        });
      },
      { threshold: 0.2 }
    );
    sankeyObserver.observe(sankeyWrap);
  } else {
    link.attr("stroke-dashoffset", 0);
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
    link.classed("is-active", false);

    if (!target) return;

    if (target.type === "link") {
      d3.select(target.element).classed("is-active", true).classed("is-highlighted", true);
      link.filter((d) => d !== target.datum).classed("is-dimmed", true);
      node.classed("is-dimmed", (d) => d !== target.datum.source && d !== target.datum.target);
      return;
    }

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
        setActive({ type: "node", group, datum: d });
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
