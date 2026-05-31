import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const DEFAULT_SESSION_IDS = [
  'eb6c9403-64d8-48b1-8507-323991159f19',
  'c7784af2-6496-437b-975a-ea3b33cf58b9',
]
const sessionIds = (process.env.STOCKTAKE_SESSION_IDS ?? DEFAULT_SESSION_IDS.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const commit = process.argv.includes('--commit')

function loadEnv(path) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}
function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}
async function fetchAll(sb, table, select, queryFn) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let query = sb.from(table).select(select).range(from, from + 999)
    if (queryFn) query = queryFn(query)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}
function normalizeLang(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (['EN', 'ENG', 'ENGLISH'].includes(text)) return 'ENG'
  if (['JP', 'JPN', 'JAPANESE'].includes(text)) return 'JPN'
  if (['CN', 'CHN', 'CHINESE'].includes(text)) return 'CHN'
  if (['KR', 'KOR', 'KOREAN'].includes(text)) return 'KOR'
  return text || null
}

loadEnv('/root/projects/inventory-logger/.env')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const scans = await fetchAll(
  sb,
  'slab_stocktake_reconciliation',
  'scan_id,session_id,cert_number,scan_status,location_hint,psa_row_id,slab_id',
  (query) => query.in('session_id', sessionIds).in('scan_status', ['matched_psa_only', 'new_cert']).order('cert_number', { ascending: true }),
)

const psaIds = [...new Set(scans.map((scan) => scan.psa_row_id).filter(Boolean))]
const psaRows = []
for (const ids of chunk(psaIds, 100)) {
  const { data, error } = await sb
    .from('psa_grading_order_rows')
    .select('id,cert_number,grade,numeric_grade,psa_order_number,description,parsed_set_abbr,parsed_num,parsed_lang,master_card_match_status,psa_label_extra_details,language_or_release,set_code,card_number')
    .in('id', ids)
  if (error) throw error
  psaRows.push(...(data ?? []))
}
const psaById = new Map(psaRows.map((row) => [row.id, row]))

const existing = []
for (const certs of chunk(scans.map((scan) => scan.cert_number), 100)) {
  const { data, error } = await sb
    .from('slabs')
    .select('id,cert,grading_company,source_stocktake_scan_id')
    .in('cert', certs)
  if (error) throw error
  existing.push(...(data ?? []))
}
const existingCerts = new Set(existing.map((row) => String(row.cert)))
const existingScanIds = new Set(existing.map((row) => String(row.source_stocktake_scan_id)).filter(Boolean))

const inserts = []
const skipped = []
for (const scan of scans) {
  if (existingCerts.has(String(scan.cert_number)) || existingScanIds.has(String(scan.scan_id))) {
    skipped.push({ cert: scan.cert_number, scan_id: scan.scan_id, reason: 'already exists in slabs' })
    continue
  }

  const psa = scan.psa_row_id ? psaById.get(scan.psa_row_id) : null
  const confirmed = psa?.master_card_match_status === 'MATCHED_CONFIRMED'
  const listingState = scan.location_hint === 'awaiting_auction' ? 'AWAITING_AUCTION' : 'LISTED'
  const noteParts = [
    `Created from physical stocktake session ${scan.session_id}`,
    psa ? `PSA staging row ${psa.id}; order ${psa.psa_order_number ?? 'unknown'}` : 'No PSA staging row matched at promotion time',
    confirmed ? 'Strict master_cards match confirmed.' : 'Needs enrichment before set/num/lang should be trusted.',
  ]

  inserts.push({
    sku: '',
    cert: scan.cert_number,
    grading_company: 'PSA',
    grade: psa?.numeric_grade != null ? String(psa.numeric_grade) : (psa?.grade ?? null),
    set_abbr: confirmed ? psa.parsed_set_abbr : null,
    num: confirmed ? psa.parsed_num : null,
    lang: confirmed ? psa.parsed_lang : null,
    is_1ed: false,
    is_rev: false,
    note: noteParts.join(' | '),
    listing_state: listingState,
    acquisition_type: scan.scan_status === 'matched_psa_only' ? 'GRADED_BY_US' : 'UNKNOWN',
    metadata_status: confirmed ? 'PARSED_CONFIRMED' : 'NEEDS_ENRICHMENT',
    stock_source: 'PHYSICAL_STOCKTAKE',
    variant: confirmed ? (psa?.psa_label_extra_details ?? null) : null,
    psa_label_details: psa?.psa_label_extra_details ?? null,
    source_psa_row_id: psa?.id ?? null,
    source_stocktake_scan_id: scan.scan_id,
  })
}

const summary = {
  mode: commit ? 'commit' : 'dry-run',
  sessionIds,
  scannedCandidateRows: scans.length,
  existingSkipped: skipped.length,
  insertCandidates: inserts.length,
  confirmedMetadata: inserts.filter((row) => row.metadata_status === 'PARSED_CONFIRMED').length,
  needsEnrichment: inserts.filter((row) => row.metadata_status === 'NEEDS_ENRICHMENT').length,
  byListingState: inserts.reduce((acc, row) => {
    acc[row.listing_state] = (acc[row.listing_state] ?? 0) + 1
    return acc
  }, {}),
}

if (commit) {
  for (const [index, rows] of chunk(inserts, 250).entries()) {
    const { error } = await sb.from('slabs').insert(rows)
    if (error) throw new Error(`Insert chunk ${index + 1} failed: ${error.message}`)
  }
}

console.log(JSON.stringify(summary, null, 2))
