/* ============================================================
   Helpers: rank colors, derived stats, formatting
   ============================================================ */
import { PROBLEMS, TAG_GROUPS } from "./data";

  // Codeforces rank thresholds → css var color + label
  const RANKS = [
    { min: 2400, color: "var(--cf-red)",    name: "Grandmaster" },
    { min: 2300, color: "var(--cf-orange)", name: "Master" },
    { min: 2100, color: "var(--cf-orange)", name: "Master" },
    { min: 1900, color: "var(--cf-violet)", name: "Candidate Master" },
    { min: 1600, color: "var(--cf-blue)",   name: "Expert" },
    { min: 1400, color: "var(--cf-cyan)",   name: "Specialist" },
    { min: 1200, color: "var(--cf-green)",  name: "Pupil" },
    { min: 0,    color: "var(--cf-gray)",   name: "Newbie" },
  ];
  function rankOf(r) {
    for (const x of RANKS) if (r >= x.min) return x;
    return RANKS[RANKS.length - 1];
  }
  // color for a problem difficulty (same scale)
  function diffColor(r) { return rankOf(r).color; }

  // difficulty buckets for the bar chart
  const DIFF_BUCKETS = [
    { label: "800–1199",  lo: 0,    hi: 1199, color: "var(--cf-gray)" },
    { label: "1200–1399", lo: 1200, hi: 1399, color: "var(--cf-green)" },
    { label: "1400–1599", lo: 1400, hi: 1599, color: "var(--cf-cyan)" },
    { label: "1600–1899", lo: 1600, hi: 1899, color: "var(--cf-blue)" },
    { label: "1900+",     lo: 1900, hi: 9999, color: "var(--cf-violet)" },
  ];

  const DAY_MS = 86400000;
  const NOW_MS = dateMs("2026-06-06");

  function dateParts(iso) {
    return iso.split("-").map(Number);
  }

  function dateMs(iso) {
    const [year, month, day] = dateParts(iso);
    return Date.UTC(year, month - 1, day);
  }

  // filter a problem list to those solved within `days` of now (null = all)
  function withinDays(probs, days) {
    if (!days) return probs.slice();
    const cutoff = NOW_MS - days * DAY_MS;
    return probs.filter((p) => dateMs(p.solvedAt) >= cutoff);
  }

  function difficultyDistribution(probs = PROBLEMS) {
    return DIFF_BUCKETS.map((b) => ({
      ...b,
      count: probs.filter((p) => p.rating >= b.lo && p.rating <= b.hi).length,
    }));
  }

  // per-topic aggregate: count + avg ("elo") + max rating
  function topicStats(probs = PROBLEMS) {
    const map = {};
    for (const p of probs) {
      for (const t of p.tags) {
        const name = TAG_GROUPS[t] || t;
        if (!map[name]) map[name] = { name, raw: t, count: 0, max: 0, sum: 0, latest: "" };
        const m = map[name];
        m.count++;
        m.max = Math.max(m.max, p.rating);
        m.sum += p.rating;
        if (p.solvedAt > m.latest) m.latest = p.solvedAt;
      }
    }
    return Object.values(map).map((m) => ({ ...m, avg: Math.round(m.sum / m.count) }));
  }

  // core topics shown on the radar (skill = avg solved difficulty, more differentiated than raw max)
  const CORE = ["DP","Greedy","Math","Graphs","Data Structures","Binary Search","Constructive","Number Theory"];
  function radarTopics(probs = PROBLEMS) {
    const stats = topicStats(probs);
    const byName = Object.fromEntries(stats.map((s) => [s.name, s]));
    return CORE.map((name) => {
      const s = byName[name] || { name, count: 0, max: 0, avg: 0 };
      // skill 0..1 from average solved difficulty over the 1200..1850 window
      const skill = s.count ? Math.max(0.1, Math.min(1, (s.avg - 1200) / (1850 - 1200))) : 0;
      return { name, count: s.count, max: s.max || 0, avg: s.avg || 0, skill };
    });
  }

  // weakest topics: lowest AVERAGE solved difficulty (penalize few solves slightly)
  function weakest(n = 4, probs = PROBLEMS) {
    const stats = topicStats(probs).filter((s) => s.count >= 1);
    const scored = stats.map((s) => ({ ...s, score: s.avg - Math.min(s.count, 5) * 12 }));
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, n);
  }

  // types of problems solved — top tags by count for the donut
  function typeDistribution(n = 7, probs = PROBLEMS) {
    const stats = topicStats(probs).slice();
    stats.sort((a, b) => b.count - a.count);
    const top = stats.slice(0, n);
    const restCount = stats.slice(n).reduce((s, x) => s + x.count, 0);
    const palette = [
      "var(--cf-blue)","var(--cf-cyan)","var(--cf-violet)","var(--cf-green)",
      "var(--cf-orange)","var(--accent)","var(--cf-red)",
    ];
    const out = top.map((t, i) => ({ name: t.name, count: t.count, color: palette[i % palette.length] }));
    if (restCount > 0) out.push({ name: "Other", count: restCount, color: "var(--text-faint)" });
    return out;
  }

  function totals(probs = PROBLEMS) {
    const solved = probs.length;
    const tagSet = new Set();
    probs.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
    const avgRating = solved ? Math.round(probs.reduce((s, p) => s + p.rating, 0) / solved) : 0;
    const maxSolved = solved ? Math.max(...probs.map((p) => p.rating)) : 0;
    const avgAttempts = solved ? (probs.reduce((s, p) => s + p.attempts, 0) / solved) : 0;
    const firstTry = probs.filter((p) => p.attempts === 1).length;
    return { solved, topics: tagSet.size, avgRating, maxSolved, avgAttempts, firstTry };
  }

  // recent solves (sorted desc by date)
  function recent(n = 5, probs = PROBLEMS) {
    return probs.slice().sort((a, b) => (a.solvedAt < b.solvedAt ? 1 : -1)).slice(0, n);
  }

  // rating history filtered to a window (null = all)
  function ratingInRange(history, days) {
    if (!days) return history.slice();
    const cutoff = NOW_MS - days * DAY_MS;
    return history.filter((h) => dateMs(h.date) >= cutoff);
  }

  function fmtDate(iso) {
    const [year, month, day] = dateParts(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[month - 1]} ${day}, ${year}`;
  }
  function relDate(iso) {
    const days = Math.round((NOW_MS - dateMs(iso)) / DAY_MS);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return days + "d ago";
    if (days < 30) return Math.floor(days / 7) + "w ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
  }

  // resolve a "var(--x)" string to a concrete color for canvas/svg gradients if needed
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

export {
  CORE,
  DIFF_BUCKETS,
  cssVar,
  diffColor,
  difficultyDistribution,
  fmtDate,
  radarTopics,
  rankOf,
  ratingInRange,
  recent,
  relDate,
  topicStats,
  totals,
  typeDistribution,
  weakest,
  withinDays,
};
