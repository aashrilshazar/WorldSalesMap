import { markTicketResolved } from '../../_lib/ticketStore.js';
import { fetchTickets } from '../../_lib/gmailTickets.js';

export const config = {
    runtime: 'nodejs18.x'
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: 'Missing ticket id' });
    }

    try {
        await markTicketResolved(id);
        const tickets = await fetchTickets();
        const ticket = tickets.find(t => t.id === id) || null;
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        res.status(200).json({ ticket });
    } catch (error) {
        console.error(`Failed to resolve ticket ${id}`, error);
        res.status(500).json({ error: error.message || 'Failed to resolve ticket' });
    }
}
