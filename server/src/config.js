import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH
    || path.resolve(__dirname, '../credentials/oauth-client.json');

export const GOOGLE_TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH
    || path.resolve(__dirname, '../credentials/oauth-token.json');

export const GMAIL_INBOX_USER = process.env.GMAIL_INBOX_USER || 'me';
export const GMAIL_FETCH_QUERY = process.env.GMAIL_FETCH_QUERY
    || 'is:inbox -category:{promotions social}';
export const GMAIL_MAX_RESULTS = Number(process.env.GMAIL_MAX_RESULTS || 50);

export const SERVER_PORT = Number(process.env.PORT || 4000);

export const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 60_000);

export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
