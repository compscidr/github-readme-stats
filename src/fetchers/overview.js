// @ts-check

import axios from "axios";
import * as dotenv from "dotenv";
import githubUsernameRegex from "github-username-regex";
import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

dotenv.config();

// GraphQL query for overview stats (first page includes user info).
const GRAPHQL_OVERVIEW_QUERY = `
  query userInfo($login: String!, $ownedAfter: String, $contribAfter: String) {
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

// GraphQL query to fetch contributions by year.
const GRAPHQL_CONTRIBS_QUERY = `
  query contribs($login: String!) {
    user(login: $login) {
      YEARS_PLACEHOLDER
    }
  }
`;

/**
 * GraphQL fetcher for overview stats.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: GRAPHQL_OVERVIEW_QUERY,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * Fetch all repos (owned + contributed to) with pagination.
 *
 * @param {string} username GitHub username.
 * @returns {Promise<{ user: object, repos: Map<string, object> }>} User info and deduplicated repos.
 */
const overviewStatsFetcher = async (username) => {
  const repos = new Map();
  let userInfo = null;
  let ownedCursor = null;
  let contribCursor = null;
  let hasOwnedNext = true;
  let hasContribNext = true;

  while (hasOwnedNext || hasContribNext) {
    const variables = {
      login: username,
      ownedAfter: hasOwnedNext ? ownedCursor : null,
      contribAfter: hasContribNext ? contribCursor : null,
    };
    const res = await retryer(fetcher, variables);
    if (res.data.errors) {
      return { errors: res.data.errors, statusText: res.statusText };
    }

    const user = res.data.data.user;
    if (!userInfo) {
      userInfo = user;
    }

    // Collect owned repos.
    for (const repo of user.repositories.nodes) {
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, repo);
      }
    }

    // Collect contributed-to repos.
    for (const repo of user.repositoriesContributedTo.nodes) {
      if (!repos.has(repo.nameWithOwner)) {
        repos.set(repo.nameWithOwner, repo);
      }
    }

    hasOwnedNext = user.repositories.pageInfo.hasNextPage;
    if (hasOwnedNext) {
      ownedCursor = user.repositories.pageInfo.endCursor;
    }

    hasContribNext = user.repositoriesContributedTo.pageInfo.hasNextPage;
    if (hasContribNext) {
      contribCursor = user.repositoriesContributedTo.pageInfo.endCursor;
    }
  }

  return { user: userInfo, repos };
};

/**
 * Fetch contributions by year using GraphQL.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const contribsFetcher = (variables, token) => {
  const yearFragments = variables.years
    .map(
      (year) => `
      year${year}: contributionsCollection(
        from: "${year}-01-01T00:00:00Z",
        to: "${parseInt(year, 10) + 1}-01-01T00:00:00Z"
      ) {
        contributionCalendar {
          totalContributions
        }
      }`,
    )
    .join("\n");

  const query = GRAPHQL_CONTRIBS_QUERY.replace(
    "YEARS_PLACEHOLDER",
    yearFragments,
  );

  return request(
    {
      query,
      variables: { login: variables.login },
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * Fetch all-time contributions for a given username.
 *
 * @param {string} username GitHub username.
 * @param {number[]} years Contribution years.
 * @returns {Promise<number>} Total contributions.
 */
const totalContributionsFetcher = async (username, years) => {
  const res = await retryer(contribsFetcher, { login: username, years });

  if (res.data.errors) {
    logger.error(res.data.errors);
    return 0;
  }

  const user = res.data.data.user;
  let total = 0;
  for (const key of Object.keys(user)) {
    total += user[key]?.contributionCalendar?.totalContributions || 0;
  }
  return total;
};

/**
 * Fetch cached stats (lines changed, views) from a public GitHub Gist.
 *
 * @param {string} username GitHub username (gist owner).
 * @returns {Promise<{ linesChanged: number, repoViews: number }>} Cached stats.
 */
const fetchGistStats = async (username) => {
  const gistId = process.env.GIST_ID;
  if (!gistId) {
    return { linesChanged: 0, repoViews: 0 };
  }

  try {
    const res = await axios({
      method: "get",
      url: `https://gist.githubusercontent.com/${username}/${gistId}/raw/github-stats.json`,
    });
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return {
      linesChanged: data.linesChanged || 0,
      repoViews: data.repoViews || 0,
    };
  } catch (err) {
    logger.log("Failed to fetch gist stats:", err);
    return { linesChanged: 0, repoViews: 0 };
  }
};

/**
 * Fetch overview stats for a given username.
 *
 * @param {string} username GitHub username.
 * @returns {Promise<{
 *   name: string,
 *   totalStars: number,
 *   totalForks: number,
 *   totalCommits: number,
 *   linesChanged: number,
 *   repoViews: number,
 *   contributedTo: number,
 * }>} Overview stats data.
 */
const fetchOverview = async (username) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  if (!githubUsernameRegex.test(username)) {
    logger.log("Invalid username provided.");
    throw new Error("Invalid username provided.");
  }

  const overview = {
    name: "",
    totalStars: 0,
    totalForks: 0,
    totalCommits: 0,
    linesChanged: 0,
    repoViews: 0,
    contributedTo: 0,
  };

  // Fetch GraphQL stats and gist stats in parallel.
  const [graphqlRes, gistStats] = await Promise.all([
    overviewStatsFetcher(username),
    fetchGistStats(username),
  ]);

  // Catch GraphQL errors.
  if (graphqlRes.errors) {
    logger.error(graphqlRes.errors);
    if (graphqlRes.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        graphqlRes.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (graphqlRes.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(graphqlRes.errors[0].message, 90, 1)[0],
        graphqlRes.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the stats data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const { user, repos } = graphqlRes;

  overview.name = user.name || user.login;
  overview.contributedTo = repos.size;

  // Fetch all-time contributions using contribution years from the first query.
  const years = user.contributionsCollection.contributionYears;
  overview.totalCommits = await totalContributionsFetcher(username, years);

  // Sum stars and forks across all unique repos (owned + contributed to).
  for (const repo of repos.values()) {
    overview.totalStars += repo.stargazers.totalCount;
    overview.totalForks += repo.forkCount;
  }

  // Gist-cached stats.
  overview.linesChanged = gistStats.linesChanged;
  overview.repoViews = gistStats.repoViews;

  return overview;
};

export { fetchOverview };
export default fetchOverview;
