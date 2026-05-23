import type express from 'express';
import { createClient } from '@supabase/supabase-js';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const splitEnvList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const allowedUserIds = new Set(splitEnvList(process.env.ALLOWED_USER_IDS));
const allowedUserEmails = new Set(
  splitEnvList(process.env.ALLOWED_USER_EMAILS).map((email) => email.toLowerCase())
);
const allowAnyAuthenticatedUser = process.env.ALLOW_ANY_AUTHENTICATED_USER === 'true';

const getBearerToken = (header: string | undefined): string | null => {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const isAllowedUser = (user: AuthenticatedUser): boolean => {
  if (allowAnyAuthenticatedUser) return true;
  if (allowedUserIds.has(user.id)) return true;
  if (user.email && allowedUserEmails.has(user.email.toLowerCase())) return true;
  return false;
};

let authClient: ReturnType<typeof createClient> | null = null;

const getAuthClient = () => {
  if (authClient) return authClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for backend auth');
  }

  authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
};

export async function requireAuthenticatedUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const token = getBearerToken(req.header('authorization'));
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const supabase = getAuthClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user: AuthenticatedUser = {
      id: data.user.id,
      email: data.user.email ?? null,
    };

    if (!isAllowedUser(user)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuthConfiguration() {
  const hasAllowlist = allowedUserIds.size > 0 || allowedUserEmails.size > 0;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Backend auth requires SUPABASE_URL and SUPABASE_ANON_KEY');
  }
  if (process.env.NODE_ENV === 'production' && allowAnyAuthenticatedUser) {
    throw new Error('ALLOW_ANY_AUTHENTICATED_USER must not be true in production');
  }

  if (!allowAnyAuthenticatedUser && !hasAllowlist) {
    throw new Error(
      'Backend auth requires ALLOWED_USER_IDS or ALLOWED_USER_EMAILS. Set ALLOW_ANY_AUTHENTICATED_USER=true only for controlled development.'
    );
  }
}
