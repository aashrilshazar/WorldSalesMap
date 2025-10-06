# Gmail Tickets via Vercel Functions

The front-end fetches tickets from `/api/tickets`, which runs on Vercel serverless functions using stored Gmail credentials and refresh tokens.

## Environment Variables

Set these in Vercel (project → Settings → Environment Variables) and locally via `.env` if using `vercel dev`:

| Variable | Description |
| --- | --- |
| `GMAIL_CREDENTIALS_JSON` | JSON map of inbox → `{ clientId, clientSecret, refreshToken }` |
| `GMAIL_QUERIES` | JSON object of per-inbox Gmail queries (optional). Example: `{"default":"newer_than:1d","dani@keye.co":"label:INBOX newer_than:1d"}` |
| `GMAIL_MAX_RESULTS` | Max messages to fetch per inbox (default 20) |
| `GMAIL_CACHE_SECONDS` | Cache duration in seconds to reduce API calls (default 60) |
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis REST token |

A sample `GMAIL_CREDENTIALS_JSON` for multiple inboxes:

```json
{
  "dani@keye.co": {
    "clientId": "...",
    "clientSecret": "...",
    "refreshToken": "..."
  },
  "rodney@keye.co": {
    "clientId": "...",
    "clientSecret": "...",
    "refreshToken": "..."
  }
}
```

## How It Works

- Each request to `/api/tickets` checks the in-memory cache; if stale, it refreshes messages for every inbox listed in `GMAIL_CREDENTIALS_JSON` using the stored credentials.
- Messages are normalized with sender info, domain-derived firm name, and Gmail thread URL, and merged with persisted resolve/dismiss decisions from Upstash before returning to the front-end.
- Updates from the UI hit `/api/tickets/:id/status` which writes to Upstash so changes are shared across sessions.
- To add more inboxes, append their credential objects to `GMAIL_CREDENTIALS_JSON` and redeploy.

Redeploy after updating environment variables so the new values reach the functions.
