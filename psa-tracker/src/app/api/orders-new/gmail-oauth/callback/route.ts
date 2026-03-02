/**
 * OAuth callback: exchange authorization code for tokens and show refresh token.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');
  const errorDescription = request.nextUrl.searchParams.get('error_description');
  const allParams = Object.fromEntries(request.nextUrl.searchParams.entries());

  if (error) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;max-width:800px;">
        <h1>Authorization failed</h1>
        <p><strong>Error:</strong> ${error}</p>
        ${errorDescription ? `<p><strong>Description:</strong> ${errorDescription}</p>` : ''}
        <h2>Common issues:</h2>
        <ul>
          <li><strong>redirect_uri_mismatch</strong>: The redirect URI in Google Cloud Console must exactly match: <code>${process.env.APP_BASE_URL ?? 'http://localhost:3001'}/api/orders-new/gmail-oauth/callback</code></li>
          <li><strong>access_denied</strong> (most common): Your OAuth consent screen is in "Testing" mode. Go to <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank">Google Cloud Console → OAuth consent screen</a> and add your Google account email (<strong>the one you're signing in with</strong>) under "Test users". Then try again.</li>
          <li>If you clicked "Deny", try again and click "Allow".</li>
        </ul>
        <h2>Received parameters:</h2>
        <pre style="background:#f5f5f5;padding:1rem;overflow:auto;">${JSON.stringify(allParams, null, 2)}</pre>
        <p><a href="/api/orders-new/gmail-oauth">Try again</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  if (!code) {
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    const expectedRedirectUri = `${baseUrl}/api/orders-new/gmail-oauth/callback`;
    const fullUrl = request.nextUrl.toString();
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;max-width:800px;">
        <h1>Missing authorization code</h1>
        <p>Google did not return an authorization code. This usually means the redirect URI doesn't match.</p>
        <h2>Check:</h2>
        <ol>
          <li>In <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console → Credentials</a>, open your OAuth 2.0 Client ID</li>
          <li>Under <strong>Authorized redirect URIs</strong>, ensure this exact URL is listed:</li>
        </ol>
        <pre style="background:#f5f5f5;padding:1rem;overflow:auto;">${expectedRedirectUri}</pre>
        <p><strong>Important:</strong> It must match exactly (including http vs https, port number, no trailing slash).</p>
        <h2>Debug info:</h2>
        <p><strong>Full callback URL:</strong> <code style="word-break:break-all;">${fullUrl}</code></p>
        <p><strong>Received parameters:</strong></p>
        <pre style="background:#f5f5f5;padding:1rem;overflow:auto;">${JSON.stringify(allParams, null, 2)}</pre>
        <p>If parameters are empty, Google likely redirected here but without the code. This means the redirect URI in Google Cloud Console doesn't match.</p>
        <p><a href="/api/orders-new/gmail-oauth?debug=true">View debug info and try again</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return new NextResponse(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;"><h1>Server config</h1><p>GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
  const redirectUri = `${baseUrl}/api/orders-new/gmail-oauth/callback`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;"><h1>Token exchange failed</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  const refreshToken = data.refresh_token;
  if (!refreshToken) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;"><h1>No refresh token</h1><p>Google did not return a refresh_token. Try again with prompt=consent.</p><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Gmail refresh token</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:640px;">
  <h1>Gmail refresh token</h1>
  <p>Add this to your <code>.env.local</code>:</p>
  <pre style="background:#f5f5f5;padding:1rem;overflow:auto;">GMAIL_REFRESH_TOKEN=${refreshToken}</pre>
  <p>Then restart the dev server. You can close this tab.</p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
