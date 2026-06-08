"use client";

import React from "react";
import { TAG_GROUPS } from "./data.js";
import {
  difficultyDistribution,
  diffColor,
  fmtDate,
  rankOf,
  radarTopics,
  ratingInRange,
  recent,
  relDate,
  topicStats,
  totals,
  typeDistribution,
  withTagOverrides,
  withinDays,
} from "./lib.js";
import { DiffBadge, Latex, Stat } from "./components.jsx";
import { DifficultyBars, RatingChart, SkillRadar, TypeDonut } from "./charts.jsx";

/* ============================================================
   Dashboard tab
   ============================================================ */

function ProfileHero({ user, problems }) {
  const r = rankOf(user.rating);
  const t = totals(problems);
  return (
    <div className="panel animate-in" style={{ padding: 22, display: "flex", flexWrap: "wrap", gap: 24,
      alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 260 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: r.color, letterSpacing: "-0.02em" }}>{user.handle}</span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          Member since {fmtDate(user.registered)} · contribution {user.contribution}
        </span>
      </div>
      <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
        <Stat label="Rating" value={user.rating} color={r.color} sub={"peak " + user.maxRating} />
        <Stat label="Solved" value={t.solved} sub={t.topics + " tags"} />
        <Stat label="Avg difficulty" value={t.avgRating} sub={"hardest " + t.maxSolved} />
        <Stat label="Avg tries" value={t.avgAttempts.toFixed(1)} sub={t.firstTry + " first-try"} />
      </div>
    </div>
  );
}

