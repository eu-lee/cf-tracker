"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TAG_GROUPS } from "./data";
import { AllSolved, ProblemWindow } from "./allsolved";
import { Dashboard } from "./dashboard";

const THEME_KEY = "cf_tracker_theme";
const TAB_KEY = "cf_tracker_tab";

function storedValue(key, fallback) {
  const s = typeof window !== "undefined" ? window.localStorage : null;
  if (!s) return fallback;
  return s.getItem(key) || fallback;
}

function EmptyState({ onSync, syncing, error }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", gap: 20, textAlign: "center", padding: "0 24px",
    }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>⌬</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>No data yet</div>
        <div style={{ fontSize: 14, color: "var(--text-faint)", maxWidth: 360, lineHeight: 1.6 }}>
          Hit sync to pull your Codeforces submissions and rating history.
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 13, color: "var(--bad)",
          background: "color-mix(in srgb, var(--bad) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--bad) 30%, transparent)",
          borderRadius: 8, padding: "8px 14px" }}>
          {error}
        </div>
      )}
      <button className="btn btn-accent" onClick={onSync} disabled={syncing}
        style={{ padding: "10px 24px", fontSize: 14, opacity: syncing ? 0.6 : 1 }}>
        {syncing ? "syncing…" : "↻ sync now"}
      </button>
    </div>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [tab, setTab] = useState("dashboard");
  const [user, setUser] = useState(null);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [problems, setProblems] = useState([]);
  // notes and tagOverrides are derived from problems once loaded; edits go to Supabase
  const [notes, setNotes] = useState({});
  const [tagOverrides, setTagOverrides] = useState({});
  const [radarFilter, setRadarFilter] = useState(null); // null = show all
  const [openProblem, setOpenProblem] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // Debounce timer for note saves
  const noteTimers = useRef({});

  // Load theme + tab from localStorage instantly (no flash)
  useEffect(() => {
    setTheme(storedValue(THEME_KEY, "dark"));
    setTab(storedValue(TAB_KEY, "dashboard"));
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (hydrated) window.localStorage?.setItem(THEME_KEY, theme);
  }, [hydrated, theme]);
  useEffect(() => {
    if (hydrated) window.localStorage?.setItem(TAB_KEY, tab);
  }, [hydrated, tab]);

  // Load all data from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/data")
      .then((r) => r.json())
      .then(({ user, ratingHistory, problems, radarFilter }) => {
        if (cancelled) return;
        if (user) setUser(user);
        if (ratingHistory) setRatingHistory(ratingHistory);
        if (radarFilter) setRadarFilter(radarFilter);
        if (problems) {
          // Unpack notes and tagOverrides that were stored on each problem row
          const noteMap = {}, tagMap = {};
          problems.forEach((p) => {
            if (p.note) noteMap[p.id] = p.note;
            if (p.tagOverride) tagMap[p.id] = p.tagOverride;
          });
          setProblems(problems);
          setNotes(noteMap);
          setTagOverrides(tagMap);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true); // show empty state on error
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "sync failed");

      if (body.user) setUser(body.user);
      if (body.ratingHistory) setRatingHistory(body.ratingHistory);

      const fetched = body.problems ?? [];
      setProblems((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newOnes = fetched.filter((p) => !existingIds.has(p.id));
        return newOnes.length ? [...newOnes, ...prev] : prev;
      });
      setLastSynced(new Date());
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function saveNote(id, note) {
    setNotes((prev) => ({ ...prev, [id]: note }));
    // Debounce: wait 1s of inactivity before persisting
    clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = setTimeout(() => {
      fetch("/api/note", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note }),
      });
    }, 1000);
  }

  function saveRadarFilter(filter) {
    setRadarFilter(filter);
    fetch("/api/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ radarFilter: filter }),
    });
  }

  function saveTags(id, tags) {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    setTagOverrides((prev) => ({ ...prev, [id]: clean }));
    fetch("/api/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tags: clean }),
    });
  }

  const allTagOptions = useMemo(() => (
    Array.from(new Set([
      ...Object.keys(TAG_GROUPS),
      ...problems.flatMap((p) => p.tags),
    ])).sort((a, b) => {
      const aa = (TAG_GROUPS[a] || a).toLowerCase();
      const bb = (TAG_GROUPS[b] || b).toLowerCase();
      return aa.localeCompare(bb);
    })
  ), [problems]);

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "all", label: "All Solved" },
  ];

  const hasData = hydrated && user !== null;

  return (
    <div className="app-shell">
      <header style={{
        position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(12px)",
        background: "color-mix(in srgb, var(--bg) 82%, transparent)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", height: 60,
          display: "flex", alignItems: "center", gap: 26 }}>
          {hasData && (
            <nav style={{ display: "flex", gap: 4, marginLeft: 8 }}>
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  position: "relative", padding: "7px 14px", fontSize: 13.5, fontWeight: 500,
                  background: "transparent", border: "none", cursor: "pointer", borderRadius: 8,
                  color: tab === t.id ? "var(--text)" : "var(--text-faint)", fontFamily: "inherit",
                  transition: "color .15s",
                }}>
                  {t.label}
                  {tab === t.id && <span style={{ position: "absolute", left: 14, right: 14, bottom: -1, height: 2, background: "var(--accent)", borderRadius: 2 }} />}
                </button>
              ))}
            </nav>
          )}

          <div style={{ flex: 1 }} />

          {user && (
            <span className="mono" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>@{user.handle}</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {syncError && !syncing && (
              <span style={{ fontSize: 11.5, color: "var(--bad)" }} title={syncError}>sync failed</span>
            )}
            {lastSynced && !syncing && !syncError && (
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                synced {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button className="btn" onClick={handleSync} disabled={syncing}
              title="Fetch latest submissions from Codeforces"
              style={{ padding: "7px 12px", fontSize: 12.5, opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "syncing…" : "↻ sync"}
            </button>
          </div>
          <button className="btn" onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
            title="Toggle theme" style={{ padding: "7px 10px", width: 38, justifyContent: "center" }}>
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px 80px" }}>
        {!hasData ? (
          <EmptyState onSync={handleSync} syncing={syncing} error={syncError} />
        ) : tab === "dashboard" ? (
          <Dashboard user={user} ratingHistory={ratingHistory} problems={problems}
            tagOverrides={tagOverrides} allTagOptions={allTagOptions}
            radarFilter={radarFilter} onSaveRadarFilter={saveRadarFilter}
            onSaveTags={saveTags} onOpenProblem={setOpenProblem} onGoAllSolved={() => setTab("all")} />
        ) : (
          <AllSolved problems={problems} notes={notes} tagOverrides={tagOverrides}
            allTagOptions={allTagOptions} onOpen={setOpenProblem} />
        )}
      </main>

      {openProblem && (
        <ProblemWindow
          key={openProblem.id}
          problem={openProblem}
          notes={notes}
          tagOverrides={tagOverrides}
          allTagOptions={allTagOptions}
          onClose={() => setOpenProblem(null)}
          onSave={saveNote}
          onSaveTags={saveTags}
        />
      )}
    </div>
  );
}
