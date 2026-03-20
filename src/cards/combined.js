// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";
import { icons } from "../common/icons.js";
import { clampValue } from "../common/ops.js";

const CARD_DEFAULT_WIDTH = 800;
const STREAK_COLOR = "#FB8C00";

/**
 * Format a number with commas.
 *
 * @param {number} value The number to format.
 * @returns {string} Formatted number.
 */
const formatNumber = (value) => {
  return value.toLocaleString("en-US");
};

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
  const opts = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${s} - ${e}`;
};

/**
 * Format a date range with year.
 *
 * @param {string} start Start date (YYYY-MM-DD).
 * @param {string} end End date (YYYY-MM-DD).
 * @returns {string} Formatted date range.
 */
const formatDateRangeWithYear = (start, end) => {
  if (!start || !end) {
    return "";
  }
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return `${s} - ${e}`;
};

// Icons for the stats section.
const statIcons = {
  star: icons.star,
  fork: icons.fork,
  commits: icons.commits,
  plus: `<path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>`,
  eye: `<path fill-rule="evenodd" d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 0-2.825-.742-3.955-1.715-1.124-.967-1.954-2.096-2.366-2.717a.12.12 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 6.423.43 7.1a1.542 1.542 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 1.27-1.091 2.187-2.345 2.637-3.023a1.542 1.542 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z"/>`,
  contribs: icons.contribs,
};

/**
 * Renders the combined stats card.
 *
 * @param {object} data Combined data.
 * @param {object} data.overview Overview stats.
 * @param {object} data.streak Streak stats.
 * @param {object} data.langs Top languages data (key-value object).
 * @param {object} options Card options.
 * @returns {string} Combined card SVG.
 */
