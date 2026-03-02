/**
 * Gmail API client for fetching PSA order emails.
 * Requires: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (OAuth2).
 * Get refresh token: GET /api/orders-new/gmail-oauth (add redirect URI to Google Cloud OAuth client first).
 */
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export type GmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  bodyPlain: string;
  bodyHtml: string | null;
};

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, undefined);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function isGmailConfigured(): boolean {
  return getOAuth2Client() !== null;
}

/** Gmail search query for "We Received Your Package" from PSA (used by Sync from Gmail). */
export const RECEIVED_PACKAGE_QUERY =
  'from:no-reply@psacard.com subject:"We Received Your Package"';

/** Gmail search query for "PSA Invoices" from info@psacard.com (used by Sync to invoice). */
export const PSA_INVOICES_QUERY =
  'from:info@psacard.com subject:"PSA Invoices"';

/** Gmail search query for "Your PSA order has shipped" from no-reply@psacard.com (used by Sync shipped). */
export const SHIPPED_EMAIL_QUERY =
  'from:no-reply@psacard.com subject:"Your PSA order has shipped"';

/**
 * Fetch recent emails matching PSA-related query.
 * For Orders NEW sync, pass query: RECEIVED_PACKAGE_QUERY to get only received-package emails.
 */
export async function fetchPsaEmails(options?: {
  maxResults?: number;
  query?: string;
}): Promise<GmailMessage[]> {
  const auth = getOAuth2Client();
  if (!auth) {
    throw new Error('Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.');
  }

  const gmail = google.gmail({ version: 'v1', auth });
  const query =
    options?.query ??
    RECEIVED_PACKAGE_QUERY;
  const maxResults = options?.maxResults ?? 80;

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messageIds = listRes.data.messages ?? [];
  const messages: GmailMessage[] = [];

  for (const m of messageIds) {
    const id = m.id!;
    const getRes = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const msg = getRes.data;
    const payload = msg.payload;
    if (!payload) continue;

    const headers = payload.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    let bodyPlain = '';
    let bodyHtml: string | null = null;

    if (payload.body?.data) {
      bodyPlain = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyPlain = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body?.data) {
          bodyHtml = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    messages.push({
      id: msg.id!,
      threadId: msg.threadId ?? '',
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      bodyPlain,
      bodyHtml,
    });
  }

  return messages;
}
