"use client";

import dynamic from "next/dynamic";
import React from "react";
import { TAG_GROUPS } from "./data.js";
import { fmtDate, relDate, withTagOverrides } from "./lib.js";
import { DiffBadge, Latex, Tag } from "./components.jsx";

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

function TagEditor({ problemId, tags, allTagOptions, onSaveTags }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) { setQuery(""); return; }
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function removeTag(tag) {
    onSaveTags(problemId, tags.filter((t) => t !== tag));
  }

  function addTag(tag) {
    onSaveTags(problemId, [...tags, tag]);
    setOpen(false);
  }

  const available = (allTagOptions ?? []).filter((t) => !tags.includes(t));
  const q = query.trim().toLowerCase();
  const availableTags = q
    ? available.filter((t) => ((TAG_GROUPS[t] || t).toLowerCase().includes(q) || t.toLowerCase().includes(q)))
    : available;
  // allow creating a free-form tag when the query matches nothing existing
  const customTag = query.trim();
  const showCustom = customTag && !tags.includes(customTag)
    && !available.some((t) => (TAG_GROUPS[t] || t).toLowerCase() === q || t.toLowerCase() === q);

  function onSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (availableTags.length > 0) addTag(availableTags[0]);
    else if (showCustom) addTag(customTag);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
          {tags.map((t) => (
            <Tag key={t}>
              <span>{TAG_GROUPS[t] || t}</span>
              <button
                type="button"
                aria-label={`Remove ${(TAG_GROUPS[t] || t)} tag`}
                onClick={(e) => { e.stopPropagation(); removeTag(t); }}
                style={{
                  width: 16, height: 16, border: "none", background: "transparent", color: "inherit",
                  padding: 0, cursor: "pointer", lineHeight: 1, fontSize: 14,
                }}
              >×</button>
            </Tag>
          ))}
        </div>
        <div style={{ position: "relative", justifySelf: "end" }}>
          <button
            type="button"
            className="btn"
            aria-label="Add tag"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{ height: 24, padding: "2px 10px", fontSize: 12 }}
          >+</button>
        </div>
      </div>
      {open && (
        <div className="recent-tag-menu" role="listbox" aria-label="Codeforces tags" style={{ right: 0, left: "auto", top: "calc(100% + 6px)" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--panel)", paddingBottom: 4, marginBottom: 2 }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search tags…"
              aria-label="Search tags"
              style={{
                width: "100%", boxSizing: "border-box", padding: "6px 9px", fontSize: 12.5,
                borderRadius: 6, border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--text)", fontFamily: "inherit",
              }}
            />
          </div>
          {availableTags.map((t) => (
            <button key={t} type="button" className="recent-tag-menu-item" onClick={() => addTag(t)}>
              {TAG_GROUPS[t] || t}
            </button>
          ))}
          {showCustom && (
            <button type="button" className="recent-tag-menu-item" onClick={() => addTag(customTag)}>
              + Add “{customTag}”
            </button>
          )}
          {availableTags.length === 0 && !showCustom && (
            <div className="recent-tag-menu-empty">{q ? "No matching tags" : "No more tags"}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- detail window ---------------- */
function ProblemWindow({ problem, notes, tagOverrides = {}, allTagOptions, onClose, onSave, onSaveTags }) {
  const effectiveProblem = { ...problem, tags: tagOverrides[problem.id] || problem.tags };
  const note = effNote(problem, notes);

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
            <DiffBadge rating={effectiveProblem.rating} />
            <a
              href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--accent-text)", textDecoration: "none" }}
            >
              open on codeforces ↗
            </a>
          </div>

          <h2 style={{ margin: "14px 0 4px", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", lineHeight: 1.2 }}>
            {effectiveProblem.name}
          </h2>

          {/* tags */}
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>Tags</div>
            <TagEditor problemId={problem.id} tags={effectiveProblem.tags} allTagOptions={allTagOptions} onSaveTags={onSaveTags} />
          </div>

          {/* meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, marginTop: 18,
            background: "var(--border-2)", border: "1px solid var(--border-2)", borderRadius: 10, overflow: "hidden" }}>
            {[
              ["Solved", fmtDate(problem.solvedAt)],
              ["Attempts", problem.attempts + (problem.attempts === 1 ? " (AC)" : "")],
            ].map(([k, v], i) => (
              <div key={i} style={{ background: "var(--panel)", padding: "11px 13px" }}>
                <div className="label" style={{ fontSize: 10 }}>{k}</div>
                <div className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>{v}</div>
              </div>
            ))}
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
  { key: "solvedAt", label: "Solved", sortable: true, align: "right" },
];

function AllSolved({ problems = [], notes, tagOverrides = {}, allTagOptions = [], onOpen }) {
  const all = React.useMemo(() => withTagOverrides(problems, tagOverrides), [problems, tagOverrides]);
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
          <button
            className="btn"
            onClick={() => setActiveTags([])}
            style={{
              padding: "3px 10px", fontSize: 12,
              visibility: activeTags.length > 0 ? "visible" : "hidden",
              pointerEvents: activeTags.length > 0 ? "auto" : "none",
            }}
            aria-hidden={activeTags.length === 0}
          >clear</button>
        </div>
      </div>

      {/* count */}
      <div style={{ padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{rows.length}</span> problem{rows.length !== 1 ? "s" : ""}
          {activeTags.length > 0 && <span style={{ color: "var(--text-faint)" }}> · filtered</span>}
        </span>
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
                        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 3, maxWidth: 300 }}>
                          <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>notes:</span>
                          <Latex className="note-preview" text={truncate(preview, 70)}
                            style={{ fontSize: 11.5, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px" }}><DiffBadge rating={p.rating} size="sm" /></td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 220 }}>
                        {p.tags.slice(0, 3).map((t) => (
                          <Tag key={t} onClick={() => toggleTag(t)} active={activeTags.includes(t)}>
                            {(TAG_GROUPS[t] || t)}
                          </Tag>
                        ))}
                        {p.tags.length > 3 && <span className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>+{p.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td className="mono" style={{ padding: "13px 16px", textAlign: "right", fontSize: 13, color: p.attempts === 1 ? "var(--good)" : "var(--text-dim)" }}>{p.attempts}</td>
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
