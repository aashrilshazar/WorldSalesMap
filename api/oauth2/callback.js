import { persistTokenFromCode } from '../_lib/googleAuth.js';
import { forceRefreshTickets } from '../_lib/gmailTickets.js';

export const config = {
    runtime: 'nodejs'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).send('Method Not Allowed');
    }

    const { code } = req.query;
    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        await persistTokenFromCode(code);
        await forceRefreshTickets();
        res.status(200).send('Authorization successful. You can close this window.');
    } catch (error) {
        console.error('OAuth callback error', error);
        res.status(500).send(error.message || 'Failed to complete authorization.');
    }
}
