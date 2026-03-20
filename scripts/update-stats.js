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
 * Run a GraphQL query against the GitHub API.
 * @param {string} query GraphQL query string.
 * @param {object} variables Query variables.
 * @returns {Promise<object>} Parsed JSON response.
 */
async function graphql(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

/**
 * Fetch all repos (owned + contributed to) with stars/forks, plus contribution years.
 * @returns {Promise<{ repos: Map<string, object>, name: string, contributionYears: number[] }>} Repos and user info.
 */
async function fetchAllRepos() {
  const query = `
    query($login: String!, $ownedAfter: String, $contribAfter: String) {
      user(login: $login) {
        name
        login
        repositories(first: 100, ownerAffiliations: [OWNER, ORGANIZATION_MEMBER], isFork: false, after: $ownedAfter) {
          nodes {
            nameWithOwner
            stargazers { totalCount }
            forkCount
          }
          pageInfo { hasNextPage endCursor }
        }
        repositoriesContributedTo(first: 100, includeUserRepositories: false, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY], after: $contribAfter) {
          nodes {
            nameWithOwner
            stargazers { totalCount }
            forkCount
          }
          pageInfo { hasNextPage endCursor }
        }
        contributionsCollection {
          contributionYears
        }
      }
    }
  `;

  const repos = new Map();
  let name = "";
  let contributionYears = [];
  let ownedAfter = null;
  let contribAfter = null;
  let hasOwnedNext = true;
  let hasContribNext = true;

  while (hasOwnedNext || hasContribNext) {
    const json = await graphql(query, {
      login: USERNAME,
      ownedAfter: hasOwnedNext ? ownedAfter : null,
      contribAfter: hasContribNext ? contribAfter : null,
    });

    const user = json.data.user;
    if (!name) {
      name = user.name || user.login;
      contributionYears = user.contributionsCollection.contributionYears;
    }

    for (const repo of user.repositories.nodes) {
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, repo);
      }
    }

    for (const repo of user.repositoriesContributedTo.nodes) {
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, repo);
      }
    }

    hasOwnedNext = user.repositories.pageInfo.hasNextPage;
    if (hasOwnedNext) {
      ownedAfter = user.repositories.pageInfo.endCursor;
    }

    hasContribNext = user.repositoriesContributedTo.pageInfo.hasNextPage;
    if (hasContribNext) {
      contribAfter = user.repositoriesContributedTo.pageInfo.endCursor;
    }
  }

  return { repos, name, contributionYears };
}

/**
 * Fetch all-time contributions by querying each contribution year.
 * @param {number[]} years Contribution years.
 * @returns {Promise<number>} Total contributions.
 */
async function fetchTotalContributions(years) {
  const yearFragments = years
    .map(
      (year) => `
      year${year}: contributionsCollection(
        from: "${year}-01-01T00:00:00Z",
        to: "${parseInt(year, 10) + 1}-01-01T00:00:00Z"
      ) {
        contributionCalendar { totalContributions }
      }`,
    )
    .join("\n");

  const query = `query($login: String!) { user(login: $login) { ${yearFragments} } }`;
  const json = await graphql(query, { login: USERNAME });

  let total = 0;
  for (const key of Object.keys(json.data.user)) {
    total += json.data.user[key]?.contributionCalendar?.totalContributions || 0;
  }
  return total;
}

/**
 * Fetch contributor stats for a repo, retrying on 202 (computing) responses.
 * Returns the total lines added + deleted for USERNAME.
 * @param {string} repo "owner/name"
 * @returns {Promise<number>} Lines changed by the user in this repo.
 */
async function fetchLinesChanged(repo) {
  const url = `${REST_BASE}/repos/${repo}/stats/contributors`;
  const maxRetries = 60;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: restHeaders });
    } catch {
      return 0;
    }

    if (res.status === 202) {
      await sleep(2000);
      continue;
    }

    if (!res.ok) {
      return 0;
    }

    let contributors;
    try {
      contributors = await res.json();
    } catch {
      return 0;
    }

    if (!Array.isArray(contributors)) {
      return 0;
    }

    const userStats = contributors.find(
      (c) =>
        c.author && c.author.login.toLowerCase() === USERNAME.toLowerCase(),
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

  console.warn(`Too many 202s for ${repo}; lines changed will be incomplete.`);
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
  let res;
  try {
    res = await fetch(url, { headers: restHeaders });
  } catch {
    console.warn(`Failed to fetch views for ${repo}; skipping.`);
    return 0;
  }

  if (res.status === 403) {
    return 0;
  }

  if (!res.ok) {
    console.warn(`Views for ${repo} returned ${res.status}; skipping.`);
    return 0;
  }

  try {
    const json = await res.json();
    return json.count ?? 0;
  } catch {
    console.warn(`Failed to parse views response for ${repo}; skipping.`);
    return 0;
  }
}

/**
 * Update the target gist with computed stats.
 * @param {object} stats All computed stats.
 */
async function updateGist(stats) {
  const url = `${REST_BASE}/gists/${GIST_ID}`;
  const content = JSON.stringify(
    { ...stats, updatedAt: new Date().toISOString() },
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

/**
 * Main entry point. Fetches all repos, computes stats, and updates the gist.
 * @returns {Promise<void>}
 */
async function main() {
  console.log(`Fetching repos for ${USERNAME}...`);
  const { repos, name, contributionYears } = await fetchAllRepos();
  const repoList = [...repos.keys()];
  console.log(`Fetched ${repoList.length} repos`);

  // Compute overview stats from the repo data.
  let totalStars = 0;
  let totalForks = 0;
  for (const repo of repos.values()) {
    totalStars += repo.stargazers.totalCount;
    totalForks += repo.forkCount;
  }

  console.log(`Stars: ${totalStars}, Forks: ${totalForks}`);

  // Fetch all-time contributions.
  console.log("Fetching all-time contributions...");
  const totalCommits = await fetchTotalContributions(contributionYears);
  console.log(`All-time contributions: ${totalCommits}`);

  // Compute per-repo stats (lines changed + views).
  let totalLinesChanged = 0;
  let totalViews = 0;

  for (let i = 0; i < repoList.length; i++) {
    const repo = repoList[i];
    console.log(`Processing repo ${i + 1}/${repoList.length}: ${repo}`);

    const lines = await fetchLinesChanged(repo);
    totalLinesChanged += lines;
    await sleep(100);

    const views = await fetchRepoViews(repo);
    totalViews += views;
    await sleep(100);
  }

  console.log(`Lines changed: ${totalLinesChanged}`);
  console.log(`Views: ${totalViews}`);

  await updateGist({
    name,
    totalStars,
    totalForks,
    totalCommits,
    contributedTo: repoList.length,
    linesChanged: totalLinesChanged,
    repoViews: totalViews,
  });
  console.log("Gist updated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
