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

// GraphQL query for overview stats.
const GRAPHQL_OVERVIEW_QUERY = `
  query userInfo($login: String!, $after: String) {
    user(login: $login) {
      name
      login
      repositories(first: 100, ownerAffiliations: [OWNER, ORGANIZATION_MEMBER], isFork: false, after: $after) {
        totalCount
        nodes {
          stargazers { totalCount }
          forkCount
        }
        pageInfo { hasNextPage endCursor }
      }
      repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
    }
  }
`;

// Pagination query (repos only).
const GRAPHQL_REPOS_ONLY_QUERY = `
  query userInfo($login: String!, $after: String) {
    user(login: $login) {
      repositories(first: 100, ownerAffiliations: [OWNER, ORGANIZATION_MEMBER], isFork: false, after: $after) {
        totalCount
        nodes {
          stargazers { totalCount }
          forkCount
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

/**
 * GraphQL fetcher for overview stats.
 *
 * @param {object & { after: string | null }} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const fetcher = (variables, token) => {
  const query = variables.after
    ? GRAPHQL_REPOS_ONLY_QUERY
    : GRAPHQL_OVERVIEW_QUERY;
  return request(
    {
      query,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    },
  );
};

/**
 * Fetch overview stats with pagination support.
 *
 * @param {string} username GitHub username.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const overviewStatsFetcher = async (username) => {
  let stats;
  let hasNextPage = true;
  let endCursor = null;
  while (hasNextPage) {
    const variables = {
      login: username,
      first: 100,
      after: endCursor,
    };
    let res = await retryer(fetcher, variables);
    if (res.data.errors) {
      return res;
    }

    // Store stats data.
    const repoNodes = res.data.data.user.repositories.nodes;
    if (stats) {
      stats.data.data.user.repositories.nodes.push(...repoNodes);
    } else {
      stats = res;
    }

    hasNextPage = res.data.data.user.repositories.pageInfo.hasNextPage;
    endCursor = res.data.data.user.repositories.pageInfo.endCursor;
  }

  return stats;
};

/**
 * Fetch total commits using the REST API.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 *
 * @see https://developer.github.com/v3/search/#search-commits
 */
const fetchTotalCommits = (variables, token) => {
  return axios({
    method: "get",
    url: `https://api.github.com/search/commits?q=author:${variables.login}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github.cloak-preview",
      Authorization: `token ${token}`,
    },
  });
};

/**
 * Fetch all-time commits for a given username.
 *
 * @param {string} username GitHub username.
 * @returns {Promise<number>} Total commits.
 */
const totalCommitsFetcher = async (username) => {
  if (!githubUsernameRegex.test(username)) {
    logger.log("Invalid username provided.");
    throw new Error("Invalid username provided.");
  }

  let res;
  try {
    res = await retryer(fetchTotalCommits, { login: username });
  } catch (err) {
    logger.log(err);
    throw new Error(err);
  }

  const totalCount = res.data.total_count;
  if (!totalCount || isNaN(totalCount)) {
    throw new CustomError(
      "Could not fetch total commits.",
      CustomError.GITHUB_REST_API_ERROR,
    );
  }
  return totalCount;
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
      url: `https://gist.githubusercontent.com/${username}/${gistId}/raw`,
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = res.data;
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
  const [graphqlRes, gistStats, totalCommits] = await Promise.all([
    overviewStatsFetcher(username),
    fetchGistStats(username),
    totalCommitsFetcher(username),
  ]);

  // Catch GraphQL errors.
  if (graphqlRes.data.errors) {
    logger.error(graphqlRes.data.errors);
    if (graphqlRes.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        graphqlRes.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (graphqlRes.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(graphqlRes.data.errors[0].message, 90, 1)[0],
        graphqlRes.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the stats data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const user = graphqlRes.data.data.user;

  overview.name = user.name || user.login;
  overview.totalCommits = totalCommits;
  overview.contributedTo = user.repositoriesContributedTo.totalCount;

  // Sum stars and forks across all repos.
  overview.totalStars = user.repositories.nodes.reduce(
    (prev, curr) => prev + curr.stargazers.totalCount,
    0,
  );
  overview.totalForks = user.repositories.nodes.reduce(
    (prev, curr) => prev + curr.forkCount,
    0,
  );

  // Gist-cached stats.
  overview.linesChanged = gistStats.linesChanged;
  overview.repoViews = gistStats.repoViews;

  return overview;
};

export { fetchOverview };
export default fetchOverview;
