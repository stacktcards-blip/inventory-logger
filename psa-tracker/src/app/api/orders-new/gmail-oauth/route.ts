/**
 * One-time OAuth flow to get a refresh token.
 * GET /api/orders-new/gmail-oauth
 * 1. Add http://localhost:3001/api/orders-new/gmail-oauth/callback to your OAuth client's "Authorized redirect URIs" in Google Cloud Console.
 * 2. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local.
 * 3. Open this URL in the browser; sign in and consent; you'll be redirected to a page showing your refresh token.
 */
import { NextRequest, NextResponse } from 'next/server';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export async function GET(request: NextRequest) {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local' },
      { status: 503 }
    );
  }

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
  const redirectUri = `${baseUrl}/api/orders-new/gmail-oauth/callback`;

  // Debug: show what we're sending
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  // If accessed with ?debug=true, show the URL instead of redirecting
  const debug = request.nextUrl.searchParams.get('debug');
  if (debug === 'true') {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;max-width:800px;">
        <h1>OAuth Debug Info</h1>
        <p><strong>Redirect URI (must match in Google Cloud Console):</strong></p>
        <pre style="background:#f5f5f5;padding:1rem;overflow:auto;">${redirectUri}</pre>
        <p><strong>Authorization URL:</strong></p>
        <pre style="background:#f5f5f5;padding:1rem;overflow:auto;word-break:break-all;">${authUrl}</pre>
        <p><a href="${authUrl}">Click here to authorize</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  
  return NextResponse.redirect(authUrl);
}
