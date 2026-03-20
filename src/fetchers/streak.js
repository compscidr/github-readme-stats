// @ts-check

import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

// GraphQL query to get contribution years.
const GRAPHQL_YEARS_QUERY = `
  query userInfo($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionYears
      }
    }
  }
`;

// GraphQL query to fetch contributions by year (placeholder replaced at runtime).
const GRAPHQL_CONTRIBS_QUERY = `
  query contribs($login: String!) {
    user(login: $login) {
      YEARS_PLACEHOLDER
    }
  }
`;

/**
 * Fetch contribution years.
 *
 * @param {object} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response.
 */
const yearsFetcher = (variables, token) => {
  return request(
    { query: GRAPHQL_YEARS_QUERY, variables },
    { Authorization: `bearer ${token}` },
  );
};

/**
 * Fetch contribution calendar data by year.
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
    { query, variables: { login: variables.login } },
    { Authorization: `bearer ${token}` },
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
 * Fetch streak stats for a given username.
 * Lightweight: only queries contribution years + calendar data (no repo pagination).
 *
 * @param {string} username GitHub username.
 * @returns {Promise<{ currentStreak: number, currentStreakStart: string, currentStreakEnd: string, longestStreak: number, longestStreakStart: string, longestStreakEnd: string }>} Streak stats.
 */
const fetchStreak = async (username) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  // Step 1: Get contribution years.
  const yearsRes = await retryer(yearsFetcher, { login: username });

  if (yearsRes.data.errors) {
    logger.error(yearsRes.data.errors);
    if (yearsRes.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        yearsRes.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (yearsRes.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(yearsRes.data.errors[0].message, 90, 1)[0],
        yearsRes.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve contribution data.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const years =
    yearsRes.data.data.user.contributionsCollection.contributionYears;

  // Step 2: Fetch calendar data for all years.
  const contribsRes = await retryer(contribsFetcher, {
    login: username,
    years,
  });

  if (contribsRes.data.errors) {
    logger.error(contribsRes.data.errors);
    throw new CustomError(
      "Something went wrong while trying to retrieve contribution data.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const user = contribsRes.data.data.user;
  const allDays = [];

  for (const key of Object.keys(user)) {
    const calendar = user[key]?.contributionCalendar;
    if (!calendar) {
      continue;
    }
    for (const week of calendar.weeks || []) {
      for (const day of week.contributionDays || []) {
        allDays.push(day);
      }
    }
  }

  allDays.sort((a, b) => a.date.localeCompare(b.date));

  return calculateStreaks(allDays);
};

export { fetchStreak };
export default fetchStreak;
