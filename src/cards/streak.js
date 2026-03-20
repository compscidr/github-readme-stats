// @ts-check

import { getCardColors } from "../common/color.js";

const CARD_DEFAULT_WIDTH = 330;
const STREAK_COLOR = "#FB8C00";

/**
 * Format a date range string.
 *
 * @param {string} start Start date (YYYY-MM-DD).
 * @param {string} end End date (YYYY-MM-DD).
 * @returns {string} Formatted date range.
 */
const formatDateRange = (start, end) => {
  if (!start || !end) {
    return "";
  }
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${s} - ${e}`;
};

/**
 * Renders the streak card SVG, matching the DenverCoder1/github-readme-streak-stats
 * style but with only Current Streak and Longest Streak columns.
 *
 * @param {object} stats Streak stats data.
 * @param {number} stats.currentStreak Current streak length.
 * @param {string} stats.currentStreakStart Start date of current streak.
 * @param {string} stats.currentStreakEnd End date of current streak.
 * @param {number} stats.longestStreak Longest streak length.
 * @param {string} stats.longestStreakStart Start date of longest streak.
 * @param {string} stats.longestStreakEnd End date of longest streak.
 * @param {object} options Card options.
 * @returns {string} The streak card SVG.
 */
const renderStreakCard = (stats, options = {}) => {
  const {
    currentStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
  } = stats;

  const {
    hide_border = false,
    card_width,
    title_color,
    text_color,
    icon_color,
    bg_color,
    theme = "default",
    border_radius = 4.5,
    border_color,
    disable_animations = false,
  } = options;

  const width =
    card_width && !isNaN(card_width) ? card_width : CARD_DEFAULT_WIDTH;
  const height = 195;
  const midX = width / 2;
  const leftCenter = width / 4;
  const rightCenter = (width * 3) / 4;

  const { textColor, bgColor, borderColor, iconColor } = getCardColors({
    title_color,
    text_color,
    icon_color,
    bg_color,
    border_color,
    ring_color: title_color,
    theme,
  });

  const streakColor = icon_color ? iconColor : STREAK_COLOR;

  const currentDates =
    currentStreak > 0
      ? formatDateRange(currentStreakStart, currentStreakEnd)
      : "";
  const longestDates =
    longestStreak > 0
      ? formatDateRange(longestStreakStart, longestStreakEnd)
      : "";

  const animFadeIn = (delay) =>
    disable_animations
      ? ""
      : `style="opacity: 0; animation: fadein 0.5s linear forwards ${delay}s"`;
  const animStreak = disable_animations
    ? ""
    : `style="animation: currstreak 0.6s linear forwards"`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
      style="isolation: isolate" viewBox="0 0 ${width} ${height}" width="${width}px" height="${height}px" direction="ltr"
      role="img" aria-labelledby="titleId descId">
      <title id="titleId">Contribution Streaks</title>
      <desc id="descId">Current streak: ${currentStreak} days, Longest streak: ${longestStreak} days</desc>
      <style>
        @keyframes currstreak {
          0% { font-size: 3px; opacity: 0.2; }
          80% { font-size: 34px; opacity: 1; }
          100% { font-size: 28px; opacity: 1; }
        }
        @keyframes fadein {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        ${disable_animations ? "* { animation-duration: 0s !important; animation-delay: 0s !important; }" : ""}
      </style>
      <defs>
        <clipPath id="outer_rectangle">
          <rect width="${width}" height="${height}" rx="${border_radius}"/>
        </clipPath>
        <mask id="mask_out_ring_behind_fire">
          <rect width="${width}" height="${height}" fill="white"/>
          <ellipse id="mask-ellipse" cx="${leftCenter}" cy="32" rx="13" ry="18" fill="black"/>
        </mask>
      </defs>
      <g clip-path="url(#outer_rectangle)">
        <!-- Background -->
        <rect stroke="${hide_border ? "none" : borderColor}" fill="${bgColor}" rx="${border_radius}" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"/>
        <!-- Divider -->
        <line x1="${midX}" y1="28" x2="${midX}" y2="170" vector-effect="non-scaling-stroke" stroke-width="1" stroke="${borderColor}" stroke-linejoin="miter" stroke-linecap="square" stroke-miterlimit="3"/>

        <!-- Current Streak Section -->
        <g style="isolation: isolate">
          <!-- Current Streak label -->
          <g transform="translate(${leftCenter}, 108)">
            <text x="0" y="32" stroke-width="0" text-anchor="middle" fill="${streakColor}" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="14px" ${animFadeIn(0.9)}>
              Current Streak
            </text>
          </g>
          <!-- Current Streak range -->
          <g transform="translate(${leftCenter}, 145)">
            <text x="0" y="21" stroke-width="0" text-anchor="middle" fill="#9E9E9E" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="12px" ${animFadeIn(0.9)}>
              ${currentDates}
            </text>
          </g>
          <!-- Ring around number -->
          <g mask="url(#mask_out_ring_behind_fire)">
            <circle cx="${leftCenter}" cy="71" r="40" fill="none" stroke="${streakColor}" stroke-width="5" ${animFadeIn(0.4)}></circle>
          </g>
          <!-- Fire icon -->
          <g transform="translate(${leftCenter}, 19.5)" stroke-opacity="0" ${animFadeIn(0.6)}>
            <path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/>
            <path d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z" fill="${streakColor}" stroke-opacity="0"/>
          </g>
          <!-- Current Streak number -->
          <g transform="translate(${leftCenter}, 48)">
            <text x="0" y="32" stroke-width="0" text-anchor="middle" fill="${textColor}" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="28px" ${animStreak}>
              ${currentStreak.toLocaleString("en-US")}
            </text>
          </g>
        </g>

        <!-- Longest Streak Section -->
        <g style="isolation: isolate">
          <!-- Longest Streak number -->
          <g transform="translate(${rightCenter}, 48)">
            <text x="0" y="32" stroke-width="0" text-anchor="middle" fill="${textColor}" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="700" font-size="28px" ${animFadeIn(1.2)}>
              ${longestStreak.toLocaleString("en-US")}
            </text>
          </g>
          <!-- Longest Streak label -->
          <g transform="translate(${rightCenter}, 84)">
            <text x="0" y="32" stroke-width="0" text-anchor="middle" fill="${textColor}" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="14px" ${animFadeIn(1.3)}>
              Longest Streak
            </text>
          </g>
          <!-- Longest Streak range -->
          <g transform="translate(${rightCenter}, 114)">
            <text x="0" y="32" stroke-width="0" text-anchor="middle" fill="#9E9E9E" stroke="none" font-family="'Segoe UI', Ubuntu, sans-serif" font-weight="400" font-size="12px" ${animFadeIn(1.4)}>
              ${longestDates}
            </text>
          </g>
        </g>
      </g>
    </svg>
  `;
};

export { renderStreakCard };
export default renderStreakCard;
