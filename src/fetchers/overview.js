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
  overview.contributedTo = user.repositoriesContributedTo.totalCount;

  // Fetch all-time contributions using contribution years from the first query.
  const years = user.contributionsCollection.contributionYears;
  overview.totalCommits = await totalContributionsFetcher(username, years);

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
