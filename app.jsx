"use client";

/* ============================================================
   App shell — tabs, theme toggle, notes store, problem window
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { USER as SEED_USER, RATING_HISTORY as SEED_RATING_HISTORY, PROBLEMS as SEED_PROBLEMS, TAG_GROUPS } from "./data";
import { AllSolved, ProblemWindow } from "./allsolved";
import { Dashboard } from "./dashboard";

const NOTES_KEY = "cf_tracker_notes_v1";
const TAGS_KEY = "cf_tracker_tag_overrides_v1";
const PROBLEMS_KEY = "cf_tracker_problems_v1";
const USER_KEY = "cf_tracker_user_v1";
const RATING_HISTORY_KEY = "cf_tracker_rating_history_v1";
const THEME_KEY = "cf_tracker_theme";
const TAB_KEY = "cf_tracker_tab";

function readJson(key, fallback) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  if (!storage || typeof storage.getItem !== "function") return fallback;
  try { return JSON.parse(storage.getItem(key) || JSON.stringify(fallback)); } catch (e) { return fallback; }
}

function storedValue(key, fallback) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  if (!storage || typeof storage.getItem !== "function") return fallback;
  return storage.getItem(key) || fallback;
}

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [tab, setTab] = useState("dashboard");
  const [notes, setNotes] = useState({});
  const [tagOverrides, setTagOverrides] = useState({});
  const [user, setUser] = useState(SEED_USER);
  const [ratingHistory, setRatingHistory] = useState(SEED_RATING_HISTORY);
  const [problems, setProblems] = useState(SEED_PROBLEMS);
  const [openProblem, setOpenProblem] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTheme(storedValue(THEME_KEY, "dark"));
      setTab(storedValue(TAB_KEY, "dashboard"));
      setNotes(readJson(NOTES_KEY, {}));
      setTagOverrides(readJson(TAGS_KEY, {}));
      const storedUser = readJson(USER_KEY, null);
      if (storedUser) setUser(storedUser);
      const storedHistory = readJson(RATING_HISTORY_KEY, null);
      if (storedHistory) setRatingHistory(storedHistory);
      const stored = readJson(PROBLEMS_KEY, null);
      if (stored) setProblems(stored);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (hydrated) window.localStorage?.setItem(THEME_KEY, theme);
  }, [hydrated, theme]);
  useEffect(() => {
    if (hydrated) window.localStorage?.setItem(TAB_KEY, tab);
  }, [hydrated, tab]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "sync failed");

      if (body.user) {
        setUser(body.user);
        window.localStorage?.setItem(USER_KEY, JSON.stringify(body.user));
      }
      if (body.ratingHistory) {
        setRatingHistory(body.ratingHistory);
        window.localStorage?.setItem(RATING_HISTORY_KEY, JSON.stringify(body.ratingHistory));
      }
      const fetched = body.problems ?? [];
      setProblems((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newOnes = fetched.filter((p) => !existingIds.has(p.id));
        if (!newOnes.length) return prev;
        const merged = [...newOnes, ...prev];
        window.localStorage?.setItem(PROBLEMS_KEY, JSON.stringify(merged));
        return merged;
      });
      setLastSynced(new Date());
    } catch (e) {
      setSyncError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function saveNote(id, text) {
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      window.localStorage?.setItem(NOTES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function saveTags(id, tags) {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    setTagOverrides((prev) => {
      const next = { ...prev, [id]: clean };
      window.localStorage?.setItem(TAGS_KEY, JSON.stringify(next));
      return next;
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

  return (
    <div className="app-shell">
      {/* top bar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40, backdropFilter: "blur(12px)",
        background: "color-mix(in srgb, var(--bg) 82%, transparent)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", height: 60,
          display: "flex", alignItems: "center", gap: 26 }}>
          {/* tabs */}
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

          <div style={{ flex: 1 }} />

          {/* handle + sync + theme toggle */}
          <span className="mono" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>@{user.handle}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {syncError && !syncing && (
              <span style={{ fontSize: 11.5, color: "var(--bad)" }} title={syncError}>sync failed</span>
            )}
            {lastSynced && !syncing && !syncError && (
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                synced {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              className="btn"
              onClick={handleSync}
              disabled={syncing}
              title="Fetch latest submissions from Codeforces"
              style={{ padding: "7px 12px", fontSize: 12.5, opacity: syncing ? 0.6 : 1 }}
            >
              {syncing ? "syncing…" : "↻ sync"}
            </button>
          </div>
          <button className="btn" onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
            title="Toggle theme" style={{ padding: "7px 10px", width: 38, justifyContent: "center" }}>
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      {/* content */}
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px 80px" }}>
        {tab === "dashboard"
          ? <Dashboard user={user} ratingHistory={ratingHistory} problems={problems}
              tagOverrides={tagOverrides} allTagOptions={allTagOptions}
              onSaveTags={saveTags} onOpenProblem={setOpenProblem} onGoAllSolved={() => setTab("all")} />
          : <AllSolved problems={problems} notes={notes} tagOverrides={tagOverrides}
              allTagOptions={allTagOptions} onOpen={setOpenProblem} />}
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
