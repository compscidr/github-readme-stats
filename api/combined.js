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
import { renderError } from "../src/common/render.js";
import { fetchOverview } from "../src/fetchers/overview.js";
import { fetchStreak } from "../src/fetchers/streak.js";
import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

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
    const [overview, streak, langs] = await Promise.all([
      fetchOverview(username),
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
