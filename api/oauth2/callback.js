import { persistTokenFromCode } from '../_lib/googleAuth.js';
import { forceRefreshTickets } from '../_lib/gmailTickets.js';

export const config = {
    runtime: 'nodejs'
};

const POST_AUTH_REDIRECT = process.env.POST_AUTH_REDIRECT || '/';

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
        res.redirect(302, POST_AUTH_REDIRECT);
    } catch (error) {
        console.error('OAuth callback error', error);
        res.status(500).send(error.message || 'Failed to complete authorization.');
    }
}