const renderCombinedCard = (data, options = {}) => {
  const { overview, streak, langs } = data;

  const {
    hide_border = false,
    card_width,
    title_color,
    icon_color,
    text_color,
    bg_color,
    theme = "default",
    custom_title,
    border_radius,
    border_color,
    disable_animations = false,
    langs_count = 8,
  } = options;

  const width =
    card_width && !isNaN(card_width) ? card_width : CARD_DEFAULT_WIDTH;
  const leftColWidth = width * 0.5;
  const rightColX = leftColWidth + 10;
  const rightColWidth = width - rightColX - 25;

  // Colors.
  const { titleColor, iconColor, textColor, bgColor, borderColor } =
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

  // Stats rows.
  const statsData = [
    {
      icon: statIcons.star,
      label: "Stars",
      value: formatNumber(overview.totalStars),
    },
    {
      icon: statIcons.fork,
      label: "Forks",
      value: formatNumber(overview.totalForks),
    },
    {
      icon: statIcons.commits,
      label: "All-time contributions",
      value: formatNumber(overview.totalCommits),
    },
    {
      icon: statIcons.plus,
      label: "Lines of code changed",
      value: formatNumber(overview.linesChanged),
    },
    {
      icon: statIcons.eye,
      label: "Repository views (past two weeks)",
      value: formatNumber(overview.repoViews),
    },
    {
      icon: statIcons.contribs,
      label: "Repositories with contributions",
      value: formatNumber(overview.contributedTo),
    },
  ];

  const lineHeight = 25;
  const statsHeight = statsData.length * lineHeight;

  // Streak section.
  const streakSectionY = statsHeight + 10;
  const streakHeight = 100;

  // Languages.
  const langEntries = Object.values(langs);
  const numLangs = clampValue(parseInt(String(langs_count), 10), 1, 20);
  const topLangs = langEntries.slice(0, numLangs);
  const totalSize = topLangs.reduce((sum, lang) => sum + lang.size, 0);

  // Calculate right column height: progress bar + lang list.
  const langListHeight = topLangs.length * 20 + 30;

  // Total card height.
  const contentHeight = Math.max(streakSectionY + streakHeight, langListHeight);
  const height = contentHeight + 55;

  // Build stats SVG.
  const statsItems = statsData
    .map((stat, i) => {
      const y = i * lineHeight;
      const staggerDelay = (i + 3) * 150;
      return `
      <g class="stagger" style="animation-delay: ${staggerDelay}ms" transform="translate(0, ${y})">
        <svg class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
          ${stat.icon}
        </svg>
        <text class="stat bold" x="25" y="12.5">${stat.label}</text>
        <text class="stat bold" x="${leftColWidth - 40}" y="12.5" text-anchor="end">${stat.value}</text>
      </g>
    `;
    })
    .join("");

  // Build streak SVG.
  const currentDates =
    streak.currentStreak > 0
      ? formatDateRange(streak.currentStreakStart, streak.currentStreakEnd)
      : "";
  const longestDates =
    streak.longestStreak > 0
      ? formatDateRangeWithYear(
          streak.longestStreakStart,
          streak.longestStreakEnd,
        )
      : "";

  const streakCenterLeft = leftColWidth * 0.3;
  const streakCenterRight = leftColWidth * 0.7;
  const streakMid = leftColWidth * 0.5;

  const streakSection = `
    <g transform="translate(0, ${streakSectionY})">
      <!-- Horizontal divider -->
      <line x1="0" y1="0" x2="${leftColWidth - 20}" y2="0" stroke="${borderColor}" stroke-width="1" opacity="0.5"/>

      <defs>
        <mask id="mask_ring_fire">
          <rect width="${leftColWidth}" height="${streakHeight}" fill="white"/>
          <ellipse cx="${streakCenterLeft}" cy="17" rx="11" ry="15" fill="black"/>
        </mask>
      </defs>

      <!-- Ring -->
      <g mask="url(#mask_ring_fire)">
        <circle cx="${streakCenterLeft}" cy="46" r="30" fill="none" stroke="${streakColor}" stroke-width="4"
          ${disable_animations ? "" : `class="stagger" style="animation-delay: 1500ms"`}/>
      </g>
      <!-- Fire icon -->
      <g transform="translate(${streakCenterLeft}, 6)" stroke-opacity="0"
        ${disable_animations ? "" : `class="stagger" style="animation-delay: 1650ms"`}>
        <path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/>
        <path d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z" fill="${streakColor}" stroke-opacity="0" transform="scale(0.75)"/>
      </g>
      <!-- Current streak number -->
      <text x="${streakCenterLeft}" y="52" text-anchor="middle" class="streak-number"
        ${disable_animations ? "" : `class="stagger" style="animation-delay: 1800ms"`}>${streak.currentStreak}</text>
      <!-- Current streak label -->
      <text x="${streakCenterLeft}" y="72" text-anchor="middle" class="streak-label-current"
        ${disable_animations ? "" : `style="animation-delay: 1950ms"`}>Current Streak</text>
      <!-- Current streak dates -->
      <text x="${streakCenterLeft}" y="88" text-anchor="middle" class="streak-dates">${currentDates}</text>

      <!-- Vertical divider -->
      <line x1="${streakMid}" y1="8" x2="${streakMid}" y2="90" stroke="${borderColor}" stroke-width="1" opacity="0.5"/>

      <!-- Longest streak number -->
      <text x="${streakCenterRight}" y="40" text-anchor="middle" class="streak-number"
        ${disable_animations ? "" : `class="stagger" style="animation-delay: 2100ms"`}>${streak.longestStreak}</text>
      <!-- Longest streak label -->
      <text x="${streakCenterRight}" y="60" text-anchor="middle" class="streak-label">Longest Streak</text>
      <!-- Longest streak dates -->
      <text x="${streakCenterRight}" y="78" text-anchor="middle" class="streak-dates">${longestDates}</text>
    </g>
  `;

  // Build languages SVG.
  const progressBarWidth = rightColWidth;
  // Create stacked progress bar using SVG offsets.
  let progressOffset = 0;
  const progressSegments = topLangs
    .map((lang) => {
      const percent = (lang.size / totalSize) * progressBarWidth;
      const segment = `<rect x="${progressOffset}" y="0" height="8" fill="${lang.color || "#858585"}" width="${percent}" rx="${progressOffset === 0 ? 5 : 0}" ry="${progressOffset === 0 ? 5 : 0}"/>`;
      progressOffset += percent;
      return segment;
    })
    .join("");

  const langItems = topLangs
    .map((lang, i) => {
      const percent = ((lang.size / totalSize) * 100).toFixed(2);
      const y = i * 20;
      const staggerDelay = (i + 3) * 150;
      return `
      <g class="stagger" style="animation-delay: ${staggerDelay}ms" transform="translate(0, ${y})">
        <circle cx="5" cy="6" r="5" fill="${lang.color || "#858585"}"/>
        <text x="15" y="10" class="lang-name">${lang.name} ${percent}%</text>
      </g>
    `;
    })
    .join("");

  const languagesSection = `
    <g transform="translate(${rightColX}, 0)">
      <!-- Progress bar background -->
      <rect rx="5" ry="5" x="0" y="0" width="${progressBarWidth}" height="8" fill="#ddd" opacity="0.3"/>
      <!-- Progress bar segments -->
      <svg width="${progressBarWidth}">
        ${progressSegments}
      </svg>
      <!-- Language list -->
      <g transform="translate(0, 20)">
        ${langItems}
      </g>
    </g>
  `;

  // Vertical divider between columns.
  const colDivider = `<line x1="${leftColWidth - 10}" y1="-10" x2="${leftColWidth - 10}" y2="${contentHeight}" stroke="${borderColor}" stroke-width="1" opacity="0.5"/>`;

  // CSS.
  const cssStyles = `
    .stat {
      font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: ${textColor};
    }
    @supports(-moz-appearance: auto) {
      .stat { font-size:12px; }
    }
    .stagger {
      opacity: 0;
      animation: fadeInAnimation 0.3s ease-in-out forwards;
    }
    .bold { font-weight: 700 }
    .icon {
      fill: ${iconColor};
      display: block;
    }
    .lang-name {
      font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-number {
      font: 700 24px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-label {
      font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .streak-label-current {
      font: 700 12px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${streakColor};
    }
    .streak-dates {
      font: 400 10px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: #9E9E9E;
    }
  `;

  const apostrophe = /s$/i.test(overview.name.trim()) ? "" : "s";
  const defaultTitle = `${overview.name}'${apostrophe} GitHub Statistics`;

  const card = new Card({
    customTitle: custom_title,
    defaultTitle,
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
  card.setCSS(cssStyles);

  if (disable_animations) {
    card.disableAnimations();
  }

  card.setAccessibilityLabel({
    title: defaultTitle,
    desc: `Stars: ${overview.totalStars}, Forks: ${overview.totalForks}, Contributions: ${overview.totalCommits}, Current streak: ${streak.currentStreak} days, Longest streak: ${streak.longestStreak} days`,
  });

  return card.render(`
    <svg x="0" y="0">
      <!-- Left column: stats + streak -->
      <g transform="translate(25, 0)">
        ${statsItems}
        ${streakSection}
      </g>
      <!-- Divider -->
      ${colDivider}
      <!-- Right column: languages -->
      ${languagesSection}
    </svg>
  `);
};

export { renderCombinedCard };
export default renderCombinedCard;
