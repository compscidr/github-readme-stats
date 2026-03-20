// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors } from "../common/color.js";
import { icons } from "../common/icons.js";
import { flexLayout } from "../common/render.js";
import { kFormatter } from "../common/fmt.js";

const CARD_DEFAULT_WIDTH = 450;

// Custom icons for overview card.
const overviewIcons = {
  star: icons.star,
  fork: icons.fork,
  commits: icons.commits,
  plus: `<path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>`,
  eye: `<path fill-rule="evenodd" d="M1.679 7.932c.412-.621 1.242-1.75 2.366-2.717C5.175 4.242 6.527 3.5 8 3.5c1.473 0 2.824.742 3.955 1.715 1.124.967 1.954 2.096 2.366 2.717a.119.119 0 010 .136c-.412.621-1.242 1.75-2.366 2.717C10.825 11.758 9.473 12.5 8 12.5c-1.473 0-2.825-.742-3.955-1.715-1.124-.967-1.954-2.096-2.366-2.717a.12.12 0 010-.136zM8 2c-1.981 0-3.67.992-4.933 2.078C1.797 5.169.88 6.423.43 7.1a1.542 1.542 0 000 1.798c.45.678 1.367 1.932 2.637 3.024C4.329 13.008 6.019 14 8 14c1.981 0 3.67-.992 4.933-2.078 1.27-1.091 2.187-2.345 2.637-3.023a1.542 1.542 0 000-1.798c-.45-.678-1.367-1.932-2.637-3.023C11.671 2.992 9.981 2 8 2zm0 8a2 2 0 100-4 2 2 0 000 4z"/>`,
  contribs: icons.contribs,
};

/**
 * Format a number based on the number_format option.
 *
 * @param {number} value The number to format.
 * @param {string} numberFormat The format ("short" or "long").
 * @returns {string} The formatted number.
 */
const formatNumber = (value, numberFormat) => {
  if (numberFormat === "short") {
    return String(kFormatter(value));
  }
  return value.toLocaleString("en-US");
};

/**
 * Create an overview stat row.
 *
 * @param {object} params Row parameters.
 * @param {string} params.icon The icon SVG path.
 * @param {string} params.label The stat label.
 * @param {string} params.value The formatted stat value.
 * @param {string} params.id The stat id for testing.
 * @param {number} params.index The row index.
 * @param {boolean} params.showIcons Whether to show icons.
 * @param {number} params.cardWidth The card width.
 * @returns {string} The stat row SVG.
 */
const createOverviewTextNode = ({
  icon,
  label,
  value,
  id,
  index,
  showIcons,
  cardWidth,
}) => {
  const staggerDelay = (index + 3) * 150;

  const labelOffset = showIcons ? `x="25"` : "";
  const iconSvg = showIcons
    ? `
    <svg data-testid="icon" class="icon" viewBox="0 0 16 16" version="1.1" width="16" height="16">
      ${icon}
    </svg>
  `
    : "";
  return `
    <g class="stagger" style="animation-delay: ${staggerDelay}ms" transform="translate(25, 0)">
      ${iconSvg}
      <text class="stat bold" ${labelOffset} y="12.5">${label}</text>
      <text
        class="stat bold"
        x="${cardWidth - 50}"
        y="12.5"
        text-anchor="end"
        data-testid="${id}"
      >${value}</text>
    </g>
  `;
};

/**
 * Get CSS styles for the overview card.
 *
 * @param {object} colors The colors to use.
 * @param {string} colors.textColor The text color.
 * @param {string} colors.iconColor The icon color.
 * @param {boolean} colors.show_icons Whether to show icons.
 * @returns {string} Card CSS styles.
 */
const getStyles = ({ textColor, iconColor, show_icons }) => {
  return `
    .stat {
      font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: ${textColor};
    }
    @supports(-moz-appearance: auto) {
      /* Selector detects Firefox */
      .stat { font-size:12px; }
    }
    .stagger {
      opacity: 0;
      animation: fadeInAnimation 0.3s ease-in-out forwards;
    }
    .not_bold { font-weight: 400 }
    .bold { font-weight: 700 }
    .icon {
      fill: ${iconColor};
      display: ${show_icons ? "block" : "none"};
    }
  `;
};

/**
 * Renders the overview card.
 *
 * @param {object} stats The overview stats data.
 * @param {string} stats.name User's display name.
 * @param {number} stats.totalStars Total stars.
 * @param {number} stats.totalForks Total forks.
 * @param {number} stats.totalCommits Total all-time commits.
 * @param {number} stats.linesChanged Lines of code changed.
 * @param {number} stats.repoViews Repository views (past two weeks).
 * @param {number} stats.contributedTo Repositories with contributions.
 * @param {object} options Card options.
 * @returns {string} The overview card SVG.
 */
const renderOverviewCard = (stats, options = {}) => {
  const {
    name,
    totalStars,
    totalForks,
    totalCommits,
    linesChanged,
    repoViews,
    contributedTo,
  } = stats;

  const {
    hide_title = false,
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
    show_icons = true,
    number_format = "long",
  } = options;

  const width =
    card_width && !isNaN(card_width) ? card_width : CARD_DEFAULT_WIDTH;
  const lheight = 25;

  // Returns theme based colors with proper overrides and defaults.
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

  const cssStyles = getStyles({
    textColor,
    iconColor,
    show_icons,
  });

  // Define the stat rows.
  const STATS = [
    {
      icon: overviewIcons.star,
      label: "Stars",
      value: formatNumber(totalStars, number_format),
      id: "stars",
    },
    {
      icon: overviewIcons.fork,
      label: "Forks",
      value: formatNumber(totalForks, number_format),
      id: "forks",
    },
    {
      icon: overviewIcons.commits,
      label: "All-time contributions",
      value: formatNumber(totalCommits, number_format),
      id: "commits",
    },
    {
      icon: overviewIcons.plus,
      label: "Lines of code changed",
      value: formatNumber(linesChanged, number_format),
      id: "lines_changed",
    },
    {
      icon: overviewIcons.eye,
      label: "Repository views (past two weeks)",
      value: formatNumber(repoViews, number_format),
      id: "repo_views",
    },
    {
      icon: overviewIcons.contribs,
      label: "Repositories with contributions",
      value: formatNumber(contributedTo, number_format),
      id: "contributed_to",
    },
  ];

  const statItems = STATS.map((stat, index) =>
    createOverviewTextNode({
      icon: stat.icon,
      label: stat.label,
      value: stat.value,
      id: stat.id,
      index,
      showIcons: show_icons,
      cardWidth: width,
    }),
  );

  // Calculate card height based on number of items.
  const height = 45 + (statItems.length + 1) * lheight;

  const apostrophe = /s$/i.test(name.trim()) ? "" : "s";
  const defaultTitle = `${name}'${apostrophe} GitHub Statistics`;

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
  card.setHideTitle(hide_title);
  card.setCSS(cssStyles);

  if (disable_animations) {
    card.disableAnimations();
  }

  // Accessibility labels.
  const labels = STATS.map((stat) => `${stat.label}: ${stat.value}`).join(", ");

  card.setAccessibilityLabel({
    title: `${card.title}`,
    desc: labels,
  });

  return card.render(`
    <svg x="0" y="0">
      ${flexLayout({
        items: statItems,
        gap: lheight,
        direction: "column",
      }).join("")}
    </svg>
  `);
};

export { renderOverviewCard };
export default renderOverviewCard;
