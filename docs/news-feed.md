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
| `NEWS_SEARCH_TEMPLATE` | optional | `"<firm name>" ("fund" OR "funds" OR "raises" OR "closed" OR "deal" OR "acquisition" OR "promotes" OR "hire" OR "joins")` | Base query template; `<firm name>` placeholder is replaced per firm. |
| `NEWS_RESULTS_PER_FIRM` | optional | `3` | Max articles returned per firm each refresh. |
| `NEWS_FETCH_BATCH_SIZE` | optional | `10` | Number of raw search results requested from Google before trimming. |
| `NEWS_REFRESH_HOURS` (server) | optional | `3` | Interval between scheduled refreshes in the long-running Express server. |
| `NEWS_REFRESH_SECONDS` (Vercel) | optional | `10800` | Cache TTL for serverless refreshes; a new fetch triggers once stale. |

## Refresh Behaviour

- **Express (local/server deploys):** runs an initial fetch at startup and repeats every `NEWS_REFRESH_HOURS`. Requests always return the most recent successful snapshot.
- **Vercel (`api/news`):** caches results for `NEWS_REFRESH_SECONDS`. Pass `?refresh=1` to bypass the cache and force a new fetch (still subject to Google API quota).

## Firm Coverage

The firm list lives in `shared/newsFirms.js`. Update it to add or remove targets; both server and serverless functions will pick up the changes automatically after redeploy/restart.
