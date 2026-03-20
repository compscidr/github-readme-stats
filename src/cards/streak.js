// @ts-check

import { Card } from "../common/Card.js";
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
 * Renders the streak card SVG using the Card class, matching the
 * DenverCoder1/github-readme-streak-stats style with Current Streak
 * and Longest Streak columns.
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
    border_radius,
    border_color,
    disable_animations = false,
  } = options;

  const width =
    card_width && !isNaN(card_width) ? card_width : CARD_DEFAULT_WIDTH;
  const height = 195 + 30; // +30 to compensate for Card.setHideTitle reducing height
  const midX = width / 2;
  const leftCenter = width / 4;
  const rightCenter = (width * 3) / 4;

  const { titleColor, textColor, iconColor, bgColor, borderColor } =
    getCardColors({
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

  const cssStyles = `
    @keyframes currstreak {
      0% { font-size: 3px; opacity: 0.2; }
      80% { font-size: 34px; opacity: 1; }
      100% { font-size: 28px; opacity: 1; }
    }
    @keyframes fadein {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
    .streak-number {
      font: 700 28px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-label {
      font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-label-current {
      font: 700 14px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${streakColor};
    }
    .streak-dates {
      font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #9E9E9E;
    }
    .streak-fadein-04 { opacity: 0; animation: fadein 0.5s linear forwards 0.4s; }
    .streak-fadein-06 { opacity: 0; animation: fadein 0.5s linear forwards 0.6s; }
    .streak-fadein-09 { opacity: 0; animation: fadein 0.5s linear forwards 0.9s; }
    .streak-fadein-12 { opacity: 0; animation: fadein 0.5s linear forwards 1.2s; }
    .streak-fadein-13 { opacity: 0; animation: fadein 0.5s linear forwards 1.3s; }
    .streak-fadein-14 { opacity: 0; animation: fadein 0.5s linear forwards 1.4s; }
    .streak-anim-number { animation: currstreak 0.6s linear forwards; }
  `;

  const card = new Card({
    customTitle: "",
    defaultTitle: "",
    width,
    height,
    border_radius,
    colors: {
      titleColor,
      textColor,
      iconColor,
      bgColor,
      borderColor,
    },
  });

  card.setHideBorder(hide_border);
  card.setHideTitle(true);
  card.setCSS(cssStyles);

  if (disable_animations) {
    card.disableAnimations();
  }

  card.setAccessibilityLabel({
    title: "Contribution Streaks",
    desc: `Current streak: ${currentStreak} days, Longest streak: ${longestStreak} days`,
  });

  const body = `
    <defs>
      <mask id="mask_out_ring_behind_fire">
        <rect width="${width}" height="${height}" fill="white"/>
        <ellipse cx="${leftCenter}" cy="7" rx="13" ry="18" fill="black"/>
      </mask>
    </defs>

    <!-- Divider -->
    <line x1="${midX}" y1="3" x2="${midX}" y2="145" stroke="${borderColor}" stroke-width="1" opacity="0.5"/>

    <!-- Current Streak Section -->
    <!-- Ring -->
    <g mask="url(#mask_out_ring_behind_fire)">
      <circle cx="${leftCenter}" cy="46" r="40" fill="none" stroke="${streakColor}" stroke-width="5" class="streak-fadein-04"/>
    </g>
    <!-- Fire icon -->
    <g transform="translate(${leftCenter}, -5.5)" stroke-opacity="0" class="streak-fadein-06">
      <path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/>
      <path d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z" fill="${streakColor}" stroke-opacity="0"/>
    </g>
    <!-- Number -->
    <g transform="translate(${leftCenter}, 23)">
      <text x="0" y="32" text-anchor="middle" class="streak-number streak-anim-number">${currentStreak.toLocaleString("en-US")}</text>
    </g>
    <!-- Label -->
    <g transform="translate(${leftCenter}, 83)">
      <text x="0" y="32" text-anchor="middle" class="streak-label-current streak-fadein-09">Current Streak</text>
    </g>
    <!-- Dates -->
    <g transform="translate(${leftCenter}, 120)">
      <text x="0" y="21" text-anchor="middle" class="streak-dates streak-fadein-09">${currentDates}</text>
    </g>

    <!-- Longest Streak Section -->
    <!-- Number -->
    <g transform="translate(${rightCenter}, 23)">
      <text x="0" y="32" text-anchor="middle" class="streak-number streak-fadein-12">${longestStreak.toLocaleString("en-US")}</text>
    </g>
    <!-- Label -->
    <g transform="translate(${rightCenter}, 59)">
      <text x="0" y="32" text-anchor="middle" class="streak-label streak-fadein-13">Longest Streak</text>
    </g>
    <!-- Dates -->
    <g transform="translate(${rightCenter}, 89)">
      <text x="0" y="32" text-anchor="middle" class="streak-dates streak-fadein-14">${longestDates}</text>
    </g>
  `;

  return card.render(body);
};

export { renderStreakCard };
export default renderStreakCard;
