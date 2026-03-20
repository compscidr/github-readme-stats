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
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
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
 * Calculate streak stats from a sorted array of contribution days.
 *
 * @param {{ date: string, contributionCount: number }[]} days Sorted contribution days.
 * @returns {{ currentStreak: number, currentStreakStart: string, currentStreakEnd: string, longestStreak: number, longestStreakStart: string, longestStreakEnd: string }} Streak stats.
 */
const calculateStreaks = (days) => {
  let longestStreak = 0;
  let longestStreakStart = "";
  let longestStreakEnd = "";
  let streak = 0;
  let streakStart = "";

  const today = new Date().toISOString().split("T")[0];

  // Calculate longest streak.
  for (let i = 0; i < days.length; i++) {
    if (days[i].contributionCount > 0) {
      if (streak === 0) {
        streakStart = days[i].date;
      }
      streak++;
      if (streak > longestStreak) {
        longestStreak = streak;
        longestStreakStart = streakStart;
        longestStreakEnd = days[i].date;
      }
    } else {
      streak = 0;
    }
  }

  // Current streak: count backwards from today.
  let currentStreak = 0;
  let currentStreakStart = "";
  let currentStreakEnd = "";
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].date > today) {
      continue;
    }
    if (days[i].date === today && days[i].contributionCount === 0) {
      continue;
    }
    if (days[i].contributionCount > 0) {
      currentStreak++;
      currentStreakStart = days[i].date;
      if (!currentStreakEnd) {
        currentStreakEnd = days[i].date;
      }
    } else {
      break;
    }
  }

  return {
    currentStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
  };
};

/**
 * Fetch all-time contributions and streak stats for a given username.
 *
 * @param {string} username GitHub username.
 * @param {number[]} years Contribution years.
 * @returns {Promise<{ totalContributions: number, currentStreak: number, currentStreakStart: string, currentStreakEnd: string, longestStreak: number, longestStreakStart: string, longestStreakEnd: string }>} Contribution and streak stats.
 */
const totalContributionsFetcher = async (username, years) => {
  const res = await retryer(contribsFetcher, { login: username, years });

  if (res.data.errors) {
    logger.error(res.data.errors);
    return {
      totalContributions: 0,
      currentStreak: 0,
      currentStreakStart: "",
      currentStreakEnd: "",
      longestStreak: 0,
      longestStreakStart: "",
      longestStreakEnd: "",
    };
  }

  const user = res.data.data.user;
  let total = 0;
  const allDays = [];

  for (const key of Object.keys(user)) {
    const calendar = user[key]?.contributionCalendar;
    if (!calendar) {
      continue;
    }
    total += calendar.totalContributions || 0;
    for (const week of calendar.weeks || []) {
      for (const day of week.contributionDays || []) {
        allDays.push(day);
      }
    }
  }

  // Sort days chronologically.
  allDays.sort((a, b) => a.date.localeCompare(b.date));

  const streakStats = calculateStreaks(allDays);

  return { totalContributions: total, ...streakStats };
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
 *   currentStreak: number,
 *   currentStreakStart: string,
 *   currentStreakEnd: string,
 *   longestStreak: number,
 *   longestStreakStart: string,
 *   longestStreakEnd: string,
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
    currentStreak: 0,
    currentStreakStart: "",
    currentStreakEnd: "",
    longestStreak: 0,
    longestStreakStart: "",
    longestStreakEnd: "",
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

  // Fetch all-time contributions and streaks using contribution years from the first query.
  const years = user.contributionsCollection.contributionYears;
  const contribStats = await totalContributionsFetcher(username, years);
  overview.totalCommits = contribStats.totalContributions;
  overview.currentStreak = contribStats.currentStreak;
  overview.currentStreakStart = contribStats.currentStreakStart;
  overview.currentStreakEnd = contribStats.currentStreakEnd;
  overview.longestStreak = contribStats.longestStreak;
  overview.longestStreakStart = contribStats.longestStreakStart;
  overview.longestStreakEnd = contribStats.longestStreakEnd;

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
