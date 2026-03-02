'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const FULFILLMENT_SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.fulfillment';
const BROWSE_SCOPE = 'https://api.ebay.com/oauth/api_scope/buy.browse';
const OAUTH_SCOPES = `${FULFILLMENT_SCOPE} ${BROWSE_SCOPE}`;

function OAuthContent() {
  const searchParams = useSearchParams();
  const appId = process.env.NEXT_PUBLIC_EBAY_APP_ID;
  const ruName = process.env.NEXT_PUBLIC_EBAY_RUNAME;

  if (!appId || !ruName) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-amber-200">
        <p className="font-medium">Missing configuration</p>
        <p className="mt-1 text-sm">
          Add NEXT_PUBLIC_EBAY_APP_ID and NEXT_PUBLIC_EBAY_RUNAME to your .env.local.
        </p>
        <p className="mt-2 text-xs text-amber-300/80">
          RuName is the <strong>RuName string</strong> from eBay Developer Portal (User Tokens page), e.g. James_James-StacktCa-SalesLog-PRD-xxxxx. It is NOT a URL.
        </p>
      </div>
    );
  }

  if (ruName.startsWith('http')) {
    return (
      <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-amber-200">
        <p className="font-medium">Wrong RuName format</p>
        <p className="mt-1 text-sm">
          NEXT_PUBLIC_EBAY_RUNAME must be the <strong>RuName string</strong>, not a URL.
        </p>
        <p className="mt-2 text-xs text-amber-300/80">
          In eBay Developer Portal → Application Keys → User Tokens, create or select a RuName. The RuName looks like &quot;YourName-YourApp-PRD-xxxxx&quot;. When creating it, set <em>Auth Accepted URL</em> to <code>http://localhost:3002/oauth</code>. Copy the RuName string (not the URL) into .env.local.
        </p>
      </div>
    );
  }

  const authUrl = new URL(
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_EBAY_SANDBOX === 'true'
      ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
      : 'https://auth.ebay.com/oauth2/authorize'
  );
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', ruName);
  authUrl.searchParams.set('scope', OAUTH_SCOPES);

  const code = searchParams.get('code');
  if (code) {
    return (
      <div className="space-y-4">
        <p className="text-slate-300">Exchanging authorization code for tokens...</p>
        <ExchangeCode code={code} ruName={ruName} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">Get a new eBay refresh token</h2>
      <p className="text-sm text-slate-400">
        Your current refresh token is invalid. Generate a new one by completing the OAuth flow.
      </p>
      <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
        <li>Ensure your RuName&apos;s Auth Accepted URL in eBay Developer Portal is <code className="rounded bg-slate-700 px-1">http://localhost:3002/oauth</code></li>
        <li>Click the link below and sign in with your 2stackt eBay seller account</li>
        <li>Grant permission when prompted</li>
        <li>Copy the refresh token and add it to ebay-sales/.env.local as EBAY_REFRESH_TOKEN</li>
      </ol>
      <a
        href={authUrl.toString()}
        className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Authorize with eBay
      </a>
    </div>
  );
}

function ExchangeCode({ code, ruName }: { code: string; ruName: string }) {
  const [result, setResult] = React.useState<{ refresh_token?: string; error?: string } | null>(null);

  React.useEffect(() => {
    fetch(`/api/oauth/exchange?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(ruName)}`)
      .then((res) => res.json())
      .then(setResult)
      .catch((err) => setResult({ error: err.message }));
  }, [code, ruName]);

  if (!result) return <div className="text-slate-400">Please wait...</div>;
  if (result.error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-200">
        <p className="font-medium">Exchange failed</p>
        <p className="mt-1 text-sm">{result.error}</p>
      </div>
    );
  }
  if (result.refresh_token) {
    return (
      <div className="space-y-3 rounded-lg border border-green-800 bg-green-950/20 p-4">
        <p className="font-medium text-green-200">Success! Add this to ebay-sales/.env.local:</p>
        <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-300">
          EBAY_REFRESH_TOKEN={result.refresh_token}
        </pre>
        <p className="text-xs text-slate-400">Restart the ebay-sales server after updating .env.local.</p>
      </div>
    );
  }
  return null;
}

export default function OAuthPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-6">
        <h1 className="text-xl font-semibold text-slate-100">eBay OAuth – Refresh Token</h1>
        <Suspense fallback={<p className="text-slate-400">Loading...</p>}>
          <OAuthContent />
        </Suspense>
        <p className="text-xs text-slate-500">
          <a href="/" className="underline hover:text-slate-400">← Back to API</a>
        </p>
      </div>
    </main>
  );
}
