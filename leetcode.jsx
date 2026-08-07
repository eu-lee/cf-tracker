"use client";

import React from "react";
import { LC_TAG_GROUPS } from "./data.js";
import { leetcodeDifficultyColor, leetcodeDifficultyWeight } from "./lib/leetcode.js";
import { fmtDate, recent, typeDistribution, withTagOverrides } from "./lib.js";
import { DifficultyBadge, Stat, Tag } from "./components.jsx";
import { DifficultyBars, SkillRadar, TypeDonut } from "./charts.jsx";

const RANGES = [
  { key: "1M", label: "1M", days: 30, word: "month" },
  { key: "6M", label: "6M", days: 182, word: "6 months" },
  { key: "1Y", label: "1Y", days: 365, word: "year" },
  { key: "ALL", label: "All", days: null, word: "all time" },
];

function dateMs(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function withinDays(problems, days) {
  if (!days) return problems.slice();
  const cutoff = Date.now() - days * 86400000;
  return problems.filter((p) => dateMs(p.solvedAt) >= cutoff);
}

function weightedScore(values, decay = 0.85) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => b - a);
  let num = 0, den = 0, w = 1;
  for (const v of sorted) {
    num += v * w;
    den += w;
    w *= decay;
  }
  return num / den;
}

function lcDifficultyDistribution(problems) {
  return ["Easy", "Medium", "Hard"].map((difficulty) => ({
    label: difficulty,
    count: problems.filter((p) => p.lcDifficulty === difficulty).length,
    color: leetcodeDifficultyColor(difficulty),
  }));
}

function lcTopicStats(problems) {
  const map = new Map();
  for (const p of problems) {
    const weight = leetcodeDifficultyWeight(p.lcDifficulty);
    for (const tag of p.tags) {
      const name = LC_TAG_GROUPS[tag] || tag;
      if (!map.has(name)) {
        map.set(name, { name, raw: tag, count: 0, easy: 0, medium: 0, hard: 0, weights: [], latest: "" });
      }
      const row = map.get(name);
      row.count += 1;
      if (p.lcDifficulty === "Easy") row.easy += 1;
      if (p.lcDifficulty === "Medium") row.medium += 1;
      if (p.lcDifficulty === "Hard") row.hard += 1;
      if (weight != null) row.weights.push(weight);
      if (p.solvedAt > row.latest) row.latest = p.solvedAt;
    }
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      ratedCount: row.weights.length,
      avg: row.weights.length ? row.weights.reduce((s, v) => s + v, 0) / row.weights.length : 0,
      max: row.weights.length ? Math.max(...row.weights) : 0,
      score: weightedScore(row.weights),
    }))
    .sort((a, b) => b.count - a.count || b.score - a.score || a.name.localeCompare(b.name));
}

function formatScore(score) {
  return score ? score.toFixed(2) : "—";
}

function Empty({ msg, h = 150 }) {
  return (
    <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      color: "var(--text-faint)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 10,
      background: "var(--panel-2)", padding: "0 16px" }}>{msg}</div>
  );
}

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
            boxShadow: active ? "var(--shadow)" : "none",
          }}>{r.label}</button>
        );
      })}
    </div>
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
              background: "transparent",
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

function LeetcodeUsernameForm({ current, onSaved, onSync }) {
  const [username, setUsername] = React.useState(current ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function submit(e) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leetcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "could not save username");
      onSaved(body.username);
      await onSync?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel animate-in" style={{ padding: 20, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 7 }}>
        <label className="label" htmlFor="lc-username">LeetCode username</label>
        <input id="lc-username" className="custom-input mono" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. lee215" />
      </div>
      <button type="submit" className="btn btn-accent" disabled={busy || !username.trim()}
        style={{ padding: "9px 16px", opacity: busy || !username.trim() ? 0.6 : 1 }}>
        {busy ? "saving…" : current ? "Update" : "Connect"}
      </button>
      {error && <div style={{ flexBasis: "100%", fontSize: 13, color: "var(--bad)" }}>{error}</div>}
    </form>
  );
}

