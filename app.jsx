"use client";

/* ============================================================
   App shell — tabs, theme toggle, notes store, problem window
   ============================================================ */
import { useEffect, useState } from "react";
import { USER } from "./data";
import { AllSolved, ProblemWindow } from "./allsolved";
import { Dashboard } from "./dashboard";

const NOTES_KEY = "cf_tracker_notes_v1";
const THEME_KEY = "cf_tracker_theme";
const TAB_KEY = "cf_tracker_tab";

function readNotes() {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  if (!storage || typeof storage.getItem !== "function") return {};
  try { return JSON.parse(storage.getItem(NOTES_KEY) || "{}"); } catch (e) { return {}; }
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
  const [openProblem, setOpenProblem] = useState(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTheme(storedValue(THEME_KEY, "dark"));
      setTab(storedValue(TAB_KEY, "dashboard"));
      setNotes(readNotes());
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

  function saveNote(id, text) {
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      window.localStorage?.setItem(NOTES_KEY, JSON.stringify(next));
      return next;
    });
  }

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
          {/* brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
              fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15 }}>‹›</div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>grind<span style={{ color: "var(--text-faint)" }}>·tracker</span></span>
          </div>

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

          {/* handle + theme toggle */}
          <span className="mono" style={{ fontSize: 12.5, color: "var(--text-faint)" }}>@{USER.handle}</span>
          <button className="btn" onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
            title="Toggle theme" style={{ padding: "7px 10px", width: 38, justifyContent: "center" }}>
            {theme === "dark" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      {/* content */}
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 24px 80px" }}>
        {tab === "dashboard"
          ? <Dashboard onOpenProblem={setOpenProblem} onGoAllSolved={() => setTab("all")} />
          : <AllSolved notes={notes} onOpen={setOpenProblem} />}
      </main>

      {openProblem && (
        <ProblemWindow key={openProblem.id} problem={openProblem} notes={notes} onClose={() => setOpenProblem(null)} onSave={saveNote} />
      )}
    </div>
  );
}
