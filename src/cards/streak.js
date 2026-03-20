// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";

const CARD_DEFAULT_WIDTH = 400;
const RING_COLOR = "#e4a400";

/**
 * Format a date range string.
 *
 * @param {string} start Start date (YYYY-MM-DD).
 * @param {string} end End date (YYYY-MM-DD).
 * @returns {string} Formatted date range.
 */
const formatDateRange = (start, end) => {
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${s} - ${e}`;
};

/**
 * Renders the streak card SVG.
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
  const height = 195;

  const { titleColor, textColor, bgColor, borderColor, iconColor } =
    getCardColors({
      title_color,
      text_color,
      icon_color,
      bg_color,
      border_color,
      ring_color: title_color,
      theme,
    });

  const ringColor = icon_color ? iconColor : RING_COLOR;

  const currentDates =
    currentStreak > 0
      ? formatDateRange(currentStreakStart, currentStreakEnd)
      : "";
  const longestDates =
    longestStreak > 0
      ? formatDateRange(longestStreakStart, longestStreakEnd)
      : "";

  // Fire icon SVG path.
  const fireIcon = `<path d="M12.945 4.793a7.478 7.478 0 00-1.465-1.853C10.271 1.744 8.835.782 8.044 0c-.301.375-.588.765-.86 1.17C6.2 2.683 4.834 4.591 4.474 6.318c-.198.947-.157 1.97.09 2.906-.67-.276-1.28-.755-1.72-1.381a5.685 5.685 0 00-.443 2.223c.014.878.207 1.74.564 2.538a6.65 6.65 0 001.555 2.156c.858.818 1.885 1.382 2.97 1.706A7.37 7.37 0 009.67 17c.969-.078 1.9-.378 2.73-.838a6.04 6.04 0 001.974-1.85 5.763 5.763 0 00.924-3.072c.027-1.564-.473-3.238-1.605-4.673a.563.563 0 00-.748-1.774z" fill="${ringColor}"/>`;

  // Current streak section (left side with ring).
  const currentStreakSection = `
    <g transform="translate(${width / 4}, 30)">
      <g transform="translate(0, -10)">
        <svg x="-10" y="-5" width="20" height="20" viewBox="0 0 18 18">
          ${fireIcon}
        </svg>
      </g>
      <circle cx="0" cy="50" r="40" stroke="${ringColor}" stroke-width="5" fill="none" opacity="0.4"/>
      <circle cx="0" cy="50" r="40" stroke="${ringColor}" stroke-width="5" fill="none"
        stroke-dasharray="251.33"
        stroke-dashoffset="${currentStreak > 0 ? 0 : 251.33}"
        stroke-linecap="round"
        ${disable_animations ? "" : `style="animation: streakRing 1s ease-in-out forwards;"`}
      />
      <text x="0" y="55" text-anchor="middle" class="streak-number">${currentStreak}</text>
      <text x="0" y="105" text-anchor="middle" class="streak-label" fill="${ringColor}">Current Streak</text>
      <text x="0" y="122" text-anchor="middle" class="streak-dates">${currentDates}</text>
    </g>
  `;

  // Longest streak section (right side).
  const longestStreakSection = `
    <g transform="translate(${(width * 3) / 4}, 30)">
      <text x="0" y="55" text-anchor="middle" class="streak-number">${longestStreak}</text>
      <text x="0" y="80" text-anchor="middle" class="streak-label">Longest Streak</text>
      <text x="0" y="100" text-anchor="middle" class="streak-dates">${longestDates}</text>
    </g>
  `;

  // Divider line.
  const divider = `<line x1="${width / 2}" y1="25" x2="${width / 2}" y2="155" stroke="${textColor}" stroke-width="1" opacity="0.3"/>`;

  const cssStyles = `
    .streak-number {
      font: 800 28px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-label {
      font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-dates {
      font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${titleColor};
      opacity: 0.7;
    }
    ${
      disable_animations
        ? ""
        : `
    @keyframes streakRing {
      from { stroke-dashoffset: 251.33; }
      to { stroke-dashoffset: 0; }
    }
    `
    }
  `;

  const card = new Card({
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

  return card.render(`
    ${divider}
    ${currentStreakSection}
    ${longestStreakSection}
  `);
};

export { renderStreakCard };
export default renderStreakCard;
