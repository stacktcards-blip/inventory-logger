import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const listedScanPath = resolve(process.argv[2] ?? '/root/.hermes/cache/documents/doc_173c3e9be7b4_Scan1.xlsx')
const awaitingAuctionScanPath = resolve(process.argv[3] ?? '/root/.hermes/cache/documents/doc_72bac9a38be0_Scan2.xlsx')
const importNameSuffix = process.env.SLAB_STOCKTAKE_IMPORT_SUFFIX ?? new Date().toISOString().slice(0, 10)

type ScanInput = {
  label: string
  filePath: string
  sessionName: string
  locationHint: string
  note: string
}

type CertScan = {
  certNumber: string
  rawScanText: string
  rowNumber: number
}

type PsaRow = { id: string; cert_number: string }
type SlabRow = { id: string; cert: string | null; sold_date: string | null }

function loadEnv(path: string) {
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function extractCertsFromXlsx(path: string): CertScan[] {
  const python = String.raw`
from openpyxl import load_workbook
import json, re, sys
path = sys.argv[1]
cert_re = re.compile(r'(?<!\d)(\d{7,12})(?!\d)')
wb = load_workbook(path, read_only=True, data_only=True)
rows = []
for ws in wb.worksheets:
    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        raw_parts = []
        cert = None
        for value in row:
            if value is None:
                continue
            text = str(value).strip()
            if not text:
                continue
            raw_parts.append(text)
            compact = text.replace(' ', '')
            match = cert_re.search(compact)
            if match and cert is None:
                cert = match.group(1)
        if cert:
            rows.append({'certNumber': cert, 'rawScanText': ' | '.join(raw_parts), 'rowNumber': row_idx})
print(json.dumps(rows))
`
  const result = spawnSync('python', ['-c', python, path], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`Failed to parse ${path}: ${result.stderr}`)
  return JSON.parse(result.stdout) as CertScan[]
}

function scanStatus(psaRowId: string | null, slab: SlabRow | null): string {
  if (slab?.sold_date) return 'sold_but_seen'
  if (slab) return 'matched_existing_slab'
  if (psaRowId) return 'matched_psa_only'
  return 'new_cert'
}

loadEnv('/root/projects/inventory-logger/.env')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const inputs: ScanInput[] = [
  {
    label: 'Scan1',
    filePath: listedScanPath,
    sessionName: `Listed on eBay stocktake - ${importNameSuffix}`,
    locationHint: 'listed_on_ebay',
    note: 'Scan1.xlsx: physical slabs currently listed on the eBay store.',
  },
  {
    label: 'Scan2',
    filePath: awaitingAuctionScanPath,
    sessionName: `Awaiting Auction stocktake - ${importNameSuffix}`,
    locationHint: 'awaiting_auction',
    note: 'Scan2.xlsx: physical slabs not currently listed on eBay; awaiting future auction.',
  },
]

const summary: Record<string, unknown> = {}

for (const input of inputs) {
  const scans = extractCertsFromXlsx(input.filePath)
  const certs = scans.map((scan) => scan.certNumber)
  const uniqueCerts = [...new Set(certs)]
  const duplicateInFile = certs.length - uniqueCerts.length

  const psaByCert = new Map<string, PsaRow>()
  for (const part of chunk(uniqueCerts, 500)) {
    const { data, error } = await supabase
      .from('psa_grading_order_rows')
      .select('id, cert_number')
      .in('cert_number', part)
    if (error) throw error
    for (const row of (data ?? []) as PsaRow[]) psaByCert.set(row.cert_number, row)
  }

  const slabsByCert = new Map<string, SlabRow[]>()
  for (const part of chunk(uniqueCerts, 500)) {
    const { data, error } = await supabase
      .from('slabs')
      .select('id, cert, sold_date')
      .in('cert', part)
    if (error) throw error
    for (const row of (data ?? []) as SlabRow[]) {
      if (!row.cert) continue
      const existing = slabsByCert.get(row.cert) ?? []
      existing.push(row)
      slabsByCert.set(row.cert, existing)
    }
  }

  const { data: session, error: sessionError } = await supabase
    .from('slab_stocktake_sessions')
    .insert({
      name: input.sessionName,
      grader: 'PSA',
      location_hint: input.locationHint,
      notes: input.note,
    })
    .select('id')
    .single()
  if (sessionError) throw sessionError

  const scanRows = scans.map((scan, index) => {
    const matches = slabsByCert.get(scan.certNumber) ?? []
    const preferredSlab = matches.find((slab) => !slab.sold_date) ?? matches[0] ?? null
    const psaRow = psaByCert.get(scan.certNumber) ?? null
    const status = certs.indexOf(scan.certNumber) !== index
      ? 'duplicate_in_session'
      : scanStatus(psaRow?.id ?? null, preferredSlab)
    return {
      session_id: session.id,
      raw_scan_text: scan.rawScanText,
      grader: 'PSA',
      cert_number: scan.certNumber,
      matched_psa_row_id: psaRow?.id ?? null,
      matched_slab_id: preferredSlab?.id ?? null,
      scan_status: status,
      location_hint: input.locationHint,
      notes: `Imported from ${input.label}.xlsx row ${scan.rowNumber}`,
    }
  })

  for (const [index, part] of chunk(scanRows, 500).entries()) {
    const { error } = await supabase.from('slab_stocktake_scans').insert(part)
    if (error) throw new Error(`${input.label} chunk ${index + 1} failed: ${error.message}`)
  }

  const statusCounts = scanRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.scan_status] = (acc[row.scan_status] ?? 0) + 1
    return acc
  }, {})
  const duplicateExistingSlabCerts = [...slabsByCert.entries()].filter(([, rows]) => rows.length > 1).map(([cert, rows]) => ({ cert, rows: rows.length }))

  summary[input.label] = {
    sessionId: session.id,
    sessionName: input.sessionName,
    locationHint: input.locationHint,
    rawCertCount: scans.length,
    uniqueCertCount: uniqueCerts.length,
    duplicateInFile,
    matchedPsaCerts: psaByCert.size,
    matchedExistingSlabCerts: slabsByCert.size,
    duplicateExistingSlabCerts: duplicateExistingSlabCerts.slice(0, 20),
    duplicateExistingSlabCertCount: duplicateExistingSlabCerts.length,
    statusCounts,
  }
}

console.log(JSON.stringify(summary, null, 2))
