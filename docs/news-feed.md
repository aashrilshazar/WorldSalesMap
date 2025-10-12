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
| `NEWS_RESULTS_PER_FIRM` | optional | `3` | Max articles returned per firm each refresh. |
| `NEWS_FETCH_BATCH_SIZE` | optional | `10` | Number of raw search results requested from Google before trimming. |
| `NEWS_REFRESH_HOURS` (server) | optional | `3` | Interval between scheduled refreshes in the long-running Express server. |
| `NEWS_DATE_RESTRICT` | optional | `d1` | Custom Search `dateRestrict` parameter (e.g. `d1`, `w1`). |
| `NEWS_SORT` | optional | `date` | Set to `date` when your CX has Result Sorting enabled; leave blank to disable. |
| `NEWS_GL` | optional | `us` | Two-letter geo bias for Custom Search. |
| `NEWS_HL` | optional | `en` | Interface language bias for Custom Search. |
| `NEWS_SAFE` | optional | `off` | Custom Search safe-search flag (`off`, `medium`, `high`). |
| `NEWS_EXCLUDE_TERMS` | optional | JSON or comma list | Global headline/body phrases to drop (defaults filter out hiring, rumor, promo copy). |
| `NEWS_NEGATIVE_SITE_EXCLUDES` | optional | JSON or comma list | Sites to exclude across every query (defaults remove job boards / ATS hosts). |
| `NEWS_FIRMS_PER_BATCH` | optional | `15` | Number of firms processed per refresh invocation (controls pacing and quota usage). |
| `NEWS_JOB_TTL_SECONDS` | optional | `86400` | How long to keep refresh job state in Upstash before it expires. |
| `NEWS_SNAPSHOT_TTL_SECONDS` | optional | `86400` | TTL for the aggregated news snapshot stored in Upstash. |
| `NEWS_REQUEST_INTERVAL_MS` | optional | `3000` | Minimum delay between Google Custom Search calls to stay under per-minute quotas. |
| `NEWS_REQUEST_MAX_RETRIES` | optional | `3` | Number of times to retry quota errors with exponential backoff. |
| `NEWS_REQUEST_BACKOFF_MS` | optional | `15000` | Base backoff (ms) applied before retrying after a quota error. |

Environment list values can be provided as JSON arrays (recommended) or comma-separated strings.

Refresh progress and the aggregated snapshot are persisted in the existing Upstash Redis instance (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Ensure those credentials are available anywhere you deploy the news API.

## Refresh Behaviour

- **Express (local/server deploys):** runs an initial fetch at startup and repeats every `NEWS_REFRESH_HOURS`. Requests always return the most recent successful snapshot. Google API calls are rate limited between firms to avoid per-minute quota limits.
- **Vercel (`api/news`):** processes refresh jobs in small batches (see `NEWS_FIRMS_PER_BATCH`). Each call adds another slice of firms, persisting progress and interim results in Upstash so users see headlines stream in while staying well under timeout and quota limits. Pass `?refresh=1` to advance the job; cached snapshots continue to serve immediately.
- **Client UI:** stores the last snapshot in local storage and only triggers a new fetch when the operator clicks the Refresh button. While a refresh job is running it polls the API on a timer, so the feed gradually fills without hammering the backend.
- A full roster (≈700 firms) will take multiple minutes to process. Leave the tab open; each poll advances another batch and updates the displayed progress.
- Use the **Export CSV** button in the news bar (or call `/api/news?format=csv`) to download the current snapshot including firm, headline, URL, source, timestamp, summary, and tags. The export reflects whatever data is cached at the moment you trigger it.

### API Response

`GET /api/news` now returns the fields shown below. The client uses `status` and `job` to drive the progressive refresh experience.

| Field | Description |
| --- | --- |
| `items` | Normalized articles (unchanged). |
| `lastUpdated` | Timestamp of the most recent successful batch write. |
| `errors` | Array of `{ firm, message, at }` for firms that failed in any batch. |
| `status` | `'idle'`, `'running'`, `'complete'`, or `'error'` depending on job state. |
| `job` | Progress metadata (`id`, `totalFirms`, `processedFirms`, `percentComplete`, timestamps). |
| `batch` | Present only on refresh requests; summarises the firms processed in the latest slice. |

## Firm Coverage

The firm list lives in `shared/newsFirms.js`. Update it to add or remove targets; both server and serverless functions will pick up the changes automatically after redeploy/restart.
