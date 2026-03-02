/**
 * PSA Public API – certificate lookup by cert number.
 * Docs: https://www.psacard.com/publicapi/documentation
 * GET https://api.psacard.com/publicapi/cert/GetByCertNumber/{certNumber}
 */

const PSA_API_BASE = 'https://api.psacard.com/publicapi';

export type PsaCertResponse = {
  IsValidRequest: boolean;
  ServerMessage: string;
  [key: string]: unknown;
};

function getToken(): string {
  const raw = process.env.PSA_API_TOKEN ?? process.env.PSA_API_KEY;
  const token = raw?.trim()?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) {
    throw new Error('Missing PSA_API_TOKEN or PSA_API_KEY for cert lookup');
  }
  return token;
}

/**
 * Fetch cert data by PSA certificate number.
 * - 200 + IsValidRequest: true + "Request successful" => returns parsed JSON.
 * - 200 + "No data found" => returns null.
 * - 4xx/5xx or invalid payload => throws.
 */
export async function getByCertNumber(certNumber: string): Promise<PsaCertResponse | null> {
  const trimmed = String(certNumber ?? '').trim();
  if (!trimmed) {
    throw new Error('Certificate number is required');
  }

  const token = getToken();
  const url = `${PSA_API_BASE}/cert/GetByCertNumber/${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (res.status === 204) {
    return null;
  }

  let body: PsaCertResponse;
  try {
    body = (await res.json()) as PsaCertResponse;
  } catch {
    throw new Error(`PSA API invalid JSON: ${res.status} ${res.statusText}`);
  }

  if (res.status === 401) {
    throw new Error(
      `PSA API rejected the token (401). Check PSA_API_TOKEN. ${body?.ServerMessage ?? ''}`
    );
  }

  if (!res.ok) {
    const msg = body?.ServerMessage ?? body?.Message ?? res.statusText;
    throw new Error(`PSA API error ${res.status}: ${msg}`);
  }

  if (body.IsValidRequest === true && body.ServerMessage === 'No data found') {
    return null;
  }

  if (body.IsValidRequest !== true || body.ServerMessage !== 'Request successful') {
    const msg = body.ServerMessage ?? 'Invalid or unsuccessful request';
    throw new Error(`PSA cert lookup failed: ${msg}`);
  }

  return body;
}
