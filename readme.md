# GitHub Readme Stats (Fork)
If you have 100+ repos including private ones, the existing solutions are either slow or incomplete. This fork fixes both.

A fork of [anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats) that combines the best of three projects:

- **[anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats)** — Fast GraphQL-based stats cards, but can't access private repo language data.
- **[jstrieb/github-stats](https://github.com/jstrieb/github-stats)** — REST-based GitHub Actions that can access private repos, but hammers the API with sequential per-repo requests, causing rate limiting and unpredictable run times.
- **[DenverCoder1/github-readme-streak-stats](https://github.com/DenverCoder1/github-readme-streak-stats)** — Contribution streak cards via an external service.

This fork uses **GraphQL for live stats cards** (served via Vercel) and **REST only where GraphQL falls short** (via a daily GitHub Action) for accurate language breakdowns across public and private repos. Streak stats are calculated directly from GitHub's contribution calendar — no external service needed.

<img src="https://github-readme-stats-navy-three-39.vercel.app/api/combined/?username=compscidr&theme=dark&lang_count=10" />

## Endpoints

This fork adds the following endpoints on top of the [original ones](https://github.com/anuraghazra/github-readme-stats):

| Endpoint | Description |
|----------|-------------|
| `/api/combined` | All-in-one card: stats + streaks + top languages |
| `/api/overview` | Stars, forks, contributions, lines changed, views, repos |
| `/api/streak` | Current and longest contribution streaks with dates |
| `/api/top-langs?debug=true` | JSON debug output with per-repo language breakdown |

All original endpoints (`/api`, `/api/top-langs`, `/api/pin`, `/api/gist`, `/api/wakatime`) still work. See the [upstream docs](https://github.com/anuraghazra/github-readme-stats) for their full options.

## Setup

### 1. Fork and deploy to Vercel

Fork this repo and deploy to [Vercel](https://vercel.com). Add these environment variables:

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `PAT_1` | Secret | Yes | GitHub PAT with `repo` scope |
| `GIST_ID` | Plain | Yes | ID of a public gist (see step 2) |
| `FETCH_MULTI_PAGE_STARS` | Plain | Yes | Set to `true` |
| `WHITELIST` | Plain | Recommended | Your GitHub username (prevents others using your instance) |

### 2. Create a public gist

Create a **public** gist with a file called `github-stats.json`:

```json
{ "linesChanged": 0, "repoViews": 0, "updatedAt": "" }
```

The gist ID is the hash in the URL. The GitHub Action populates this daily with stats that are too expensive to compute on each request.

### 3. Configure GitHub Actions

In your fork's repo settings, add:

| Name | Where | Description |
|------|-------|-------------|
| `GH_TOKEN` | Secret | GitHub PAT with `repo` + `gist` scopes |
| `GIST_ID` | Variable | Same gist ID as above |
| `USERNAME` | Variable | Your GitHub username |

The **Update GitHub Stats Cache** workflow runs daily at 5 AM UTC and computes lines of code changed, repository views, stars, forks, contributions, and repo count — then writes them to the gist. It also runs automatically when the script or workflow file changes.

### 4. Trigger the first run

Go to Actions > Update GitHub Stats Cache > Run workflow. After it completes, your cards will have data.

## Usage

Replace `YOUR_VERCEL_URL` with your Vercel deployment URL.

### Combined card

```md
![Stats](https://YOUR_VERCEL_URL/api/combined?username=YOUR_USERNAME&theme=dark)
```

### Individual cards

```html
<img height="180" src="https://YOUR_VERCEL_URL/api/streak?username=YOUR_USERNAME&theme=dark" />
<img height="180" src="https://YOUR_VERCEL_URL/api/overview?username=YOUR_USERNAME&theme=dark" />
<img height="180" src="https://YOUR_VERCEL_URL/api/top-langs/?username=YOUR_USERNAME&theme=dark&layout=compact&langs_count=10&hide=html" />
```

All cards support theming — see the [upstream theme list](https://github.com/anuraghazra/github-readme-stats/blob/master/themes/README.md).

## Architecture

```
Vercel (live, on request)
  ├── /api/overview      GraphQL: stars, forks, contributions, repos
  ├── /api/streak        GraphQL: contribution calendar → streaks
  ├── /api/top-langs     GraphQL: language data with pagination
  └── /api/combined      Gist (cached stats) + live streak + live langs

GitHub Action (daily)
  ├── REST: /repos/{repo}/stats/contributors → lines changed
  ├── REST: /repos/{repo}/traffic/views → repo views
  ├── GraphQL: stars, forks, contributions, repos
  └── Writes results to public gist
```

## Caching

Vercel caches card responses to avoid hitting GitHub's API on every request:

| Card | Default | Min | Max |
|------|---------|-----|-----|
| Stats / Overview / Streak / Combined | 24 hours | 12 hours | 48 hours |
| Top Languages | 6 days | 2 days | 10 days |

You can override the default with `&cache_seconds=N` in the URL, but it will be clamped to the min/max range.

After the daily GitHub Action updates the gist, it can take up to 24 hours for the combined card to reflect new data due to Vercel's edge cache. Adding a cache-busting parameter (e.g. `&v=2`) will force a fresh render.

## Debugging

The GitHub Action logs progress per-repo during the daily run, making it easy to identify which repos are slow or hitting API errors. You can also use the debug endpoint:

```
/api/top-langs?debug=true&username=YOUR_USERNAME
```

This returns JSON with the total repo count, repos after filtering, and a per-repo language breakdown — useful for tuning your `EXCLUDE_REPO` list or figuring out why your language stats look off.

## License

[MIT](./LICENSE) — Based on work by [Anurag Hazra](https://github.com/anuraghazra), [Jacob Strieb](https://github.com/jstrieb), and [Jonah Lawrence](https://github.com/DenverCoder1).
