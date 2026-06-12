import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const csvPath = resolve(process.argv[2] ?? '')
const importBatch = process.env.CGC_IMPORT_BATCH || (csvPath ? basename(csvPath).replace(/\.[^.]+$/, '') : `cgc-import-${new Date().toISOString().slice(0, 10)}`)

if (!process.argv[2]) {
  throw new Error('Usage: tsx scripts/import-cgc-grading-staging.ts <cgc-order-export.csv>')
}

function loadEnv(path: string) {
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  const [header, ...dataRows] = rows
  if (!header) return []
  return dataRows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])))
}

function nullableText(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed || null
}

function nullableNumber(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const match = trimmed.match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  const byKey = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]))
  for (const candidate of candidates) {
    const value = byKey.get(normalizeKey(candidate))
    if (value != null && value.trim()) return value
  }
  return undefined
}

function normalizeCgcGrade(gradeValue: string | undefined): string | null {
  const grade = (gradeValue ?? '').trim()
  if (!grade) return null
  const normalized = grade.toUpperCase().replace(/\s+/g, ' ')
  if (normalized.includes('PRISTINE') && /\b10\b/.test(normalized)) return '10+'
  if (normalized.includes('GEM MINT') && /\b10\b/.test(normalized)) return '10'
  if (normalized.includes('MINT') && /\b9\.5\b/.test(normalized)) return '9.5'
  const numeric = nullableNumber(grade)
  return numeric == null ? grade : String(numeric).replace(/\.0$/, '')
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

loadEnv('/root/projects/inventory-logger/.env')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const parsed = parseCsv(readFileSync(csvPath, 'utf8'))
const rows = parsed.map((row) => {
  const grade = nullableText(pick(row, ['grade', 'final grade', 'cgc grade', 'assigned grade']))
  const descriptionParts = [
    pick(row, ['description', 'item description', 'label description']),
    pick(row, ['year']),
    pick(row, ['card name', 'name', 'subject']),
    pick(row, ['set name', 'set']),
    pick(row, ['card number', 'number', 'card no', 'card #']),
  ].map((value) => nullableText(value)).filter(Boolean)

  return {
    cgc_order_number: nullableText(pick(row, ['cgc order number', 'order number', 'submission number', 'submission #', 'invoice number'])),
    cert_number: nullableText(pick(row, ['cert number', 'certification number', 'certification #', 'cert #', 'cgc cert number', 'cgc certification number'])),
    item_type: nullableText(pick(row, ['item type', 'type', 'category'])),
    description: nullableText(pick(row, ['description', 'item description', 'label description'])) ?? (descriptionParts.length ? descriptionParts.join(' ') : null),
    grade,
    numeric_grade: nullableNumber(grade ?? undefined),
    normalized_grade: normalizeCgcGrade(grade ?? undefined),
    image_url: nullableText(pick(row, ['image url', 'image', 'obverse image url', 'front image url'])),
    year: nullableText(pick(row, ['year'])),
    brand: nullableText(pick(row, ['brand', 'game', 'property'])),
    language_or_release: nullableText(pick(row, ['language', 'language or release', 'release'])),
    set_code: nullableText(pick(row, ['set code', 'set abbreviation', 'set abbr'])),
    set_name: nullableText(pick(row, ['set name', 'set'])),
    card_number: nullableText(pick(row, ['card number', 'number', 'card no', 'card #'])),
    card_name: nullableText(pick(row, ['card name', 'name', 'subject'])),
    variety: nullableText(pick(row, ['variety', 'variant', 'parallel', 'pedigree'])),
    raw_row_json: row,
    import_batch: importBatch,
  }
}).filter((row) => row.cert_number)

console.log(`Importing ${rows.length} CGC grading rows from ${csvPath}`)

for (const [index, part] of chunk(rows, 500).entries()) {
  const { error } = await supabase
    .from('cgc_grading_order_rows')
    .upsert(part, { onConflict: 'cert_number' })
  if (error) throw new Error(`Chunk ${index + 1} failed: ${error.message}`)
  console.log(`Imported chunk ${index + 1}/${Math.ceil(rows.length / 500)} (${part.length} rows)`)
}

const { count, error: countError } = await supabase
  .from('cgc_grading_order_rows')
  .select('id', { count: 'exact', head: true })
if (countError) throw countError
console.log(`CGC grading staging row count: ${count}`)
