import { jsonWithCors } from '@/lib/cors';

export async function GET() {
  return jsonWithCors({ ok: true });
}
