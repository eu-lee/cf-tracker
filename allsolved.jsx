"use client";

import dynamic from "next/dynamic";
import React from "react";
import { PROBLEMS, TAG_GROUPS } from "./data.js";
import { fmtDate, rankOf, relDate } from "./lib.js";
import { DiffBadge, Latex, RankPill, Tag } from "./components.jsx";

const ProblemNoteEditor = dynamic(() => import("./ProblemNoteEditor.jsx"), {
  ssr: false,
  loading: () => (
    <div className="problem-note-editor-shell">
      <div className="problem-note-editor problem-note-editor-empty">Loading notes...</div>
    </div>
  ),
});

/* ============================================================
   All Solved tab — sortable/filterable table
   + full-screen problem detail view
   ============================================================ */

function effNote(p, notes) {
  return notes && notes[p.id] != null ? notes[p.id] : p.note;
}

function notePlainText(note) {
  if (!note) return "";
  if (typeof note === "string") return note;
  if (note.type === "tiptap") return note.text || "";
  return "";
}

function truncate(s, n) {
  const oneLine = s.replace(/\n+/g, " ");
  if (oneLine.length <= n) return oneLine;
  let cut = oneLine.slice(0, n);
  const dollars = (cut.match(/\$/g) || []).length;
  if (dollars % 2 !== 0) cut = cut.slice(0, cut.lastIndexOf("$"));
  return cut.trim() + "…";
}

