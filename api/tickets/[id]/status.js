import { validateConfig } from '../../_lib/config.js';
import { setTicketStatus, clearTicketStatus } from '../../_lib/storage.js';
import { invalidateTicketCache } from '../../_lib/fetchTickets.js';

export const config = {
    runtime: 'nodejs'
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        validateConfig();
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Missing ticket id' });
    }

    let payload = {};
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch (error) {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { status } = payload;
    if (!status || !['resolved', 'open', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be one of resolved, open, dismissed' });
    }

    try {
        if (status === 'open') {
            await clearTicketStatus(id);
        } else {
            await setTicketStatus(id, { status });
        }
        invalidateTicketCache();
        res.status(200).json({ ticket: { id, status } });
    } catch (error) {
        console.error('Failed to persist ticket status', error);
        res.status(500).json({ error: 'Failed to persist ticket status' });
    }
}
