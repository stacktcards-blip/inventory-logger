import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

const clientId = process.env.GMAIL_CLIENT_ID ?? '';
const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? '';
const refreshToken = process.env.GMAIL_REFRESH_TOKEN ?? '';
const redirectUri = process.env.GMAIL_REDIRECT_URI ?? 'urn:ietf:wg:oauth:2.0:oob';

if (!clientId || !clientSecret || !refreshToken) {
  throw new Error('Missing Gmail OAuth env vars');
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

oauth2Client.setCredentials({ refresh_token: refreshToken });

export const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

export const listMessages = async (query: string) => {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50
  });
  return response.data.messages ?? [];
};

export const getMessage = async (messageId: string): Promise<gmail_v1.Schema$Message> => {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  return response.data;
};
