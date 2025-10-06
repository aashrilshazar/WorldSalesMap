# Legacy Local Gmail Ticket Server

The project now uses Vercel serverless functions for Gmail ingestion. See `docs/vercel-serverless.md` for the production setup.

The files in this `server/` directory are kept only for reference if you need a traditional Express server during local experiments. The code is no longer deployed.

> Prefer the Vercel functions under `/api/*` unless you have a specific need for a standalone Node server.
