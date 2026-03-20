import { renderCombinedCard } from "../src/cards/combined.js";
import { writeFileSync } from "fs";

const mockData = {
  overview: {
    name: "Jason Ernst",
    totalStars: 1878,
    totalForks: 243,
    totalCommits: 25963,
    linesChanged: 9604194,
    repoViews: 5487,
    contributedTo: 167,
  },
  streak: {
    currentStreak: 11,
    currentStreakStart: "2026-03-09",
    currentStreakEnd: "2026-03-19",
    longestStreak: 39,
    longestStreakStart: "2024-07-22",
    longestStreakEnd: "2024-08-29",
  },
  langs: {
    Kotlin: { name: "Kotlin", color: "#A97BFF", size: 5296 },
    C: { name: "C", color: "#555555", size: 898 },
    Shell: { name: "Shell", color: "#89e051", size: 704 },
    TypeScript: { name: "TypeScript", color: "#3178c6", size: 663 },
    Java: { name: "Java", color: "#b07219", size: 500 },
    JavaScript: { name: "JavaScript", color: "#f1e05a", size: 452 },
    Python: { name: "Python", color: "#3572A5", size: 347 },
    Go: { name: "Go", color: "#00ADD8", size: 300 },
  },
};

const svg = renderCombinedCard(mockData, {
  theme: "dark",
  langs_count: 8,
  disable_animations: true,
});

writeFileSync("preview-combined.svg", svg);
console.log("Written to preview-combined.svg");
