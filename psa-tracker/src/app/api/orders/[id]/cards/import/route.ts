import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const cardRowSchema = z.object({
  card_name: z.string().min(1),
  set_abbr: z.string().min(1),
  card_number: z.string().min(1),
  lang: z.string().optional().default('EN'),
  quantity: z.coerce.number().int().min(1).optional().default(1),
  declared_value: z.coerce.number().optional().nullable(),
  grade_result: z.string().optional().nullable(),
  cert_number: z.string().optional().nullable(),
});

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let text: string;
  if (contentType.includes('application/json')) {
    const body = await request.json();
    text = body.csv ?? body.text ?? '';
  } else {
    text = await request.text();
  }

  const rows = parseCSV(text);
  const cards: { order_id: string; card_name: string; set_abbr: string; card_number: string; lang: string; quantity: number; declared_value: number | null; grade_result: string | null; cert_number: string | null }[] = [];

  for (const row of rows) {
    const mapped = {
      card_name: row.card_name ?? row.cardname ?? row.name ?? '',
      set_abbr: row.set_abbr ?? row.set ?? row.setabbr ?? '',
      card_number: row.card_number ?? row.cardnumber ?? row.num ?? row.number ?? '',
      lang: row.lang ?? row.language ?? 'EN',
      quantity: row.quantity ?? row.qty ?? '1',
      declared_value: row.declared_value ?? row.value ?? row.declaredvalue ?? null,
      grade_result: row.grade_result ?? row.grade ?? row.graderesult ?? null,
      cert_number: row.cert_number ?? row.cert ?? row.certnumber ?? null,
    };
    const parsed = cardRowSchema.safeParse(mapped);
    if (parsed.success) {
      cards.push({
        order_id: orderId,
        card_name: parsed.data.card_name,
        set_abbr: parsed.data.set_abbr,
        card_number: parsed.data.card_number,
        lang: parsed.data.lang,
        quantity: parsed.data.quantity,
        declared_value: parsed.data.declared_value ?? null,
        grade_result: parsed.data.grade_result ?? null,
        cert_number: parsed.data.cert_number ?? null,
      });
    }
  }

  if (cards.length === 0) {
    return NextResponse.json(
      { error: 'No valid cards found in CSV. Expected columns: card_name, set_abbr, card_number (optional: lang, quantity, declared_value, grade_result, cert_number)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .schema('psa_tracker').from('psa_order_cards')
    .insert(cards)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ imported: data?.length ?? 0, cards: data });
}
