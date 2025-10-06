import { gmailScopes } from '../../_lib/gmailTickets.js';
import { generateAuthUrl } from '../../_lib/googleAuth.js';

export const config = {
    runtime: 'nodejs18.x'
};

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const url = await generateAuthUrl(gmailScopes);
        res.status(200).json({ url });
    } catch (error) {
        console.error('Failed to create Google auth URL', error);
        res.status(500).json({ error: error.message || 'Unable to generate auth URL' });
    }
}
