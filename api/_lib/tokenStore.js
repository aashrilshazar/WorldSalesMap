import fs from 'node:fs/promises';
import path from 'node:path';
import { kv } from '@vercel/kv';
import { KV_TOKEN_KEY } from './config.js';

const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const tokenPath = process.env.GOOGLE_TOKEN_PATH;

export async function loadTokens() {
    if (hasKv) {
        try {
            return await kv.get(KV_TOKEN_KEY);
        } catch (error) {
            console.error('KV get token failed', error);
            throw error;
        }
    }

    if (process.env.GOOGLE_TOKEN_JSON) {
        try {
            return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
        } catch (error) {
            console.warn('Failed to parse GOOGLE_TOKEN_JSON', error);
        }
    }

    if (tokenPath) {
        try {
            const raw = await fs.readFile(tokenPath, 'utf8');
            return JSON.parse(raw);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Failed to read local token file', error);
            }
        }
    }

    return null;
}

export async function saveTokens(tokens) {
    if (!tokens) return;

    if (hasKv) {
        await kv.set(KV_TOKEN_KEY, tokens);
        return;
    }

    if (tokenPath) {
        await fs.mkdir(path.dirname(tokenPath), { recursive: true }).catch(() => {});
        await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
        return;
    }

    throw new Error('No token storage backend configured. Set Vercel KV or GOOGLE_TOKEN_PATH.');
}
