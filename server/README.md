# WorldSalesMap Gmail Ticket Server (Single Inbox)

Local Express server that fetches inbound Gmail messages for one inbox and exposes them at `/api/tickets`, and now also maintains a scheduled Google Custom Search feed at `/api/news`.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your OAuth client JSON.
   - `GOOGLE_REFRESH_TOKEN` obtained via the OAuth Playground.
   - `GMAIL_USER` set to `dani@keye.co` (or whichever inbox you are configuring).
   - Optional: tweak `GMAIL_QUERY` and `GMAIL_MAX_RESULTS`.
2. Install dependencies:
   ```bash
   cd server
   npm install
   ```
3. Provide Google Custom Search credentials via the same `.env` file:
   - `GOOGLE_CSE_ID` — Programmable Search Engine (CSE) ID (`cx`).
   - `GOOGLE_CSE_API_KEY` — API key enabled for the Custom Search JSON API.
   - Optional overrides:
     - `NEWS_SEARCH_TEMPLATE` to tweak the base query (defaults to the provided fund/deal keyword set).
     - `NEWS_RESULTS_PER_FIRM` (default `3`), `NEWS_FETCH_BATCH_SIZE` (default `10`), `NEWS_REFRESH_HOURS` (default `3`).
4. Start the API:
   ```bash
   npm start
   ```
5. Visit `http://localhost:4000/api/tickets` and `http://localhost:4000/api/news` to confirm JSON is returned. The main app can then fetch from the same routes.

## Notes

- The server refreshes access tokens automatically using the provided refresh token.
- Gmail results are fetched live on each request; add caching later if needed.
- News results are refreshed every `NEWS_REFRESH_HOURS` (default 3h) in the background and served from in-memory cache between refreshes.
- For additional inboxes, supply separate credential sets or extend the server to loop through multiple refresh tokens.
