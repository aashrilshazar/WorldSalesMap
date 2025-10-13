import { fetchNews, cancelNewsJob, clearNewsData } from '../_lib/fetchNews.js';
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

        const { refresh, format, cancel, clear } = req.query || {};
        const forceRefresh = refresh === '1' || refresh === 'true';
        const desiredFormat = typeof format === 'string' ? format.toLowerCase() : '';
        const cancelRequested = cancel === '1' || cancel === 'true';
        const clearRequested = clear === '1' || clear === 'true';

        if (clearRequested) {
            const snapshot = await clearNewsData();
            return res.status(200).json(snapshot);
        }

        if (cancelRequested) {
            const snapshot = await cancelNewsJob();
            return res.status(200).json(snapshot);
        }

        const snapshot = await fetchNews(forceRefresh);
        if (desiredFormat === 'csv') {
            const csv = buildNewsCsv(snapshot.items || []);
            const filename = `news-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.status(200).send(csv);
        }

        res.status(200).json(snapshot);
    } catch (error) {
        console.error('Failed to fetch news snapshot:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch news snapshot' });
    }
}

function buildNewsCsv(items) {
    const rows = Array.isArray(items) ? items : [];
    const header = ['Firm', 'Headline', 'URL', 'Source', 'PublishedAt', 'Summary', 'Tags'];

    const escape = value => {
        if (value == null) return '""';
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
    };

    const lines = [header.map(escape).join(',')];

    for (const item of rows) {
        const tags = Array.isArray(item?.tags) ? item.tags.join('; ') : '';
        lines.push([
            escape(item?.firm || ''),
            escape(item?.headline || ''),
            escape(item?.url || ''),
            escape(item?.source || ''),
            escape(item?.publishedAt || ''),
            escape(item?.summary || ''),
            escape(tags)
        ].join(','));
    }

    return lines.join('\n');
}
