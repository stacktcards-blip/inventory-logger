import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const bulkSchema = z.object({
  orderNumbers: z.union([
    z.string().transform((s) =>
      s
        .split(/[\r\n,;]+/)
        .map((n) => n.trim())
        .filter(Boolean)
    ),
    z.array(z.string().min(1)),
  ]),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const numbers = Array.from(new Set(parsed.data.orderNumbers)); // dedupe
  let created = 0;
  const errors: string[] = [];

  for (const psaOrderNumber of numbers) {
    const { error } = await supabase
      .schema('psa_tracker')
      .from('psa_orders')
      .insert({
        psa_order_number: psaOrderNumber,
        status: 'unknown',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // duplicate - skip
        continue;
      }
      errors.push(`${psaOrderNumber}: ${error.message}`);
    } else {
      created++;
    }
  }

  return NextResponse.json({
    created,
    skipped: numbers.length - created - errors.length,
    errors: errors.length ? errors : undefined,
  });
}
