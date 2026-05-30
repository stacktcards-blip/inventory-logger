import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_CSV = '/root/projects/inventory-logger/data/psa-orders-2026-05-30/output/psa_slabs_inventory_staging.csv'
const importBatch = process.env.PSA_IMPORT_BATCH || 'psa-orders-2026-05-30'
const csvPath = resolve(process.argv[2] ?? DEFAULT_CSV)

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
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
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
const rows = parsed.map((row) => ({
  psa_order_number: nullableText(row.psa_order_number),
  cert_number: nullableText(row.cert_number),
  item_type: nullableText(row.item_type),
  description: nullableText(row.description),
  grade: nullableText(row.grade),
  numeric_grade: nullableNumber(row.numeric_grade),
  after_service: nullableText(row.after_service),
  image_url: nullableText(row.image_url),
  year: nullableText(row.year),
  brand: nullableText(row.brand),
  language_or_release: nullableText(row.language_or_release),
  set_code: nullableText(row.set_code),
  set_name: nullableText(row.set_name),
  card_number: nullableText(row.card_number),
  card_name: nullableText(row.card_name),
  variety: nullableText(row.variety),
  raw_row_json: row,
  import_batch: importBatch,
})).filter((row) => row.psa_order_number && row.cert_number)

console.log(`Importing ${rows.length} PSA grading rows from ${csvPath}`)

for (const [index, part] of chunk(rows, 500).entries()) {
  const { error } = await supabase
    .from('psa_grading_order_rows')
    .upsert(part, { onConflict: 'cert_number' })
  if (error) throw new Error(`Chunk ${index + 1} failed: ${error.message}`)
  console.log(`Imported chunk ${index + 1}/${Math.ceil(rows.length / 500)} (${part.length} rows)`)
}

const { count, error: countError } = await supabase
  .from('psa_grading_order_rows')
  .select('id', { count: 'exact', head: true })
if (countError) throw countError
console.log(`PSA grading staging row count: ${count}`)