/* ---------------- detail window ---------------- */
function ProblemWindow({ problem, notes, onClose, onSave }) {
  const note = effNote(problem, notes);

  const r = rankOf(problem.rating);

  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 100, overflowY: "auto",
      background: "var(--bg)", animation: "overlayIn .18s ease both",
    }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 2,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          maxWidth: 920, margin: "0 auto", padding: "14px 24px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            problem · {problem.contestId}{problem.index}
          </span>
          <button className="btn" onClick={onClose} aria-label="Close problem detail" style={{
            marginLeft: "auto", width: 36, height: 36, padding: 0,
            justifyContent: "center", fontSize: 22, lineHeight: 1,
          }}>×</button>
        </div>
      </div>
      <div style={{
        maxWidth: 920, margin: "0 auto", padding: "26px 24px 72px",
      }}>
        <div className="panel animate-in" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <DiffBadge rating={problem.rating} />
            <RankPill rating={problem.rating}>{r.name + " level"}</RankPill>
            <a href="#" onClick={(e) => e.preventDefault()} style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--accent-text)", textDecoration: "none" }}>
              open on codeforces ↗
            </a>
          </div>

          <h2 style={{ margin: "14px 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.2 }}>
            {problem.name}
          </h2>

          {/* tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {problem.tags.map((t) => <Tag key={t}>{(TAG_GROUPS[t] || t)}</Tag>)}
          </div>

          {/* meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, marginTop: 18,
            background: "var(--border-2)", border: "1px solid var(--border-2)", borderRadius: 10, overflow: "hidden" }}>
            {[
              ["Solved", fmtDate(problem.solvedAt)],
              ["Attempts", problem.attempts + (problem.attempts === 1 ? " (AC)" : "")],
              ["Time", problem.timeMin + " min"],
              ["Verdict", "Accepted"],
            ].map(([k, v], i) => (
              <div key={i} style={{ background: "var(--panel)", padding: "11px 13px" }}>
                <div className="label" style={{ fontSize: 10 }}>{k}</div>
                <div className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: i === 3 ? "var(--good)" : "var(--text)", marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* statement snippet */}
          <div style={{ marginTop: 18 }}>
            <span className="label">Statement</span>
            <Latex text={problem.statement} className="note-body"
              style={{ marginTop: 7, padding: "13px 15px", borderLeft: "2px solid var(--border)",
                background: "var(--panel-2)", borderRadius: "0 8px 8px 0", fontSize: 13.5, color: "var(--text-dim)" }} />
          </div>

          {/* notes */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="label">My notes</span>
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>autosaved · Markdown shortcuts · LaTeX enabled</span>
            </div>
            <ProblemNoteEditor value={note} onChange={(payload) => onSave(problem.id, payload)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- table ---------------- */
const COLS = [
  { key: "name", label: "Problem", sortable: true, align: "left" },
  { key: "rating", label: "Difficulty", sortable: true, align: "left" },
  { key: "tags", label: "Tags", sortable: false, align: "left" },
  { key: "attempts", label: "Tries", sortable: true, align: "right" },
  { key: "timeMin", label: "Time", sortable: true, align: "right" },
  { key: "solvedAt", label: "Solved", sortable: true, align: "right" },
];

function AllSolved({ notes, onOpen }) {
  const all = PROBLEMS;
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState({ key: "solvedAt", dir: -1 });
  const [activeTags, setActiveTags] = React.useState([]);

  const allTags = React.useMemo(() => {
    const m = {};
    all.forEach((p) => p.tags.forEach((t) => { m[t] = (m[t] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [all]);

  function toggleTag(t) {
    setActiveTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  const rows = React.useMemo(() => {
    let r = all.filter((p) => {
      const hay = (p.name + " " + p.contestId + p.index + " " + p.tags.join(" ") + " " + notePlainText(effNote(p, notes))).toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (activeTags.length && !activeTags.every((t) => p.tags.includes(t))) return false;
      return true;
    });
    const { key, dir } = sort;
    r = r.slice().sort((a, b) => {
      let va = a[key], vb = b[key];
      if (key === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return r;
  }, [all, q, sort, activeTags, notes]);

  function setSortKey(key) {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: key === "name" ? 1 : -1 });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* toolbar */}
      <div className="panel animate-in" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontSize: 14 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search problems, tags, notes…"
              style={{ width: "100%", padding: "9px 12px 9px 32px", background: "var(--panel-2)", border: "1px solid var(--border)",
                borderRadius: 9, color: "var(--text)", fontSize: 13.5, fontFamily: "var(--font-sans)", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <span className="label">Sort</span>
            <select className="btn" value={sort.key} onChange={(e) => setSortKey(e.target.value)} style={{ padding: "8px 11px" }}>
              <option value="solvedAt">Most recent</option>
              <option value="rating">Difficulty</option>
              <option value="attempts">Attempts</option>
              <option value="timeMin">Time taken</option>
              <option value="name">Name</option>
            </select>
            <button className="btn" onClick={() => setSort((s) => ({ ...s, dir: -s.dir }))} title="Toggle direction" style={{ padding: "8px 11px" }}>
              {sort.dir === -1 ? "↓" : "↑"}
            </button>
          </div>
        </div>
        {/* tag filter */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <span className="label" style={{ marginRight: 2 }}>Tags</span>
          {allTags.map((t) => (
            <Tag key={t} onClick={() => toggleTag(t)} active={activeTags.includes(t)}>{TAG_GROUPS[t] || t}</Tag>
          ))}
          {activeTags.length > 0 && (
            <button className="btn" onClick={() => setActiveTags([])} style={{ padding: "3px 10px", fontSize: 12 }}>clear</button>
          )}
        </div>
      </div>

      {/* count */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{rows.length}</span> problem{rows.length !== 1 ? "s" : ""}
          {activeTags.length > 0 && <span style={{ color: "var(--text-faint)" }}> · filtered</span>}
        </span>
        <span className="label">click a row for detail & notes</span>
      </div>

      {/* table */}
      <div className="panel animate-in" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {COLS.map((c) => (
                  <th key={c.key} onClick={c.sortable ? () => setSortKey(c.key) : undefined}
                    style={{ textAlign: c.align, padding: "12px 16px", cursor: c.sortable ? "pointer" : "default",
                      userSelect: "none", position: "sticky", top: 0, background: "var(--panel)", zIndex: 1 }}>
                    <span className="label" style={{ color: sort.key === c.key ? "var(--text)" : "var(--text-faint)" }}>
                      {c.label}{c.sortable && sort.key === c.key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const note = effNote(p, notes);
                const preview = notePlainText(note);
                return (
                  <tr key={p.id} onClick={() => onOpen(p)} className="prow"
                    style={{ borderBottom: "1px solid var(--border-2)", cursor: "pointer" }}>
                    <td style={{ padding: "13px 16px", maxWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>{p.contestId}{p.index}</span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                      </div>
                      {preview && (
                        <Latex className="note-preview" text={truncate(preview, 70)}
                          style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }} />
                      )}
                    </td>
                    <td style={{ padding: "13px 16px" }}><DiffBadge rating={p.rating} size="sm" /></td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 220 }}>
                        {p.tags.slice(0, 3).map((t) => (
                          <span key={t} className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)", whiteSpace: "nowrap" }}>#{(TAG_GROUPS[t] || t).toLowerCase()}</span>
                        ))}
                        {p.tags.length > 3 && <span className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>+{p.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="mono" style={{ padding: "13px 16px", textAlign: "right", fontSize: 13, color: p.attempts === 1 ? "var(--good)" : "var(--text-dim)" }}>{p.attempts}</td>
                    <td className="mono" style={{ padding: "13px 16px", textAlign: "right", fontSize: 13, color: "var(--text-dim)" }}>{p.timeMin}m</td>
                    <td className="mono" style={{ padding: "13px 16px", textAlign: "right", fontSize: 12.5, color: "var(--text-faint)" }}>{relDate(p.solvedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13.5 }}>
            No problems match your filters.
          </div>
        )}
      </div>
    </div>
  );
}

export { AllSolved, ProblemWindow };
