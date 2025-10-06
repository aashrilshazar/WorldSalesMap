import { fetchTickets } from '../_lib/fetchTickets.js';
import { validateConfig } from '../_lib/config.js';

export const config = {
    runtime: 'nodejs'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        validateConfig();
        const tickets = await fetchTickets();
        res.status(200).json({ tickets });
    } catch (error) {
        console.error('Failed to fetch Gmail tickets:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch Gmail tickets' });
    }
}
