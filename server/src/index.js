import express from 'express';
import { PORT, validateConfig } from './config.js';
import { fetchInboxTickets } from './gmail.js';
import { getNewsSnapshot, startNewsScheduler } from './news.js';

validateConfig();

const app = express();

startNewsScheduler();

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

app.get('/api/news', async (_req, res) => {
    try {
        const snapshot = await getNewsSnapshot();
        res.json(snapshot);
    } catch (error) {
        console.error('Failed to load news snapshot', error);
        res.status(500).json({ error: error.message || 'Failed to load news snapshot' });
    }
});

app.listen(PORT, () => {
    console.log(`Ticket server running on http://localhost:${PORT}`);
});
