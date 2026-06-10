import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Shape a DB row into the client-facing problem object (matches app/api/data).
function mapProblemRow(p) {
  return {
    id: p.id,
    contestId: p.contest_id,
    index: p.problem_index,
    name: p.name,
    rating: p.rating,
    tags: p.tags ?? [],
    solvedAt: p.solved_at,
    solvedAtTs: p.solved_at_ts,
    attempts: p.attempts,
    note: p.note ?? null,
    tagOverride: p.tag_overrides ?? null,
    isCustom: p.is_custom ?? false,
    description: p.description ?? null,
    images: p.images ?? [],
  };
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

function cleanDescription(description) {
  if (description == null) return null;
  if (typeof description !== "object" || Array.isArray(description)) return null;
  if (description.type !== "tiptap" || typeof description.doc !== "object" || description.doc == null) return null;
  return description;
}

function imagePathsFromDescription(description) {
  const doc = description && typeof description === "object" && description.type === "tiptap" ? description.doc : description;
  const paths = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "problemImage" && typeof node.attrs?.path === "string" && node.attrs.path) {
      paths.add(node.attrs.path);
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  }
  visit(doc);
  return [...paths];
}

// Normalize a YYYY-MM-DD string (or fall back to today) into {date, ts}.
function normalizeSolvedAt(solvedAt) {
  const today = new Date().toISOString().slice(0, 10);
  const date = typeof solvedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(solvedAt)
    ? solvedAt
    : today;
  // noon UTC keeps the displayed date stable across time zones
  return { date, ts: Date.parse(`${date}T12:00:00Z`) };
}

// POST — create a custom problem.
export async function POST(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "missing name" }, { status: 400 });

  const id = `custom-${crypto.randomUUID()}`;
  const { date, ts } = normalizeSolvedAt(body.solvedAt);
  const ratingNum = Number(body.rating);

  const row = {
    user_id: user.id,
    id,
    contest_id: 0,
    problem_index: "",
    name,
    rating: Number.isFinite(ratingNum) && ratingNum > 0 ? Math.round(ratingNum) : null,
    tags: cleanTags(body.tags),
    solved_at: date,
    solved_at_ts: ts,
    attempts: Number.isFinite(Number(body.attempts)) && Number(body.attempts) > 0 ? Math.round(Number(body.attempts)) : 1,
    is_custom: true,
    description: cleanDescription(body.description),
    images: Array.isArray(body.images) ? body.images.filter((s) => typeof s === "string") : [],
  };

  const { data, error } = await supabase.from("problems").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ problem: mapProblemRow(data) });
}

// PATCH — update editable fields of a custom problem.
export async function PATCH(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const patch = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("rating" in body) {
    const r = Number(body.rating);
    patch.rating = Number.isFinite(r) && r > 0 ? Math.round(r) : null;
  }
  if ("tags" in body) patch.tags = cleanTags(body.tags);
  if ("description" in body) patch.description = cleanDescription(body.description);
  if ("images" in body) patch.images = Array.isArray(body.images) ? body.images.filter((s) => typeof s === "string") : [];
  if ("attempts" in body) {
    const a = Number(body.attempts);
    patch.attempts = Number.isFinite(a) && a > 0 ? Math.round(a) : 1;
  }
  if ("solvedAt" in body) {
    const { date, ts } = normalizeSolvedAt(body.solvedAt);
    patch.solved_at = date;
    patch.solved_at_ts = ts;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("problems")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_custom", true)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ problem: mapProblemRow(data) });
}

// DELETE — remove a custom problem and its stored images.
export async function DELETE(req) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Fetch image paths first so we can clean up storage after the row is gone.
  const { data: existing } = await supabase
    .from("problems")
    .select("description, images")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_custom", true)
    .single();

  const { error } = await supabase
    .from("problems")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_custom", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = [...new Set([...(existing?.images ?? []), ...imagePathsFromDescription(existing?.description)])];
  if (paths.length) {
    await supabase.storage.from("problem-images").remove(paths);
  }

  return NextResponse.json({ ok: true });
}
