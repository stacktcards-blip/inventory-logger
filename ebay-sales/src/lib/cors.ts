import { NextResponse } from 'next/server';

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3003';

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function withCors(response: NextResponse): NextResponse {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export function jsonWithCors(data: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(data, init);
  return withCors(response);
}
