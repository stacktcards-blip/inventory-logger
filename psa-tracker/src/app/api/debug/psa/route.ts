/**
 * Debug endpoint to test PSA API directly.
 * GET /api/debug/psa?orderNumber=YOUR_ORDER_NUMBER
 * Tries both GetProgress and GetSubmissionProgress. Returns raw responses.
 */
import { NextRequest, NextResponse } from 'next/server';

const PSA_API_BASE = 'https://api.psacard.com/publicapi';

async function callPsa(
  url: string,
  token: string
): Promise<{ status: number; statusText: string; body: unknown; url: string }> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, statusText: res.statusText, body, url };
}

export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber')?.trim();
  if (!orderNumber) {
    return NextResponse.json(
      { error: 'Missing orderNumber. Use ?orderNumber=YOUR_NUMBER' },
      { status: 400 }
    );
  }

  const token =
    process.env.PSA_API_TOKEN?.trim()?.replace(/^Bearer\s+/i, '') ??
    process.env.PSA_API_KEY?.trim()?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json(
      {
        error: 'PSA_API_TOKEN not set. Add to psa-tracker/.env.local and restart.',
      },
      { status: 500 }
    );
  }

  try {
    const encoded = encodeURIComponent(orderNumber);
    const [orderRes, submissionRes] = await Promise.all([
      callPsa(`${PSA_API_BASE}/order/GetProgress/${encoded}`, token),
      callPsa(`${PSA_API_BASE}/order/GetSubmissionProgress/${encoded}`, token),
    ]);

    const hasData = (r: { body: unknown }) => {
      if (!r.body || typeof r.body !== 'object') return false;
      const o = r.body as Record<string, unknown>;
      return 'orderNumber' in o || 'OrderNumber' in o;
    };

    const getResponseKeys = (r: { body: unknown }): string[] => {
      if (!r.body || typeof r.body !== 'object') return [];
      return Object.keys(r.body as Record<string, unknown>).sort();
    };

    const progressKeys = getResponseKeys(orderRes);
    const submissionKeys = getResponseKeys(submissionRes);

    return NextResponse.json({
      input: orderNumber,
      tokenLength: token.length,
      getProgress: orderRes,
      getSubmissionProgress: submissionRes,
      /** Top-level keys in each response – use to verify service level field name when API returns data */
      responseKeys: {
        getProgress: progressKeys,
        getSubmissionProgress: submissionKeys,
        note: 'If service_level shows "—" in UI, check these keys for the actual field name (e.g. serviceLevel, ServiceLevel, serviceType). Swagger docs do not list service level.',
      },
      summary:
        hasData(orderRes)
          ? 'GetProgress returned data'
          : hasData(submissionRes)
            ? 'GetSubmissionProgress returned data'
            : 'Neither endpoint returned order data. Check: (1) number format on PSA site, (2) order is linked to your account, (3) API token has order access.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 }
    );
  }
}