function EloByTopic({ stats }) {
  const sorted = stats.slice().sort((a, b) => b.score - a.score).slice(0, 9);
  const lo = 1100, hi = 1950;
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Elo by topic</span>
        <span className="label">estimated level</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {sorted.map((s) => {
          const pct = Math.max(6, Math.min(100, ((s.score - lo) / (hi - lo)) * 100));
          const c = diffColor(s.score);
          return (
            <div key={s.name} style={{ display: "grid", gridTemplateColumns: "118px 1fr 96px", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
              <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--border-2)" }}>
                <div style={{ width: pct + "%", height: "100%", background: c, borderRadius: 99,
                  transition: "width .6s cubic-bezier(.16,1,.3,1)" }} />
              </div>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: c, textAlign: "right", whiteSpace: "nowrap" }}>{s.score} <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>({s.count})</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeakPoints({ topics }) {
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Weak points</span>
        <span className="label">weakest first</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
        Lowest estimated level (weighted toward your hardest solves); untouched topics last.
      </p>
      {/* ~3 rows visible, scroll for the rest */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 210, overflowY: "auto", paddingRight: 4 }}>
        {topics.map((t, i) => {
          const untouched = !t.count;
          return (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
              background: "var(--panel-2)", border: "1px solid var(--border-2)", borderRadius: 9, opacity: untouched ? 0.6 : 1 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)", width: 16, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                  {untouched
                    ? "untouched"
                    : <>{t.count} solved · level <span className="mono" style={{ color: diffColor(t.score) }}>{t.score}</span></>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Cached full Codeforces problemset (fetched once per session, client-side).
let _problemset = null;
async function getProblemset() {
  if (_problemset) return _problemset;
  const res = await fetch("https://codeforces.com/api/problemset.problems", { cache: "no-store" });
  const json = await res.json();
  if (json.status !== "OK") throw new Error(json.comment || "Codeforces API error");
  _problemset = (json.result.problems || []).filter((p) => p.rating && p.contestId);
  return _problemset;
}

const GET_PROBLEM_SPECIALS = [
  { value: "__weak__", label: "Weak problem" },
  { value: "__random__", label: "Random" },
];

// ThemeCP-style picker: an unsolved problem near your level for a chosen theme.
function GetProblem({ problems, topics, weakestName, userRating }) {
  const [value, setValue] = React.useState("__weak__");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const pickerRef = React.useRef(null);

  const solvedIds = React.useMemo(() => new Set(problems.map((p) => `${p.contestId}${p.index}`)), [problems]);
  const scoreByName = React.useMemo(() => {
    const m = {};
    topics.forEach((t) => { m[t.name] = t.score; });
    return m;
  }, [topics]);

  const options = [...GET_PROBLEM_SPECIALS, ...topics.map((t) => ({ value: t.name, label: t.name }))];
  const selectedOption = options.find((o) => o.value === value) || options[0];
  const optionQuery = query.trim().toLowerCase();
  const visibleOptions = optionQuery
    ? options.filter((o) => o.label.toLowerCase().includes(optionQuery))
    : options;

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) closePicker();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") closePicker();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function chooseOption(nextValue) {
    setValue(nextValue);
    closePicker();
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const all = await getProblemset();
      let group = null, base;
      if (value === "__random__") { group = null; base = userRating || 1200; }
      else if (value === "__weak__") { group = weakestName || null; base = (group && scoreByName[group]) || userRating || 1200; }
      else { group = value; base = scoreByName[value] || userRating || 1200; }

      const target = Math.round(base / 100) * 100;
      const inGroup = (p) => !group || p.tags.some((rt) => (TAG_GROUPS[rt] || rt) === group);
      const unsolved = (p) => !solvedIds.has(`${p.contestId}${p.index}`);

      // at-level to slightly above; widen the ceiling until something matches
      let pick = null;
      for (const pad of [100, 250, 400, 800]) {
        const lo = Math.max(800, target - 100), hi = target + pad;
        const cands = all.filter((p) => inGroup(p) && unsolved(p) && p.rating >= lo && p.rating <= hi);
        if (cands.length) { pick = cands[Math.floor(Math.random() * cands.length)]; break; }
      }
      if (!pick) { setResult(null); setError("No unsolved problems found — try another theme."); }
      else setResult(pick);
    } catch (e) {
      setError(e.message || "Could not reach Codeforces.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Get problem</span>
        <span className="label">unsolved · near your level</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <div ref={pickerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <button
            type="button"
            className="btn"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => open ? closePicker() : setOpen(true)}
            style={{
              width: "100%", justifyContent: "space-between", padding: "8px 10px",
              fontSize: 13, background: "var(--bg)",
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedOption.label}
            </span>
            <span className="mono" aria-hidden="true" style={{ color: "var(--text-faint)", fontSize: 11 }}>
              {open ? "↑" : "↓"}
            </span>
          </button>
          {open && (
            <div className="recent-tag-menu" role="listbox" aria-label="Problem theme" style={{ left: 0, right: "auto", width: "min(320px, calc(100vw - 48px))" }}>
              <div className="recent-tag-menu-search">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search topics..."
                  aria-label="Search problem topics"
                />
              </div>
              <div className="recent-tag-menu-list">
                {visibleOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="recent-tag-menu-item"
                    role="option"
                    aria-selected={o.value === value}
                    onClick={() => chooseOption(o.value)}
                    style={{
                      color: o.value === value ? "var(--text)" : "var(--text-dim)",
                      background: o.value === value ? "var(--panel-hover)" : "transparent",
                    }}
                  >
                    {o.label}
                  </button>
                ))}
                {visibleOptions.length === 0 && (
                  <div className="recent-tag-menu-empty">No matching topics</div>
                )}
              </div>
            </div>
          )}
        </div>
        <button className="btn btn-accent" onClick={generate} disabled={loading}
          style={{ padding: "8px 16px", fontSize: 13, opacity: loading ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {loading ? "…" : "Get →"}
        </button>
      </div>

      {error && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--bad)" }}>{error}</div>}

      {result && (
        <a href={`https://codeforces.com/problemset/problem/${result.contestId}/${result.index}`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: "block", marginTop: 14, padding: "12px 14px", borderRadius: 9, textDecoration: "none",
            background: "var(--panel-2)", border: "1px solid var(--border-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <DiffBadge rating={result.rating} size="sm" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 7 }}>{result.contestId}{result.index}</span>
              {result.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--accent-text)" }}>open ↗</span>
          </div>
        </a>
      )}
    </div>
  );
}

function EditableTagList({ problem, onSaveTags }) {
  function removeTag(tag) {
    onSaveTags(problem.id, problem.tags.filter((t) => t !== tag));
  }

  return (
    <div className="recent-tags" onClick={(e) => e.stopPropagation()}>
      {problem.tags.map((t) => (
        <span key={t} className="recent-tag">
          <span>{TAG_GROUPS[t] || t}</span>
          <button type="button" aria-label={`Remove ${(TAG_GROUPS[t] || t)} tag`} onClick={() => removeTag(t)}>×</button>
        </span>
      ))}
    </div>
  );
}

function TagPicker({ problem, allTagOptions, onSaveTags }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
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

  function addTag(tag) {
    onSaveTags(problem.id, [...problem.tags, tag]);
    setOpen(false);
  }

  const availableTags = (allTagOptions ?? []).filter((t) => !problem.tags.includes(t));

  return (
    <div ref={rootRef} onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
      <button
        type="button"
        className="recent-tag-add"
        aria-label="Add tag"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >+</button>
      {open && (
        <div className="recent-tag-menu" role="listbox" aria-label="Codeforces tags">
          {availableTags.length > 0 ? availableTags.map((t) => (
            <button key={t} type="button" className="recent-tag-menu-item" onClick={() => addTag(t)}>
              {TAG_GROUPS[t] || t}
            </button>
          )) : (
            <div className="recent-tag-menu-empty">No more tags</div>
          )}
        </div>
      )}
    </div>
  );
}

function RecentTags({ problem, allTagOptions, onSaveTags }) {
  return (
    <div className="recent-tag-lane" onClick={(e) => e.stopPropagation()}>
      <EditableTagList problem={problem} onSaveTags={onSaveTags} />
      <div className="recent-tag-meta">
        <span className="recent-solved-age">{relDate(problem.solvedAt)}</span>
        <TagPicker problem={problem} allTagOptions={allTagOptions} onSaveTags={onSaveTags} />
      </div>
    </div>
  );
}

function RecentList({ problems, allTagOptions, onOpen, onViewAll, onSaveTags }) {
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Recently solved</span>
        <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={onViewAll}>
          View all <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {problems.map((p, i) => (
          <div key={p.id} onClick={() => onOpen(p)} style={{
            display: "grid", gridTemplateColumns: "auto minmax(0,1fr) minmax(320px, 0.9fr)", gap: 14, alignItems: "center",
            padding: "13px 8px", background: "transparent", border: "none",
            borderTop: i === 0 ? "none" : "1px solid var(--border-2)", cursor: "pointer", textAlign: "left", width: "100%",
            font: "inherit", color: "inherit",
          }} className="recent-row">
            <DiffBadge rating={p.rating} size="sm" />
            <div style={{ minWidth: 0 }}>
              <div style={{ minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12, marginRight: 7 }}>{p.contestId}{p.index}</span>
                  {p.name}
              </div>
              {notePlainText(p.note) && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 3, maxWidth: "100%" }}>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>notes:</span>
                  <Latex className="note-preview" text={truncate(notePlainText(p.note), 90)}
                    style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }} />
                </div>
              )}
            </div>
            <RecentTags problem={p} allTagOptions={allTagOptions} onSaveTags={onSaveTags} />
          </div>
        ))}
      </div>
    </div>
  );
}

function notePlainText(note) {
  if (!note) return "";
  if (typeof note === "string") return note;
  if (note.type === "tiptap") return note.text || "";
  return "";
}

function truncate(s, n) {
  if (!s || typeof s !== "string") return "";
  const oneLine = s.replace(/\n+/g, " ");
  if (oneLine.length <= n) return oneLine;
  // avoid cutting inside a $...$ — trim to last balanced $
  let cut = oneLine.slice(0, n);
  const dollars = (cut.match(/\$/g) || []).length;
  if (dollars % 2 !== 0) cut = cut.slice(0, cut.lastIndexOf("$"));
  return cut.trim() + "…";
}

const RANGES = [
  { key: "1W", label: "1W", days: 7, word: "week" },
  { key: "1M", label: "1M", days: 30, word: "month" },
  { key: "6M", label: "6M", days: 182, word: "6 months" },
  { key: "1Y", label: "1Y", days: 365, word: "year" },
  { key: "ALL", label: "All", days: null, word: "all time" },
];

function RangeControl({ value, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 9, padding: 3 }}>
      {RANGES.map((r) => {
        const active = value.key === r.key;
        return (
          <button key={r.key} onClick={() => onChange(r)} style={{
            padding: "5px 12px", fontSize: 12.5, fontWeight: 500, border: "none", borderRadius: 6,
            cursor: "pointer", fontFamily: "inherit",
            background: active ? "var(--panel)" : "transparent",
            color: active ? "var(--text)" : "var(--text-faint)",
            boxShadow: active ? "var(--shadow)" : "none", transition: "color .15s",
          }}>{r.label}</button>
        );
      })}
    </div>
  );
}

