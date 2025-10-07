import { fetchNews } from '../_lib/fetchNews.js';
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
        validateConfig({ requireGmail: false, requireNews: true });

        const { refresh } = req.query || {};
        const forceRefresh = refresh === '1' || refresh === 'true';

        const snapshot = await fetchNews(forceRefresh);
        res.status(200).json(snapshot);
    } catch (error) {
        console.error('Failed to fetch news snapshot:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch news snapshot' });
    }
}
