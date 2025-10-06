# Vercel Serverless Gmail Tickets Backend

The Gmail ticket ingestion now runs as Vercel serverless functions. This replaces the long-running Express server.

## Required Environment Variables

Configure these under **Vercel → Settings → Environment Variables** (and in a local `.env` when using `vercel dev`).

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Must contain `https://<your-domain>/api/oauth2/callback` (add localhost variant for local dev) |
| `POST_AUTH_REDIRECT` | Optional URL to send users back to after OAuth completes (defaults to `/`) |
| `GMAIL_INBOX_USER` | Gmail user to monitor (usually `me`) |
| `GMAIL_FETCH_QUERY` | Gmail search query to filter inbound mail |
| `GMAIL_MAX_RESULTS` | Cap on messages pulled per refresh (default 50) |
| `SYNC_INTERVAL_MS` / `CACHE_TTL_MS` | Cache duration for Gmail responses (defaults 60s) |
| `KV_REST_API_URL` & `KV_REST_API_TOKEN` | Vercel KV (Upstash) credentials for token + ticket status persistence |
| `KV_TICKET_STATUS_KEY`, `KV_TICKET_CACHE_KEY`, `KV_TOKEN_KEY` | Optional overrides for KV key names |

For local-only development you can skip Vercel KV by providing `GOOGLE_TOKEN_PATH` (a writable file path) to persist refresh tokens, but production deployments must use durable storage.

Install dependencies once:

```bash
npm install
```

## OAuth Consent Flow

1. Deploy (or run `vercel dev`) so the API routes are live.
2. Visit `/api/auth/google/url` (e.g. `http://localhost:3000/api/auth/google/url`).
3. Open the returned URL in a browser, complete the consent screen, and allow Gmail access.
4. Google redirects back to `/api/oauth2/callback`; the function stores tokens in KV and refreshes the ticket cache.

The sidebar will now load live Gmail data from `/api/tickets`. If the token expires or is revoked, the sidebar shows a "Connect Gmail" prompt that re-runs this flow.

## API Overview

Endpoint | Method | Description
--- | --- | ---
`/api/tickets` | GET | Returns cached Gmail tickets (refreshes when cache expires)
`/api/tickets/:id/resolve` | POST | Marks a ticket resolved (status persisted in KV)
`/api/tickets/:id/reopen` | POST | Reopens a ticket
`/api/auth/google/url` | GET | Generates a consent URL
`/api/oauth2/callback` | GET | Handles the OAuth redirect and stores the tokens

All routes run on the Node.js runtime (`nodejs18.x`) to support the Google SDK.

## Notes

- Serverless functions re-use cached Gmail data for `CACHE_TTL_MS` to stay within API quotas.
- Ticket resolve/reopen state is persisted independently so it survives function cold starts.
- No background timers are used; each request performs conditional syncing and updates the cache when needed.
