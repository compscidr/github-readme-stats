// @ts-check

const TOKEN = process.env.GH_TOKEN;
const GIST_ID = process.env.GIST_ID;
const USERNAME = process.env.USERNAME;

if (!TOKEN || !GIST_ID || !USERNAME) {
  console.error(
    "Missing required environment variables: GH_TOKEN, GIST_ID, USERNAME",
  );
  process.exit(1);
}

const GRAPHQL_URL = "https://api.github.com/graphql";
const REST_BASE = "https://api.github.com";

const restHeaders = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

/**
 * Small delay helper to avoid hitting rate limits.
 * @param {number} ms Milliseconds to wait.
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch all non-fork repos the user owns or is an org member of via GraphQL,
 * paginating through all results.
 * @returns {Promise<string[]>} Array of "owner/name" strings.
 */
async function fetchAllRepos() {
  const query = `
    query($login: String!, $after: String) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: [OWNER, ORGANIZATION_MEMBER], isFork: false, after: $after) {
          nodes { nameWithOwner }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const repos = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: USERNAME, after } }),
    });

    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const { nodes, pageInfo } = json.data.user.repositories;
    for (const node of nodes) {
      repos.push(node.nameWithOwner);
    }

    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor;
  }

  return repos;
}

/**
 * Fetch contributor stats for a repo, retrying on 202 (computing) responses.
 * Returns the total lines added + deleted for USERNAME.
 * @param {string} repo "owner/name"
 * @returns {Promise<number>} Lines changed by the user in this repo.
 */
async function fetchLinesChanged(repo) {
  const url = `${REST_BASE}/repos/${repo}/stats/contributors`;
  const maxRetries = 6;
  const initialDelayMs = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers: restHeaders });

    if (res.status === 202) {
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      console.warn(
        `Contributor stats for ${repo} still computing after ${maxRetries + 1} attempts; treating linesChanged as 0.`,
      );
      return 0;
    }

    if (!res.ok) {
      // Non-success status (e.g. 404 for empty repos) — skip silently.
      return 0;
    }

    const contributors = await res.json();

    if (!Array.isArray(contributors)) {
      return 0;
    }

    const userStats = contributors.find(
      (c) => c.author && c.author.login.toLowerCase() === USERNAME.toLowerCase(),
    );

    if (!userStats) {
      return 0;
    }

    let additions = 0;
    let deletions = 0;
    for (const week of userStats.weeks) {
      additions += week.a;
      deletions += week.d;
    }

    return additions + deletions;
  }

  return 0;
}

/**
 * Fetch traffic views for an owned repo.
 * Returns 0 if the user lacks push access (403).
 * @param {string} repo "owner/name"
 * @returns {Promise<number>} Total view count.
 */
async function fetchRepoViews(repo) {
  const url = `${REST_BASE}/repos/${repo}/traffic/views`;
  const res = await fetch(url, { headers: restHeaders });

  if (res.status === 403) {
    // No push access — skip silently.
    return 0;
  }

  if (!res.ok) {
    return 0;
  }

  const json = await res.json();
  return json.count ?? 0;
}

/**
 * Update the target gist with computed stats.
 * @param {number} linesChanged
 * @param {number} repoViews
 */
async function updateGist(linesChanged, repoViews) {
  const url = `${REST_BASE}/gists/${GIST_ID}`;
  const content = JSON.stringify(
    { linesChanged, repoViews, updatedAt: new Date().toISOString() },
    null,
    2,
  );

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...restHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: {
        "github-stats.json": { content },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to update gist: ${res.status} ${res.statusText}`);
  }
}

async function main() {
  console.log(`Fetching repos for ${USERNAME}...`);
  const repos = await fetchAllRepos();
  console.log(`Fetched ${repos.length} repos`);

  let totalLinesChanged = 0;
  let totalViews = 0;

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i];
    console.log(`Processing repo ${i + 1}/${repos.length}: ${repo}`);

    const lines = await fetchLinesChanged(repo);
    totalLinesChanged += lines;
    await sleep(100);

    const views = await fetchRepoViews(repo);
    totalViews += views;
    await sleep(100);
  }

  console.log(`Lines changed: ${totalLinesChanged}`);
  console.log(`Views: ${totalViews}`);

  await updateGist(totalLinesChanged, totalViews);
  console.log("Gist updated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
