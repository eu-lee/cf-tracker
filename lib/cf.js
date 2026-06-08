// Shared Codeforces API helpers used by the sync and handle routes.

export function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isoDate(seconds) {
  return new Date(seconds * 1000).toISOString().split("T")[0];
}

export async function cfFetch(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.status !== "OK") throw new Error(json.comment ?? "CF API error");
  return json.result;
}
