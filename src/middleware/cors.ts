import type express from 'express';

const splitEnvList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = splitEnvList(process.env.CORS_ORIGIN);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : isProduction ? [] : ['http://localhost:5173'];

export function requireCorsConfiguration() {
  if (isProduction && allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must be set in production');
  }
  if (isProduction && allowedOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN must not be * in production');
  }
}

export function corsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestOrigin = req.header('origin');
  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins.length === 1
      ? allowedOrigins[0]
      : null;

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
}
