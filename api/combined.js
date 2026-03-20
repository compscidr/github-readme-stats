// @ts-check

import { renderCombinedCard } from "../src/cards/combined.js";
import { guardAccess } from "../src/common/access.js";
import {
  CACHE_TTL,
  resolveCacheSeconds,
  setCacheHeaders,
  setErrorCacheHeaders,
} from "../src/common/cache.js";
import {
  MissingParamError,
  retrieveSecondaryMessage,
} from "../src/common/error.js";
import { parseArray, parseBoolean } from "../src/common/ops.js";
import axios from "axios";
import { renderError } from "../src/common/render.js";
import { fetchStreak } from "../src/fetchers/streak.js";
import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

/**
 * Fetch cached overview stats from the public gist.
 *
 * @param {string} username GitHub username (gist owner).
 * @returns {Promise<object>} Cached overview stats.
 */
const fetchCachedOverview = async (username) => {
  const gistId = process.env.GIST_ID;
  if (!gistId) {
    throw new Error("GIST_ID not configured");
  }
  const res = await axios({
    method: "get",
    url: `https://gist.githubusercontent.com/${username}/${gistId}/raw/github-stats.json`,
  });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return {
    name: data.name || username,
    totalStars: data.totalStars || 0,
    totalForks: data.totalForks || 0,
    totalCommits: data.totalCommits || 0,
    linesChanged: data.linesChanged || 0,
    repoViews: data.repoViews || 0,
    contributedTo: data.contributedTo || 0,
  };
};

// @ts-ignore
export default async (req, res) => {
  const {
    username,
    hide_border,
    card_width,
    title_color,
    icon_color,
    text_color,
    bg_color,
    theme,
    cache_seconds,
    custom_title,
    border_radius,
    border_color,
    disable_animations,
    langs_count,
    exclude_repo,
    hide,
  } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");

  const access = guardAccess({
    res,
    id: username,
    type: "username",
    colors: {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    },
  });
  if (!access.isPassed) {
    return access.result;
  }

  try {
    // Fetch all three data sources in parallel.
    // Overview comes from the cached gist (fast), streak and langs from GraphQL.
    const [overview, streak, langs] = await Promise.all([
      fetchCachedOverview(username),
      fetchStreak(username),
      fetchTopLanguages(username, parseArray(exclude_repo)),
    ]);

    const cacheSeconds = resolveCacheSeconds({
      requested: parseInt(cache_seconds, 10),
      def: CACHE_TTL.STATS_CARD.DEFAULT,
      min: CACHE_TTL.STATS_CARD.MIN,
      max: CACHE_TTL.STATS_CARD.MAX,
    });

    setCacheHeaders(res, cacheSeconds);

    return res.send(
      renderCombinedCard(
        { overview, streak, langs },
        {
          hide_border: parseBoolean(hide_border),
          card_width: parseInt(card_width, 10),
          title_color,
          icon_color,
          text_color,
          bg_color,
          theme,
          custom_title,
          border_radius,
          border_color,
          disable_animations: parseBoolean(disable_animations),
          langs_count: parseInt(langs_count, 10) || 8,
          hide: parseArray(hide),
        },
      ),
    );
  } catch (err) {
    setErrorCacheHeaders(res);
    if (err instanceof Error) {
      return res.send(
        renderError({
          message: err.message,
          secondaryMessage: retrieveSecondaryMessage(err),
          renderOptions: {
            title_color,
            text_color,
            bg_color,
            border_color,
            theme,
            show_repo_link: !(err instanceof MissingParamError),
          },
        }),
      );
    }
    return res.send(
      renderError({
        message: "An unknown error occurred",
        renderOptions: {
          title_color,
          text_color,
          bg_color,
          border_color,
          theme,
        },
      }),
    );
  }
};
