import { fetchTickets } from '../_lib/gmailTickets.js';

export const config = {
    runtime: 'nodejs'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const tickets = await fetchTickets();
        res.status(200).json({ tickets });
    } catch (error) {
        console.error('Failed to fetch tickets', error);
        if (error && /authorize/i.test(error.message)) {
            return res.status(401).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Failed to load tickets' });
    }
}
