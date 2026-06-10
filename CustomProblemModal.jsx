"use client";

import React from "react";
import { createClient } from "./lib/supabase/client";
import { TagEditor } from "./allsolved.jsx";
import ProblemNoteEditor, { IMAGES_BUCKET, richTextIsEmpty } from "./ProblemNoteEditor.jsx";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function extOf(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || "");
  return m ? m[1].toLowerCase() : (file.type.split("/")[1] || "png");
}

export default function CustomProblemModal({ initial, userId, allTagOptions = [], onClose, onCreate, onUpdate }) {
  const editing = Boolean(initial);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [rating, setRating] = React.useState(initial?.rating != null ? String(initial.rating) : "");
  const [tags, setTags] = React.useState(initial?.tags ?? []);
  const [solvedAt, setSolvedAt] = React.useState(initial?.solvedAt ?? todayISO());
  const [attempts, setAttempts] = React.useState(initial?.attempts != null ? String(initial.attempts) : "1");
  const [description, setDescription] = React.useState(initial?.description ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function uploadInlineImage(file) {
    setError(null);
    setUploading(true);
    const supabase = createClient();
    try {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 8 MB`);
        return null;
      }
      const path = `${userId}/${crypto.randomUUID()}.${extOf(file)}`;
      const { error: upErr } = await supabase.storage.from(IMAGES_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) {
        setError(upErr.message);
        return null;
      }
      return path;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const payload = {
      name: trimmed,
      rating: rating.trim() === "" ? null : Number(rating),
      tags,
      solvedAt,
      attempts: attempts.trim() === "" ? 1 : Number(attempts),
      description: richTextIsEmpty(description) ? null : description,
    };
    try {
      if (editing) await onUpdate(initial.id, payload);
      else await onCreate(payload);
      onClose();
    } catch (err) {
      setError(err.message ?? "Save failed");
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 110, overflowY: "auto",
      background: "var(--bg)", animation: "overlayIn .18s ease both",
    }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 2,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {editing ? "edit custom problem" : "new custom problem"}
          </span>
          <button className="btn" onClick={onClose} aria-label="Close" style={{
            marginLeft: "auto", width: 36, height: 36, padding: 0, justifyContent: "center", fontSize: 22, lineHeight: 1,
          }}>×</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 760, margin: "0 auto", padding: "26px 24px 72px" }}>
        <div className="panel animate-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="custom-field">
            <label className="label" htmlFor="cp-name">Name</label>
            <input id="cp-name" className="custom-input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Problem name" autoFocus />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div className="custom-field">
              <label className="label" htmlFor="cp-rating">Difficulty</label>
              <input id="cp-rating" className="custom-input" type="number" min="0" step="100" value={rating}
                onChange={(e) => setRating(e.target.value)} placeholder="e.g. 1500" />
            </div>
            <div className="custom-field">
              <label className="label" htmlFor="cp-solved">Solved</label>
              <input id="cp-solved" className="custom-input" type="date" value={solvedAt}
                onChange={(e) => setSolvedAt(e.target.value)} />
            </div>
            <div className="custom-field">
              <label className="label" htmlFor="cp-attempts">Attempts</label>
              <input id="cp-attempts" className="custom-input" type="number" min="1" step="1" value={attempts}
                onChange={(e) => setAttempts(e.target.value)} />
            </div>
          </div>

          <div className="custom-field">
            <span className="label" style={{ marginBottom: 8 }}>Tags</span>
            <TagEditor problemId={initial?.id ?? "new"} tags={tags} allTagOptions={allTagOptions}
              onSaveTags={(_, next) => setTags(next)} />
          </div>

          <div className="custom-field">
            <label className="label" htmlFor="cp-desc">Description</label>
            <ProblemNoteEditor
              value={description}
              onChange={setDescription}
              enableImages
              onUploadImage={uploadInlineImage}
              ariaLabel="Problem description"
              minHeight={260}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "var(--bad)",
              background: "color-mix(in srgb, var(--bad) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--bad) 30%, transparent)",
              borderRadius: 8, padding: "8px 14px" }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} style={{ padding: "9px 16px" }}>cancel</button>
            <button type="submit" className="btn btn-accent" disabled={saving || uploading}
              style={{ padding: "9px 18px", opacity: saving ? 0.6 : 1 }}>
              {saving ? "saving…" : editing ? "save changes" : "create problem"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
