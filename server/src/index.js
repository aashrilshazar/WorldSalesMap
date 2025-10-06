import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SERVER_PORT,
    FRONTEND_ORIGIN
} from './config.js';
import { gmailScopes, ensureTicketsSynced } from './gmailTickets.js';
import { generateAuthUrl, persistTokenFromCode } from './googleAuth.js';
import { markTicketResolved, reopenTicket } from './ticketStore.js';

const app = express();
app.use(express.json());
app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true
}));

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/auth/google/url', async (_req, res, next) => {
    try {
        const url = await generateAuthUrl(gmailScopes);
        res.json({ url });
    } catch (err) {
        next(err);
    }
});

app.get('/oauth2/callback', async (req, res, next) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
    }

    try {
        await persistTokenFromCode(code);
        await ensureTicketsSynced({ force: true });
        res.send('Authorization successful. You can close this window.');
    } catch (err) {
        next(err);
    }
});

app.get('/api/tickets', async (_req, res, next) => {
    try {
        const tickets = await ensureTicketsSynced();
        res.json({ tickets });
    } catch (err) {
        if (err && /authorize/i.test(err.message)) {
            return res.status(401).json({ error: err.message });
        }
        next(err);
    }
});

app.post('/api/tickets/:id/resolve', (req, res) => {
    const ticket = markTicketResolved(req.params.id);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json({ ticket });
});

app.post('/api/tickets/:id/reopen', (req, res) => {
    const ticket = reopenTicket(req.params.id);
    if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json({ ticket });
});

// Periodic sync in the background
setInterval(() => {
    ensureTicketsSynced().catch(err => {
        console.error('Background sync failed:', err.message);
    });
}, 90_000).unref();

// Simple static reference for running alongside the front-end build
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.resolve(__dirname, '../../');
app.use(express.static(staticDir));

// Error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(SERVER_PORT, () => {
    console.log(`WorldSalesMap server listening on port ${SERVER_PORT}`);
});
