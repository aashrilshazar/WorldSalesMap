# WorldSalesMap Gmail Ticket Server (Single Inbox)

Local Express server that fetches inbound Gmail messages for one inbox and exposes them at `/api/tickets`.

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
3. Start the API:
   ```bash
   npm start
   ```
4. Visit `http://localhost:4000/api/tickets` to confirm JSON is returned. The main app can then fetch from the same route.

## Notes

- The server refreshes access tokens automatically using the provided refresh token.
- Results are fetched live from Gmail each request; add caching later if needed.
- For additional inboxes, supply separate credential sets or extend the server to loop through multiple refresh tokens.
