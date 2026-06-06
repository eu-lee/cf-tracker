/* ============================================================
   Shared UI atoms: badges, tag chips, LaTeX renderer
   ============================================================ */
"use client";

import { useEffect, useRef } from "react";
import { diffColor } from "./lib.js";

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

/* Numeric difficulty badge */
export function DiffBadge({ rating, size = "md" }) {
  const color = diffColor(rating);
  const pad = size === "sm" ? "1px 7px" : "2px 9px";
  const fs = size === "sm" ? 11.5 : 13;
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", padding: pad, borderRadius: 0,
      fontSize: fs, fontWeight: 600, color, background: "transparent",
      border: "none", letterSpacing: "-0.01em",
    }}>{rating}</span>
  );
}

/* Tag chip */
export function Tag({ children, onClick, active }) {
  function handleClick(e) {
    if (!onClick) return;
    e.stopPropagation();
    onClick(e);
  }
  return (
    <span className="chip chip-tag" onClick={handleClick} style={{
      cursor: onClick ? "pointer" : "default",
      background: active ? "var(--accent-dim)" : undefined,
      borderColor: active ? "var(--accent)" : undefined,
      color: active ? "var(--accent-text)" : undefined,
    }}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }
    } : undefined}
    >{children}</span>
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
