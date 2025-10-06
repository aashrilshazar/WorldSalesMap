import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { GOOGLE_CREDENTIALS_PATH, GOOGLE_TOKEN_PATH } from './config.js';

let oauthClient = null;

export async function getOAuthClient() {
    if (oauthClient) return oauthClient;

    const content = await readFileIfExists(GOOGLE_CREDENTIALS_PATH);
    if (!content) {
        throw new Error(`Google OAuth client credentials not found at ${GOOGLE_CREDENTIALS_PATH}`);
    }

    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web || {};
    if (!client_id || !client_secret) {
        throw new Error('Invalid Google OAuth client JSON structure.');
    }

    oauthClient = new google.auth.OAuth2(
        client_id,
        client_secret,
        (redirect_uris && redirect_uris[0]) || 'http://localhost:4000/oauth2/callback'
    );

    const token = await readFileIfExists(GOOGLE_TOKEN_PATH);
    if (token) {
        oauthClient.setCredentials(JSON.parse(token));
    }

    return oauthClient;
}

export async function generateAuthUrl(scopes) {
    const client = await getOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: scopes
    });
}

export async function persistTokenFromCode(code) {
    const client = await getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const tokenDir = path.dirname(GOOGLE_TOKEN_PATH);
    await fs.mkdir(tokenDir, { recursive: true }).catch(() => {});
    await fs.writeFile(GOOGLE_TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    return tokens;
}

async function readFileIfExists(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}
