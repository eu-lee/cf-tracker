"use client";

import { useState } from "react";
import { createClient } from "./lib/supabase/client";

function Centered({ children }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "80vh", gap: 22, textAlign: "center", padding: "0 24px",
    }}>
      {children}
    </div>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
    // On success the browser is redirected to Google.
  }

  return (
    <Centered>
      <div style={{ fontSize: 40, lineHeight: 1 }}>⌬</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          Codeforces Tracker
        </div>
        <div style={{ fontSize: 14, color: "var(--text-faint)", maxWidth: 340, lineHeight: 1.6 }}>
          Sign in to track your solved problems, ratings, and notes.
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 13, color: "var(--bad)" }}>{error}</div>
      )}
      <button className="btn btn-accent" onClick={signIn} disabled={busy}
        style={{ padding: "10px 24px", fontSize: 14, opacity: busy ? 0.6 : 1 }}>
        {busy ? "redirecting…" : "Sign in with Google"}
      </button>
    </Centered>
  );
}

export function HandleSetup({ onComplete }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "could not set handle");
      onComplete(body.handle);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div style={{ fontSize: 40, lineHeight: 1 }}>⌬</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          What's your Codeforces handle?
        </div>
        <div style={{ fontSize: 14, color: "var(--text-faint)", maxWidth: 360, lineHeight: 1.6 }}>
          We'll pull your submissions and rating history for this handle.
        </div>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        <input
          autoFocus
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="e.g. tourist"
          className="mono"
          style={{
            padding: "10px 14px", fontSize: 14, borderRadius: 8, minWidth: 260,
            background: "var(--bg-soft, var(--bg))", color: "var(--text)",
            border: "1px solid var(--border)", textAlign: "center",
          }}
        />
        {error && <div style={{ fontSize: 13, color: "var(--bad)" }}>{error}</div>}
        <button type="submit" className="btn btn-accent" disabled={busy || !handle.trim()}
          style={{ padding: "10px 24px", fontSize: 14, opacity: busy || !handle.trim() ? 0.6 : 1 }}>
          {busy ? "checking…" : "Continue"}
        </button>
      </form>
    </Centered>
  );
}
