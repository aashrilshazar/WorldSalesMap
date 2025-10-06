import { google } from 'googleapis';
import {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
} from './config.js';
import { loadTokens, saveTokens } from './tokenStore.js';

let oauthClient;

export async function getOAuthClient() {
    if (oauthClient) {
        return oauthClient;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Missing Google OAuth client credentials environment variables.');
    }

    oauthClient = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    const tokens = await loadTokens();
    if (tokens) {
        oauthClient.setCredentials(tokens);
    }

    oauthClient.on('tokens', async newTokens => {
        if (newTokens.refresh_token || newTokens.access_token) {
            const merged = {
                ...oauthClient.credentials,
                ...newTokens
            };
            await saveTokens(merged);
        }
    });

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
    await saveTokens(tokens);
    return tokens;
}
