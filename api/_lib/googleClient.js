import { google } from 'googleapis';
import { getCredentialsForInbox } from './config.js';

const clients = new Map();

export function getOAuthClientForInbox(inbox) {
    if (clients.has(inbox)) {
        return clients.get(inbox);
    }

    const credentials = getCredentialsForInbox(inbox);
    if (!credentials) {
        throw new Error(`Missing Gmail credentials for ${inbox}`);
    }

    const client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        'https://developers.google.com/oauthplayground'
    );

    client.setCredentials({ refresh_token: credentials.refreshToken });
    clients.set(inbox, client);
    return client;
}
