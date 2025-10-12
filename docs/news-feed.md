# News Feed Integration

The app now surfaces Google Custom Search headlines for the PE firm roster alongside Gmail tickets. Both the Express dev server (`/server`) and the Vercel functions (`/api`) expose a `GET /api/news` endpoint that returns a snapshot with:

- `items`: array of normalized articles (id, firm, headline, summary, source, publishedAt, url, tags[]).
- `lastUpdated`: ISO timestamp of the most recent refresh.
- `errors`: optional array of `{ firm, message }` entries if one or more firm queries failed during the refresh.

## Environment Variables

Add these to `.env` (server) and your Vercel project:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GOOGLE_CSE_ID` | Yes | - | Programmable Search Engine ID (`cx`). |
| `GOOGLE_CSE_API_KEY` | Yes | - | API key with the Custom Search JSON API enabled. |
| `GOOGLE_CSE_ID_STRICT` | optional | - | Optional news-only CX. Used first, with fallback to `GOOGLE_CSE_ID` if no hits or errors. |
| `NEWS_SEARCH_TEMPLATE` | optional | `"<firm name>" ("fund" OR "funds" OR "raises" OR "closed" OR "deal" OR "acquisition" OR "promotes" OR "hire" OR "joins")` | Base query template; `<firm name>` placeholder is replaced per firm. |
| `NEWS_RESULTS_PER_FIRM` | optional | `1` | Max articles returned per firm each refresh. |
| `NEWS_FETCH_BATCH_SIZE` | optional | `10` | Number of raw search results requested from Google before trimming. |
| `NEWS_REFRESH_HOURS` (server) | optional | `3` | Interval between scheduled refreshes in the long-running Express server. |
| `NEWS_REFRESH_SECONDS` (Vercel) | optional | `10800` | Cache TTL for serverless refreshes; a new fetch triggers once stale. |
| `NEWS_DATE_RESTRICT` | optional | `d1` | Custom Search `dateRestrict` parameter (e.g. `d1`, `w1`). |
| `NEWS_SORT` | optional | `date` | Set to `date` when your CX has Result Sorting enabled; leave blank to disable. |
| `NEWS_GL` | optional | `us` | Two-letter geo bias for Custom Search. |
| `NEWS_HL` | optional | `en` | Interface language bias for Custom Search. |
| `NEWS_SAFE` | optional | `off` | Custom Search safe-search flag (`off`, `medium`, `high`). |
| `NEWS_EXCLUDE_TERMS` | optional | JSON or comma list | Global headline/body phrases to drop (defaults filter out hiring, rumor, promo copy). |
| `NEWS_NEGATIVE_SITE_EXCLUDES` | optional | JSON or comma list | Sites to exclude across every query (defaults remove job boards / ATS hosts). |
| `NEWS_REQUEST_INTERVAL_MS` | optional | `3000` | Minimum delay between Google Custom Search calls to stay under per-minute quotas. |
| `NEWS_REQUEST_MAX_RETRIES` | optional | `3` | Number of times to retry quota errors with exponential backoff. |
| `NEWS_REQUEST_BACKOFF_MS` | optional | `15000` | Base backoff (ms) applied before retrying after a quota error. |

Environment list values can be provided as JSON arrays (recommended) or comma-separated strings.

## Refresh Behaviour

- **Express (local/server deploys):** runs an initial fetch at startup and repeats every `NEWS_REFRESH_HOURS`. Requests always return the most recent successful snapshot. Google API calls are rate limited between firms to avoid per-minute quota limits.
- **Vercel (`api/news`):** caches results for `NEWS_REFRESH_SECONDS`. Each refresh fans out across dedicated fund/deal/hire/promotion queries per firm, tries a strict CX first (if provided), then falls back to the broader CX while honoring the same rate limits. Pass `?refresh=1` to bypass the cache and force a new fetch (still subject to Google API quota).

## Firm Coverage

The firm list lives in `shared/newsFirms.js`. Update it to add or remove targets; both server and serverless functions will pick up the changes automatically after redeploy/restart.
