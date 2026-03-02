import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/**
 * Get Supabase client for API routes.
 * Supports auth via Authorization Bearer token (from ebay-sales-ui or other clients).
 */
export async function getAuthenticatedClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing Supabase config');
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  return client;
}
