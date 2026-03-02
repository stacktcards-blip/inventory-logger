import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = { matcher: '/api/:path*' }

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3003',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: corsHeaders })
    }
    const response = NextResponse.next()
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  }
  return NextResponse.next()
}