function Empty({ msg, h = 150 }) {
  return (
    <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      color: "var(--text-faint)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 10,
      background: "var(--panel-2)", padding: "0 16px" }}>{msg}</div>
  );
}

function RadarFilterDropdown({ allTopics, filter, onChange }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // mode: "solved" (null) · "all" ("all") · "custom" (array of names)
  const mode = filter == null ? "solved" : filter === "all" ? "all" : "custom";
  const selected =
    mode === "solved" ? new Set(allTopics.filter((t) => t.count > 0).map((t) => t.name))
    : mode === "all" ? new Set(allTopics.map((t) => t.name))
    : new Set(filter);

  const label =
    mode === "solved" ? "Solved topics"
    : mode === "all" ? "All topics"
    : `Custom · ${selected.size}`;

  function toggle(name) {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    onChange(next.size === allTopics.length ? "all" : [...next]);
  }

  const presets = [
    { key: "solved", label: "Solved topics", value: null },
    { key: "all", label: "All topics", value: "all" },
  ];

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOpen((v) => !v)}
        style={{ padding: "5px 10px", fontSize: 12 }}>
        {label} ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "var(--shadow-pop)", padding: "8px 4px", minWidth: 180, maxHeight: 280,
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 1,
        }}>
          <div style={{ display: "flex", gap: 6, padding: "2px 8px 8px", borderBottom: "1px solid var(--border-2)", marginBottom: 4 }}>
            {presets.map((p) => (
              <button key={p.key} className="btn" onClick={() => onChange(p.value)}
                style={{
                  fontSize: 11, padding: "3px 8px", flex: 1,
                  borderColor: mode === p.key ? "var(--accent)" : undefined,
                  color: mode === p.key ? "var(--accent)" : undefined,
                }}>{p.label}</button>
            ))}
          </div>
          {allTopics.map((t) => (
            <label key={t.name} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
              cursor: "pointer", borderRadius: 6, fontSize: 12.5,
              color: selected.has(t.name) ? "var(--text)" : "var(--text-faint)",
              background: selected.has(t.name) ? "transparent" : "transparent",
            }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--panel-2)"}
               onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <input type="checkbox" checked={selected.has(t.name)} onChange={() => toggle(t.name)}
                style={{ accentColor: "var(--accent)", width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard({ user, ratingHistory = [], problems = [], tagOverrides = {}, allTagOptions = [], radarFilter = null, onSaveRadarFilter, onSaveTags, onOpenProblem, onGoAllSolved }) {
  const [range, setRange] = React.useState(RANGES[4]); // All
  const [showRatingRadar, setShowRatingRadar] = React.useState(false);

  const allProblems = withTagOverrides(problems, tagOverrides);
  const windowed = withinDays(allProblems, range.days);
  const hasData = windowed.length > 0;
  const { topics: radarTopicList, lo: radarLo, hi: radarHi } = radarTopics(windowed);
  // Full topic universe = every canonical tag group, with solved stats merged in
  // (unsolved topics get count/skill 0 so they can still render on the radar).
  const radarUniverse = (() => {
    const byName = new Map(radarTopicList.map((t) => [t.name, t]));
    const names = [...new Set(Object.values(TAG_GROUPS))];
    for (const t of radarTopicList) if (!names.includes(t.name)) names.push(t.name);
    return names
      .map((name) => byName.get(name) || { name, count: 0, max: 0, avg: 0, score: 0, skill: 0 })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  })();
  // radarFilter: null = solved topics, "all" = every topic, array = custom subset
  const radarMode = radarFilter == null ? "solved" : radarFilter === "all" ? "all" : "custom";
  const filteredRadarTopics =
    radarMode === "solved" ? radarTopicList
    : radarMode === "all" ? radarUniverse
    : radarUniverse.filter((t) => radarFilter.includes(t.name));
  const diff = difficultyDistribution(windowed);
  const types = typeDistribution(7, windowed);
  const stats = topicStats(windowed);
  // weak-points list: solved topics weakest-first, then untouched topics
  const weakSolved = radarUniverse.filter((t) => t.count > 0).slice().sort((a, b) => a.score - b.score);
  const untouchedTopics = radarUniverse.filter((t) => t.count === 0);
  const weakList = [...weakSolved, ...untouchedTopics];
  const weakestName = weakSolved[0]?.name ?? null;
  const recentList = recent(5, allProblems);
  const history = ratingInRange(ratingHistory, range.days);
  const periodDelta = history.length >= 2 ? history[history.length - 1].rating - history[0].rating : null;
  const radarHiWithRating = user?.rating
    ? Math.max(radarHi, Math.ceil((user.rating + 100) / 100) * 100)
    : radarHi;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ProfileHero user={user} problems={allProblems} />

      {/* range toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "2px 2px 0" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{windowed.length}</span> problem{windowed.length !== 1 ? "s" : ""} solved
          <span style={{ color: "var(--text-faint)" }}> · {range.days ? "last " + range.word : "all time"}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="label">Range</span>
          <RangeControl value={range} onChange={setRange} />
        </div>
      </div>

      {/* rating chart */}
      <div className="panel animate-in" style={{ padding: 20 }}>
        <div className="card-head">
          <span className="card-title">Rating</span>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
            {periodDelta != null && (
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: periodDelta >= 0 ? "var(--good)" : "var(--bad)" }}>
                {periodDelta >= 0 ? "+" : ""}{periodDelta} this period
              </span>
            )}
            <span className="mono" style={{ fontSize: 13, color: "var(--text-faint)" }}>peak {user.maxRating}</span>
            <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: rankOf(user.rating).color }}>{user.rating}</span>
          </div>
        </div>
        {history.length >= 1
          ? <RatingChart history={history} />
          : <Empty msg="No rated contests in this period — try a wider range." h={180} />}
      </div>

      {/* skills row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }} className="grid-2">
        <div className="panel animate-in" style={{ padding: 20 }}>
          <div className="card-head">
            <span className="card-title">Skill by topic</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="label">est. level</span>
              {hasData && user?.rating > 0 && (
                <button
                  type="button"
                  className="btn"
                  aria-pressed={showRatingRadar}
                  onClick={() => setShowRatingRadar((v) => !v)}
                  style={{ padding: "5px 9px", fontSize: 12 }}
                >
                  {showRatingRadar ? "Hide rating" : "Show rating"}
                </button>
              )}
              {hasData && (
                <RadarFilterDropdown
                  allTopics={radarUniverse}
                  filter={radarFilter}
                  onChange={onSaveRadarFilter}
                />
              )}
            </div>
          </div>
          {hasData
            ? filteredRadarTopics.length >= 3
              ? <SkillRadar
                  topics={filteredRadarTopics}
                  lo={radarLo}
                  hi={radarHiWithRating}
                  rating={user?.rating || 0}
                  showRating={showRatingRadar}
                />
              : <Empty msg="Select at least 3 topics to render the radar." h={300} />
            : <Empty msg="Nothing solved in this period." h={300} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="panel animate-in" style={{ padding: 20 }}>
            <div className="card-head"><span className="card-title">Solved by difficulty</span></div>
            {hasData ? <DifficultyBars data={diff} /> : <Empty msg="Nothing solved in this period." />}
          </div>
          <div className="panel animate-in" style={{ padding: 20 }}>
            <div className="card-head"><span className="card-title">Problem types</span></div>
            {hasData ? <TypeDonut data={types} /> : <Empty msg="Nothing solved in this period." />}
          </div>
        </div>
      </div>

      {/* weak points + get problem | elo */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="grid-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {hasData
            ? <WeakPoints topics={weakList} />
            : <div className="panel animate-in" style={{ padding: 20 }}>
                <div className="card-head"><span className="card-title">Weak points</span></div>
                <Empty msg="Nothing solved in this period." />
              </div>}
          <GetProblem problems={allProblems} topics={radarUniverse} weakestName={weakestName} userRating={user?.rating} />
        </div>
        {hasData
          ? <EloByTopic stats={stats} />
          : <div className="panel animate-in" style={{ padding: 20 }}>
              <div className="card-head"><span className="card-title">Elo by topic</span><span className="label">estimated level</span></div>
              <Empty msg="Nothing solved in this period." />
            </div>}
      </div>

      <RecentList problems={recentList} allTagOptions={allTagOptions} onOpen={onOpenProblem} onViewAll={onGoAllSolved} onSaveTags={onSaveTags} />
    </div>
  );
}

export { Dashboard };
