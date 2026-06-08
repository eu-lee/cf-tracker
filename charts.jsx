/* ============================================================
   SVG charts — rating line, skills radar, difficulty bars, donut
   ============================================================ */
"use client";

import { useRef, useState } from "react";
import { fmtDate, rankOf } from "./lib.js";

/* ---------------- Rating line chart ---------------- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortDateTs(ts) {
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

export function RatingChart({ history }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const W = 760, H = 300, padL = 8, padR = 8, padT = 18, padB = 44;
  const ratings = history.map((h) => h.rating);
  const minR = Math.min(...ratings), maxR = Math.max(...ratings);
  const cur = ratings[ratings.length - 1];
  const lo = Math.floor((minR - 70) / 100) * 100;
  // top of the chart = current rating + 500 of headroom (guard against a past peak)
  const hi = Math.ceil(Math.max(cur + 500, maxR) / 100) * 100;
  // x is proportional to actual time, so multi-year gaps read wider than day gaps
  const times = history.map((h) => Date.parse(h.date));
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const x = (i) => (history.length <= 1 || tMax === tMin)
    ? W / 2
    : padL + ((times[i] - tMin) / (tMax - tMin)) * (W - padL - padR);
  const y = (r) => padT + (1 - (r - lo) / (hi - lo)) * (H - padT - padB);

  const bands = [
    { lo: 0, hi: 1199, color: "var(--cf-gray)" },
    { lo: 1200, hi: 1399, color: "var(--cf-green)" },
    { lo: 1400, hi: 1599, color: "var(--cf-cyan)" },
    { lo: 1600, hi: 1899, color: "var(--cf-blue)" },
    { lo: 1900, hi: 2099, color: "var(--cf-violet)" },
  ].filter((b) => b.hi >= lo && b.lo <= hi);

  const linePath = history.map((h, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(h.rating).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(history.length - 1).toFixed(1)},${y(lo)} L${x(0).toFixed(1)},${y(lo)} Z`;

  // y-axis labels: only the rank thresholds (band boundaries) within view,
  // dropping any that would collide with the current-rating marker
  const rankLines = bands.map((b) => b.lo).filter((r) => r > lo && r < hi && Math.abs(r - cur) > 40);

  // x-axis ticks evenly spaced across the *time* span (not per-contest), so
  // labels stay readable even when contests cluster together
  const maxLabels = 6;
  const xTicks = (tMax === tMin)
    ? [{ px: W / 2, ts: tMin }]
    : Array.from({ length: maxLabels }, (_, k) => {
        const frac = k / (maxLabels - 1);
        return { px: padL + frac * (W - padL - padR), ts: tMin + frac * (tMax - tMin) };
      });

  function handleMove(e) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < history.length; i++) {
      const d = Math.abs(x(i) - svgX);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bands.map((b, i) => {
          const yTop = y(Math.min(b.hi, hi));
          const yBot = y(Math.max(b.lo, lo));
          return <rect key={i} x={padL} y={yTop} width={W - padL - padR} height={Math.max(0, yBot - yTop)}
            fill={b.color} opacity="0.16" />;
        })}
        {rankLines.map((r) => (
          <text key={r} x={W - padR} y={y(r) - 4} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)"
            fill="var(--text-faint)">{r}</text>
        ))}
        {/* current rating — highlighted */}
        <text x={W - padR} y={y(cur) - 4} textAnchor="end" fontSize="11" fontWeight="600"
          fontFamily="var(--font-mono)" fill={rankOf(cur).color}>{cur}</text>
        {/* x-axis date labels — anchor the edges inward so they don't clip */}
        {xTicks.map((t, k) => {
          const anchor = k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle";
          return (
            <g key={k}>
              <line x1={t.px} y1={H - padB + 4} x2={t.px} y2={H - padB + 10}
                stroke="var(--border)" strokeWidth="1" />
              <text x={t.px} y={H - padB + 22} textAnchor={anchor} fontSize="10"
                fontFamily="var(--font-mono)" fill="var(--text-faint)">{shortDateTs(t.ts)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#ratingFill)" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.2"
          strokeLinejoin="round" strokeLinecap="round" />
        {history.map((h, i) => {
          const c = rankOf(h.rating).color;
          const active = hover === i;
          return (
            <circle key={i} cx={x(i)} cy={y(h.rating)} r={active ? 5.5 : 3.4}
              fill="var(--panel)" stroke={c} strokeWidth="2.2"
              style={{ transition: "r .12s" }} />
          );
        })}
        {/* single overlay: hover snaps to the nearest point by x (split at midpoints) */}
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
          fill="transparent" onMouseMove={handleMove} style={{ cursor: "crosshair" }} />
        {hover != null && (
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="var(--text-faint)"
            strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
      {hover != null && (
        <Tooltip xPct={(x(hover) / W) * 100}>
          <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 12.5 }}>{history[hover].c}</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
            <span className="mono" style={{ color: rankOf(history[hover].rating).color, fontWeight: 600, fontSize: 14 }}>
              {history[hover].rating}
            </span>
            <span className="mono" style={{ color: history[hover].delta >= 0 ? "var(--good)" : "var(--bad)" }}>
              {history[hover].delta >= 0 ? "+" : ""}{history[hover].delta}
            </span>
            <span style={{ color: "var(--text-faint)" }}>{fmtDate(history[hover].date)}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

export function Tooltip({ children, xPct }) {
  const left = Math.max(6, Math.min(94, xPct));
  return (
    <div style={{
      position: "absolute", top: 4, left: left + "%", transform: "translateX(-50%)",
      background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 11px", boxShadow: "var(--shadow-pop)", pointerEvents: "none",
      whiteSpace: "nowrap", zIndex: 5,
    }}>
      {children}
    </div>
  );
}

/* ---------------- Skills radar ---------------- */
export function SkillRadar({ topics, lo = 800, hi = 2000 }) {
  const [hover, setHover] = useState(null);
  const size = 320, cx = size / 2, cy = size / 2 + 6, R = 200;
  const n = topics.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + Math.cos(angle(i)) * R * r, cy + Math.sin(angle(i)) * R * r];
  const rings = [0.25, 0.5, 0.75, 1];

  const poly = topics.map((t, i) => pt(i, Math.max(0.05, t.skill)).map((v) => v.toFixed(1)).join(",")).join(" ");

  // ring difficulty labels sit just right of the top spoke (cx, cy - R*frac)
  const ringLabels = rings.map((r) => ({
    r,
    val: Math.round(lo + r * (hi - lo)),
    x: cx + 5,
    y: cy - R * r,
  }));

  return (
    <svg viewBox="-172 -90 664 516" style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
      {/* rings */}
      {rings.map((r, ri) => (
        <polygon key={ri}
          points={topics.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ")}
          fill="none" stroke="var(--border)" strokeWidth="1" opacity={ri === rings.length - 1 ? 0.9 : 0.5} />
      ))}
      {/* spokes */}
      {topics.map((_, i) => {
        const [px, py] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke="var(--border-2)" strokeWidth="1" />;
      })}
      {/* skill polygon */}
      <polygon points={poly} fill="var(--accent)" fillOpacity="0.16" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {/* vertices */}
      {topics.map((t, i) => {
        const [px, py] = pt(i, Math.max(0.05, t.skill));
        return <circle key={i} cx={px} cy={py} r={hover === i ? 6 : 3.8} fill="var(--panel)"
          stroke="var(--accent)" strokeWidth="2"
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} />;
      })}
      {/* ring difficulty labels */}
      {ringLabels.map(({ r, val, x, y }) => (
        <text key={r} x={x} y={y} dominantBaseline="middle" fontSize="9.5"
          fontFamily="var(--font-mono)" fill="var(--text-faint)" opacity="0.8">{val}</text>
      ))}
      {/* topic labels */}
      {topics.map((t, i) => {
        const [lx, ly] = pt(i, 1.15);
        const a = angle(i);
        const anchor = Math.abs(Math.cos(a)) < 0.25 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={i}>
            <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="12.5"
              fontWeight={hover === i ? 700 : 500}
              fill={hover === i ? "var(--text)" : "var(--text-dim)"}>{t.name}</text>
            <text x={lx} y={ly + 15} textAnchor={anchor} dominantBaseline="middle" fontSize="11"
              fontFamily="var(--font-mono)" fill="var(--text-faint)">avg {t.avg || "—"}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- Difficulty bars ---------------- */
export function DifficultyBars({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 168, padding: "8px 2px 0" }}>
      {data.map((d, i) => {
        const h = (d.count / max) * 130;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{d.count}</span>
            <div title={`${d.count} solved`} style={{
              width: "100%", maxWidth: 46, height: Math.max(4, h), background: d.color, opacity: 0.85,
              borderRadius: "5px 5px 2px 2px", transition: "height .5s cubic-bezier(.16,1,.3,1)",
            }} />
            <span className="mono" style={{ fontSize: 9.5, color: "var(--text-faint)", textAlign: "center", lineHeight: 1.2 }}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Type donut ---------------- */
export function TypeDonut({ data }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  const size = 180, cx = size / 2, cy = size / 2, rOuter = 80, rInner = 52;
  const arcs = data.reduce((state, d) => {
    const nextAcc = state.acc + d.count;
    return {
      acc: nextAcc,
      items: [
        ...state.items,
        { ...d, start: state.acc / total, end: nextAcc / total },
      ],
    };
  }, { acc: 0, items: [] }).items;
  const arcPath = (start, end, ro, ri) => {
    const a0 = start * Math.PI * 2 - Math.PI / 2, a1 = end * Math.PI * 2 - Math.PI / 2;
    const large = end - start > 0.5 ? 1 : 0;
    const x0 = cx + Math.cos(a0) * ro, y0 = cy + Math.sin(a0) * ro;
    const x1 = cx + Math.cos(a1) * ro, y1 = cy + Math.sin(a1) * ro;
    const x2 = cx + Math.cos(a1) * ri, y2 = cy + Math.sin(a1) * ri;
    const x3 = cx + Math.cos(a0) * ri, y3 = cy + Math.sin(a0) * ri;
    const f = (n) => Object.is(n, -0) ? "0" : n.toFixed(4);
    return `M${f(x0)},${f(y0)} A${f(ro)},${f(ro)} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${f(ri)},${f(ri)} 0 ${large} 0 ${f(x3)},${f(y3)} Z`;
  };
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 168, height: 168, flexShrink: 0 }}>
        {arcs.map((d, i) => {
          const active = hover === i;
          const ro = active ? rOuter + 5 : rOuter;
          return <path key={i} d={arcPath(d.start, d.end, ro, rInner)} fill={d.color}
            opacity={hover == null || active ? 0.92 : 0.4}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ transition: "opacity .15s, d .15s", cursor: "pointer" }} />;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="26" fontWeight="700" fontFamily="var(--font-mono)" fill="var(--text)">
          {hover != null ? arcs[hover].count : total}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {hover != null ? "in tag" : "tag uses"}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 130 }}>
        {arcs.map((d, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "default",
              opacity: hover == null || hover === i ? 1 : 0.5, transition: "opacity .15s" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: "var(--text-dim)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
            <span className="mono" style={{ color: "var(--text-faint)", fontSize: 11.5 }}>{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
