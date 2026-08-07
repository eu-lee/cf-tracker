const CF_TAG_GROUPS = {
  "dp": "DP", "greedy": "Greedy", "math": "Math", "graphs": "Graphs",
  "data structures": "Data Structures", "binary search": "Binary Search",
  "number theory": "Number Theory", "strings": "Strings",
  "constructive algorithms": "Constructive", "trees": "Trees",
  "geometry": "Geometry", "bitmasks": "Bitmasks", "combinatorics": "Combinatorics",
  "implementation": "Implementation", "dfs and similar": "DFS / Graph Search",
  "two pointers": "Two Pointers", "sortings": "Sorting", "games": "Game Theory",
  "dsu": "DSU", "bitwise": "Bitwise", "hashing": "Hashing", "brute force": "Brute Force",
};

const LC_TAG_GROUPS = {
  "array": "Arrays", "string": "Strings", "hash-table": "Hash Table",
  "dynamic-programming": "DP", "math": "Math", "sorting": "Sorting",
  "greedy": "Greedy", "binary-search": "Binary Search",
  "two-pointers": "Two Pointers", "sliding-window": "Sliding Window",
  "linked-list": "Linked List", "stack": "Stack", "queue": "Queue",
  "heap-priority-queue": "Heap / Priority Queue", "tree": "Trees",
  "binary-tree": "Binary Tree", "graph": "Graphs", "depth-first-search": "DFS",
  "breadth-first-search": "BFS", "union-find": "DSU", "trie": "Trie",
  "backtracking": "Backtracking", "recursion": "Recursion",
  "prefix-sum": "Prefix Sum", "matrix": "Matrix", "simulation": "Simulation",
  "design": "Design", "database": "Database", "bit-manipulation": "Bit Manipulation",
  "bitmask": "Bitmask", "counting": "Counting", "enumeration": "Enumeration",
  "monotonic-stack": "Monotonic Stack", "monotonic-queue": "Monotonic Queue",
  "ordered-set": "Ordered Set", "divide-and-conquer": "Divide and Conquer",
  "memoization": "Memoization", "topological-sort": "Topological Sort",
  "segment-tree": "Segment Tree", "binary-indexed-tree": "Fenwick Tree",
  "binary-search-tree": "BST", "shortest-path": "Shortest Path",
  "number-theory": "Number Theory", "combinatorics": "Combinatorics",
  "geometry": "Geometry", "string-matching": "String Matching",
  "rolling-hash": "Rolling Hash", "hash-function": "Hash Function",
  "data-stream": "Data Stream", "game-theory": "Game Theory",
  "interactive": "Interactive", "brainteaser": "Brainteaser",
  "doubly-linked-list": "Doubly Linked List", "merge-sort": "Merge Sort",
  "quickselect": "Quickselect", "randomized": "Randomized",
  "probability-and-statistics": "Probability / Statistics",
  "line-sweep": "Line Sweep", "minimum-spanning-tree": "MST",
  "strongly-connected-component": "SCC", "eulerian-circuit": "Eulerian Circuit",
  "suffix-array": "Suffix Array", "bucket-sort": "Bucket Sort",
  "radix-sort": "Radix Sort", "shell": "Shell", "concurrency": "Concurrency",
};

const TAG_GROUPS = { ...CF_TAG_GROUPS, ...LC_TAG_GROUPS };

function tagLabel(tag, platform) {
  if (platform === "leetcode") return LC_TAG_GROUPS[tag] || tag;
  if (platform === "codeforces") return CF_TAG_GROUPS[tag] || tag;
  return TAG_GROUPS[tag] || tag;
}

export { CF_TAG_GROUPS, LC_TAG_GROUPS, TAG_GROUPS, tagLabel };