function TopicStrength({ stats }) {
  const rows = stats.slice().sort((a, b) => b.score - a.score || b.count - a.count);
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Topic strength</span>
        <span className="label">weighted 1-3</span>
      </div>
      {rows.length === 0 ? <Empty msg="No tagged LeetCode solves in this range." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
          {rows.map((s) => {
            const pct = Math.max(5, (s.score / 3) * 100);
            const color = s.score >= 2.5 ? "var(--cf-red)" : s.score >= 1.7 ? "var(--cf-orange)" : "var(--cf-green)";
            return (
              <div key={s.name} style={{ display: "grid", gridTemplateColumns: "150px 1fr 78px", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--border-2)" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99 }} />
                </div>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color, textAlign: "right" }}>
                  {formatScore(s.score)} <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>({s.count})</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeakTopics({ stats }) {
  const rows = stats.slice().filter((s) => s.count > 0).sort((a, b) => a.score - b.score || a.count - b.count).slice(0, 8);
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Weak topics</span>
        <span className="label">lowest score</span>
      </div>
      {rows.length === 0 ? <Empty msg="No topic data yet." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((t, i) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
              background: "var(--panel-2)", border: "1px solid var(--border-2)", borderRadius: 9 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)", width: 16 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                  {t.count} solved · <span className="mono">{formatScore(t.score)}</span> · E/M/H {t.easy}/{t.medium}/{t.hard}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillByTopic({ topics, allTopics, filter, onFilterChange }) {
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Skill by topic</span>
        <RadarFilterDropdown allTopics={allTopics} filter={filter} onChange={onFilterChange} />
      </div>
      {topics.length >= 3 ? (
        <SkillRadar
          topics={topics}
          lo={1}
          hi={3}
          formatValue={(v) => Number(v).toFixed(2)}
        />
      ) : (
        <Empty msg="Sync at least 3 tagged topics to render the radar." h={300} />
      )}
    </div>
  );
}

function lcRadarUniverse(topicStats) {
  const byName = new Map(topicStats.map((t) => [t.name, t]));
  const names = [...new Set(Object.values(LC_TAG_GROUPS))];
  for (const t of topicStats) if (!names.includes(t.name)) names.push(t.name);
  return names
    .map((name) => byName.get(name) || { name, count: 0, ratedCount: 0, avg: 0, max: 0, score: 0, easy: 0, medium: 0, hard: 0 })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function RecentLeetcode({ problems, onOpen }) {
  const rows = recent(8, problems);
  return (
    <div className="panel animate-in" style={{ padding: 20 }}>
      <div className="card-head">
        <span className="card-title">Recent LeetCode solves</span>
      </div>
      {rows.length === 0 ? <Empty msg="Sync after connecting your username to import recent accepted solves." /> : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((p, i) => (
            <div key={p.id} onClick={() => onOpen(p)} className="recent-row" style={{
              display: "grid", gridTemplateColumns: "86px minmax(0,1fr) auto", gap: 12, alignItems: "center",
              padding: "12px 8px", borderTop: i === 0 ? "none" : "1px solid var(--border-2)", cursor: "pointer",
            }}>
              <DifficultyBadge problem={p} size="sm" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                  {p.tags.slice(0, 4).map((t) => <Tag key={t}>{LC_TAG_GROUPS[t] || t}</Tag>)}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>{fmtDate(p.solvedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeetcodePage({ problems = [], leetcodeUsername, tagOverrides = {}, onUsernameSaved, onSync, syncing = false, onOpenProblem }) {
  const [range, setRange] = React.useState(RANGES[3]);
  const [radarFilter, setRadarFilter] = React.useState(null);
  const all = React.useMemo(() => withTagOverrides(problems, tagOverrides), [problems, tagOverrides]);
  const windowed = withinDays(all, range.days);
  const diff = lcDifficultyDistribution(windowed);
  const topicStats = lcTopicStats(windowed);
  const radarUniverse = lcRadarUniverse(topicStats);
  const radarMode = radarFilter == null ? "solved" : radarFilter === "all" ? "all" : "custom";
  const filteredRadarTopics =
    radarMode === "solved" ? topicStats
    : radarMode === "all" ? radarUniverse
    : radarUniverse.filter((t) => radarFilter.includes(t.name));
  const types = typeDistribution(8, windowed, LC_TAG_GROUPS);
  const weights = windowed.map((p) => leetcodeDifficultyWeight(p.lcDifficulty)).filter((v) => v != null);
  const avg = weights.length ? (weights.reduce((s, v) => s + v, 0) / weights.length).toFixed(2) : "—";
  const weighted = weights.length ? weightedScore(weights).toFixed(2) : "—";
  const hardCount = windowed.filter((p) => p.lcDifficulty === "Hard").length;
  const backfillLeetcode = () => onSync?.({ platforms: ["leetcode"], leetcodeLimit: 1000 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <LeetcodeUsernameForm
        key={leetcodeUsername ?? "empty"}
        current={leetcodeUsername}
        onSaved={onUsernameSaved}
        onSync={backfillLeetcode}
      />

      <div className="panel animate-in" style={{ padding: 22, display: "flex", flexWrap: "wrap", gap: 24,
        alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 240 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            {leetcodeUsername ? `@${leetcodeUsername}` : "LeetCode"}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
            Tags come from LeetCode question topic metadata
          </span>
          {leetcodeUsername && (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-accent" onClick={backfillLeetcode} disabled={syncing}
                style={{ padding: "7px 12px", fontSize: 12.5, opacity: syncing ? 0.6 : 1 }}>
                {syncing ? "backfilling…" : "Backfill LC"}
              </button>
              <button className="btn" onClick={() => onSync?.({ platforms: ["leetcode"], leetcodeLimit: 50 })} disabled={syncing}
                style={{ padding: "7px 12px", fontSize: 12.5, opacity: syncing ? 0.6 : 1 }}>
                Sync LC
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
          <Stat label="Solved" value={windowed.length} sub={range.days ? `last ${range.word}` : "all time"} />
          <Stat label="Topics" value={topicStats.length} sub="tag groups" />
          <Stat label="Avg score" value={avg} sub="easy 1 · medium 2 · hard 3" />
          <Stat label="Weighted" value={weighted} sub={`${hardCount} hard solves`} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "2px 2px 0" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{windowed.length}</span> LeetCode problem{windowed.length !== 1 ? "s" : ""}
          <span style={{ color: "var(--text-faint)" }}> · {range.days ? "last " + range.word : "all time"}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="label">Range</span>
          <RangeControl value={range} onChange={setRange} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }} className="grid-2">
        <SkillByTopic
          topics={filteredRadarTopics}
          allTopics={radarUniverse}
          filter={radarFilter}
          onFilterChange={setRadarFilter}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="panel animate-in" style={{ padding: 20 }}>
            <div className="card-head"><span className="card-title">Solved by difficulty</span></div>
            {windowed.length ? <DifficultyBars data={diff} /> : <Empty msg="No LeetCode solves in this range." />}
          </div>
          <div className="panel animate-in" style={{ padding: 20 }}>
            <div className="card-head"><span className="card-title">Problem types</span></div>
            {windowed.length && types.length ? <TypeDonut data={types} /> : <Empty msg="No tagged LeetCode solves in this range." />}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="grid-2">
        <TopicStrength stats={topicStats} />
        <WeakTopics stats={topicStats} />
      </div>

      <RecentLeetcode problems={all} onOpen={onOpenProblem} />
    </div>
  );
}

export { LeetcodePage };
