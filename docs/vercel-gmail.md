# Gmail Tickets via Vercel Functions

The front-end fetches tickets from `/api/tickets`, which runs on Vercel serverless functions using stored Gmail refresh tokens.

## Environment Variables

Set these in Vercel (project → Settings → Environment Variables) and locally via `.env` if using `vercel dev`:

| Variable | Description |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID (same as the one used to obtain refresh tokens) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_ACCOUNTS` | Comma-separated list of inbox addresses to poll (e.g. `dani@keye.co`) |
| `GMAIL_REFRESH_TOKENS` | JSON object mapping each inbox to its refresh token, e.g. `{"dani@keye.co":"refresh_token_here"}` |
| `GMAIL_QUERIES` | JSON object of per-inbox Gmail queries (optional). Example: `{"default":"newer_than:1d","dani@keye.co":"label:INBOX newer_than:1d"}` |
| `GMAIL_MAX_RESULTS` | Max messages to fetch per inbox (default 20) |
| `GMAIL_CACHE_SECONDS` | Cache duration in seconds to reduce API calls (default 60) |

## How It Works

- Each request to `/api/tickets` checks the in-memory cache; if stale, it refreshes messages for every inbox listed in `GMAIL_ACCOUNTS` using the stored refresh tokens.
- Messages are normalized with sender info, domain-derived firm name, and Gmail threadURL, then returned to the front-end.
- Extend `GMAIL_REFRESH_TOKENS` and `GMAIL_ACCOUNTS` to add more inboxes; each needs its own refresh token generated via the OAuth Playground.

Redeploy after updating environment variables so the new values reach the functions.
