// Shared LeetCode GraphQL helpers. LeetCode does not publish a stable public
// API; these queries use the same web GraphQL endpoint as leetcode-police.

const GRAPHQL_URL = "https://leetcode.com/graphql";

const USER_QUERY = `
  query userPublicProfile($username: String!) {
    matchedUser(username: $username) {
      username
    }
  }
`;

const RECENT_AC_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id
      title
      titleSlug
      timestamp
    }
  }
`;

const QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      title
      titleSlug
      difficulty
      acRate
      topicTags {
        name
        slug
      }
    }
  }
`;

function normalizeTimestamp(raw) {
  const ts = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(ts)) return 0;
  return ts > 4_102_444_800 ? Math.floor(ts / 1000) : ts;
}

async function leetcodeGraphql(query, variables, referer = "https://leetcode.com/") {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Referer": referer,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`LeetCode GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`LeetCode GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data;
}

export async function verifyLeetcodeUsername(username) {
  const u = username.trim();
  if (!u) throw new Error("missing LeetCode username");
  const data = await leetcodeGraphql(USER_QUERY, { username: u }, `https://leetcode.com/${u}/`);
  const canonical = data?.matchedUser?.username;
  if (!canonical) throw new Error(`LeetCode user "${u}" not found`);
  return canonical;
}

export async function fetchRecentAccepted(username, limit = 50) {
  const u = username.trim();
  const data = await leetcodeGraphql(RECENT_AC_QUERY, { username: u, limit }, `https://leetcode.com/${u}/`);
  return (data?.recentAcSubmissionList ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      titleSlug: row.titleSlug,
      timestamp: normalizeTimestamp(row.timestamp),
    }))
    .filter((row) => row.titleSlug && row.timestamp > 0);
}

export async function fetchQuestionMeta(titleSlug) {
  const data = await leetcodeGraphql(QUESTION_QUERY, { titleSlug }, `https://leetcode.com/problems/${titleSlug}/`);
  const q = data?.question;
  if (!q) return null;
  return {
    questionId: q.questionId,
    title: q.title,
    titleSlug: q.titleSlug,
    difficulty: q.difficulty,
    acRate: q.acRate,
    tags: (q.topicTags ?? []).map((t) => t.slug || t.name).filter(Boolean),
  };
}

export function leetcodeDifficultyWeight(difficulty) {
  if (difficulty === "Hard") return 3;
  if (difficulty === "Medium") return 2;
  if (difficulty === "Easy") return 1;
  return null;
}

export function leetcodeDifficultyColor(difficulty) {
  if (difficulty === "Hard") return "var(--cf-red)";
  if (difficulty === "Medium") return "var(--cf-orange)";
  if (difficulty === "Easy") return "var(--cf-green)";
  return "var(--text-faint)";
}
