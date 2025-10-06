import { google } from 'googleapis';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './config.js';

const clients = new Map();

export function getOAuthClient(refreshToken) {
    if (!refreshToken) {
        throw new Error('Missing Gmail refresh token');
    }

    if (clients.has(refreshToken)) {
        return clients.get(refreshToken);
    }

    const client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );

    client.setCredentials({ refresh_token: refreshToken });
    clients.set(refreshToken, client);
    return client;
}
