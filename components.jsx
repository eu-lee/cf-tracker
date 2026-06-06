/* ============================================================
   Shared UI atoms: badges, tag chips, LaTeX renderer
   ============================================================ */
"use client";

import { useEffect, useRef } from "react";
import { diffColor, rankOf } from "./lib.js";

/* Render text containing $inline$ / $$display$$ LaTeX via KaTeX auto-render */
export function Latex({ text, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text || "";
    if (typeof window !== "undefined" && window.renderMathInElement) {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { /* leave plain text */ }
    }
  }, [text]);
  // preserve line breaks
  return <div ref={ref} className={className} style={{ whiteSpace: "pre-wrap", ...style }} />;
}

/* Rank/difficulty badge — colored rating pill */
export function DiffBadge({ rating, size = "md" }) {
  const color = diffColor(rating);
  const pad = size === "sm" ? "1px 7px" : "2px 9px";
  const fs = size === "sm" ? 11.5 : 13;
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", padding: pad, borderRadius: 6,
      fontSize: fs, fontWeight: 600, color: color, background: "color-mix(in srgb, " + cmix(color) + " 13%, transparent)",
      border: "1px solid color-mix(in srgb, " + cmix(color) + " 28%, transparent)", letterSpacing: "-0.01em",
    }}>{rating}</span>
  );
}
// color-mix needs a real color; css vars work in modern browsers directly
function cmix(c) { return c; }

/* Rank name pill (e.g. Expert) */
export function RankPill({ rating, children }) {
  const r = rankOf(rating);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
      color: r.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: r.color }} />
      {children || r.name}
    </span>
  );
}

/* Tag chip */
export function Tag({ children, onClick, active }) {
  return (
    <span className="chip chip-tag" onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default",
      background: active ? "var(--accent-dim)" : undefined,
      borderColor: active ? "var(--accent)" : undefined,
      color: active ? "var(--accent-text)" : undefined,
    }}>{children}</span>
  );
}

/* Stat block */
export function Stat({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="label">{label}</span>
      <span className="mono" style={{ fontSize: 24, fontWeight: 600, color: color || "var(--text)", lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{sub}</span>}
    </div>
  );
}
