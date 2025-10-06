import express from 'express';
import { PORT, validateConfig } from './config.js';
import { fetchInboxTickets } from './gmail.js';

validateConfig();

const app = express();

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/tickets', async (_req, res) => {
    try {
        const tickets = await fetchInboxTickets();
        res.json({ tickets });
    } catch (error) {
        console.error('Failed to load Gmail tickets', error);
        res.status(500).json({ error: error.message || 'Failed to load Gmail tickets' });
    }
});

app.listen(PORT, () => {
    console.log(`Ticket server running on http://localhost:${PORT}`);
});
