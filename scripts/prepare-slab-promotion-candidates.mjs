import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPORT_DIR = process.env.REPORT_DIR ?? '/root/projects/inventory-logger/data/slab-stocktake-2026-05-31/reports'
const DEFAULT_SESSION_IDS = [
  'eb6c9403-64d8-48b1-8507-323991159f19',
  'c7784af2-6496-437b-975a-ea3b33cf58b9',
]
const sessionIds = (process.env.STOCKTAKE_SESSION_IDS ?? DEFAULT_SESSION_IDS.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
const shouldUpdatePsaRows = process.argv.includes('--update-psa-parse-status')

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

function csvEscape(value) {
  if (value == null) return ''
  const stringValue = String(value)
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue
}
function toCsv(rows) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.join(','), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(','))].join('\n') + '\n'
}

function normText(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/POKÉMON/g, 'POKEMON')
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function compact(value) {
  return normText(value).replace(/\s+/g, '')
}
function normalizeCardName(value) {
  return normText(value)
    .replace(/\bFULL ART\b/g, '')
    .replace(/\bALT ART\b/g, '')
    .replace(/\bSPECIAL ILLUSTRATION RARE\b/g, '')
    .replace(/\bILLUSTRATION RARE\b/g, '')
    .replace(/\bHYPER RARE\b/g, '')
    .replace(/\bSECRET\b/g, '')
    .replace(/\bHOLO\b/g, '')
    .replace(/\s+/g, '')
}
function extractExtraLabelDetails(psaName, masterName) {
  const psaWords = normText(psaName).match(/[A-Z0-9]+/g) ?? []
  const masterWords = new Set(normText(masterName).match(/[A-Z0-9]+/g) ?? [])
  for (const word of [...masterWords]) {
    for (const suffix of ['EX', 'GX', 'VSTAR', 'VMAX']) {
      if (word.endsWith(suffix) && word.length > suffix.length) {
        masterWords.add(word.slice(0, -suffix.length))
        masterWords.add(suffix)
      }
    }
  }
  return psaWords.filter((word) => !masterWords.has(word)).join(' ')
}
function detectLang(psaRow) {
  const blob = normText([
    psaRow.language_or_release,
    psaRow.set_code,
    psaRow.set_name,
    psaRow.description,
  ].filter(Boolean).join(' '))
  if (/\b(TRADITIONAL CHINESE|CHINESE|CHN|CN)\b/.test(blob)) return 'chn'
  if (/\b(JAPANESE|JPN|JP)\b/.test(blob)) return 'jpn'
  if (/\b(ENGLISH|ENG|EN)\b/.test(blob)) return 'eng'
  return null
}
function normalizeNum(value) {
  const text = String(value ?? '').trim().toUpperCase()
  if (!text) return null
  const slashless = text.split('/')[0].trim()
  return slashless || null
}
function numKey(value) {
  const text = normalizeNum(value)
  if (!text) return ''
  const match = text.match(/^0*(\d+)([A-Z]*)$/)
  return match ? `${Number(match[1])}${match[2]}` : text.replace(/^0+(?=\d)/, '')
}
function candidateNumbers(psaRow) {
  const candidates = []
  const add = (value) => {
    const n = normalizeNum(value)
    if (n && !candidates.includes(n)) candidates.push(n)
  }
  // PSA sometimes stores the set total in card_number for sets like Japanese 151
  // while the actual card number is the leading token in card_name.
  const leadingCardNameNumber = String(psaRow.card_name ?? '').trim().match(/^([A-Z]{0,3}\d{1,4}[A-Z]?|\d{1,4}[A-Z]?)(?:\b|\/)/i)
  if (leadingCardNameNumber) add(leadingCardNameNumber[1])
  const cardNumberIs151SetContext =
    leadingCardNameNumber &&
    normalizeNum(psaRow.card_number) === '151' &&
    /\b(151|SV2A|POKEMON 151)\b/i.test([psaRow.description, psaRow.set_code, psaRow.set_name].filter(Boolean).join(' '))
  if (!cardNumberIs151SetContext) add(psaRow.card_number)
  const blob = String([psaRow.description, psaRow.card_name].filter(Boolean).join(' ')).toUpperCase()
  for (const match of blob.matchAll(/(?:#|\bNO\.?\s*)?([A-Z]{0,3}\d{1,4}[A-Z]?|\d{1,4}[A-Z]?)(?:\/\d{1,4})?\b/g)) {
    const value = match[1]
    if (cardNumberIs151SetContext && value === '151') continue
    if (!['10', '9', '8', '7', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].includes(value)) add(value)
  }
  return candidates
}
function aliasScore(alias) {
  let score = 0
  if (alias.confidence === 'manual') score += 1000
  if (alias.confidence === 'high') score += 500
  if (alias.alias_set_code) score += 100
  if (alias.alias_language_text) score += 100
  score += compact(alias.alias_name).length
  return score
}
function resolveSet(psaRow, cardSets, aliases) {
  const setName = normText(psaRow.set_name)
  const setCode = normText(psaRow.set_code)
  const langText = normText(psaRow.language_or_release)
  const detectedLang = detectLang(psaRow)
  const blob = normText([
    psaRow.description,
    psaRow.language_or_release,
    psaRow.set_code,
    psaRow.set_name,
    psaRow.card_name,
    psaRow.variety,
    psaRow.year,
    psaRow.brand,
  ].filter(Boolean).join(' '))
  const blobCompact = compact(blob)

  const exactAliases = aliases
    .filter((alias) => {
      if (compact(alias.alias_name) !== compact(setName)) return false
      if (compact(alias.alias_set_code) !== compact(setCode)) return false
      if (compact(alias.alias_language_text) !== compact(langText)) return false
      return alias.confidence !== 'rejected'
    })
    .sort((a, b) => aliasScore(b) - aliasScore(a))
  if (exactAliases[0]) return { ...exactAliases[0].cardSet, source: 'exact_alias', alias: exactAliases[0] }

  const directSetCode = cardSets.find((set) => compact(set.set_abbr) === compact(setCode) && (!detectedLang || set.lang === detectedLang))
  if (directSetCode) return { ...directSetCode, source: 'set_code_language' }

  const relaxedAliases = aliases
    // For contained-text fallback, only trust curated aliases. Auto-seeded candidate
    // aliases can be too broad (e.g. PSA's SV2a "POKEMON" for Pokemon 151) and
    // cause false matches against unrelated Pokemon labels.
    .filter((alias) => ['manual', 'high'].includes(alias.confidence))
    .filter((alias) => {
      const aliasName = compact(alias.alias_name)
      if (!aliasName || !blobCompact.includes(aliasName)) return false
      if (alias.alias_set_code && setCode && compact(alias.alias_set_code) !== compact(setCode)) return false
      const aliasLang = detectLang({ language_or_release: alias.alias_language_text })
      if (aliasLang && detectedLang && aliasLang !== detectedLang) return false
      return true
    })
    .sort((a, b) => aliasScore(b) - aliasScore(a))
  if (relaxedAliases[0]) return { ...relaxedAliases[0].cardSet, source: 'contained_alias', alias: relaxedAliases[0] }

  return { set_abbr: null, lang: detectedLang, source: null, reason: 'No card_set_aliases/card_sets mapping matched PSA set metadata.' }
}
function evaluateMasterMatch(psaRow, masterRows, cardSets, aliases) {
  if (String(psaRow.brand ?? '').toUpperCase() && !String(psaRow.brand ?? '').toUpperCase().includes('POKEMON')) {
    return { setAbbr: null, num: null, lang: null, masterCardId: null, masterCardName: null, status: 'NON_POKEMON', reason: `PSA brand is ${psaRow.brand}` }
  }

  const resolved = resolveSet(psaRow, cardSets, aliases)
  const nums = candidateNumbers(psaRow)
  if (!resolved.set_abbr || !resolved.lang || nums.length === 0) {
    return {
      setAbbr: resolved.set_abbr,
      num: nums[0] ?? null,
      lang: resolved.lang,
      masterCardId: null,
      masterCardName: null,
      status: 'PARSE_INCOMPLETE',
      reason: !resolved.set_abbr ? resolved.reason : 'Could not derive a card number from PSA metadata.',
      setResolveSource: resolved.source,
    }
  }

  const matches = masterRows.filter((card) =>
    compact(card.set_abbr) === compact(resolved.set_abbr) &&
    String(card.lang ?? '').toLowerCase() === String(resolved.lang).toLowerCase() &&
    nums.some((num) => numKey(card.num) === numKey(num))
  )

  if (matches.length === 0) {
    return { setAbbr: resolved.set_abbr, num: nums[0], lang: resolved.lang, masterCardId: null, masterCardName: null, status: 'NO_MASTER_CARD', reason: `No master_cards row for ${resolved.set_abbr} / ${nums.join('|')} / ${resolved.lang}.`, setResolveSource: resolved.source }
  }
  const uniqueById = [...new Map(matches.map((card) => [card.id, card])).values()]
  if (uniqueById.length > 1) {
    return { setAbbr: resolved.set_abbr, num: nums[0], lang: resolved.lang, masterCardId: null, masterCardName: null, status: 'AMBIGUOUS_MASTER_CARD', reason: `${uniqueById.length} master_cards rows match parsed set_abbr + num + lang.`, setResolveSource: resolved.source }
  }

  const master = uniqueById[0]
  const psaName = normalizeCardName(psaRow.card_name)
  const masterName = normalizeCardName(master.card_name)
  const baseCardConfirmed = Boolean(psaName && masterName && (psaName === masterName || psaName.includes(masterName) || masterName.includes(psaName)))
  if (!baseCardConfirmed) {
    return {
      setAbbr: master.set_abbr,
      num: master.num,
      lang: master.lang,
      masterCardId: master.id,
      masterCardName: master.card_name,
      status: 'CARD_NAME_MISMATCH',
      reason: `PSA card name "${psaRow.card_name ?? ''}" did not confirm master_cards name "${master.card_name ?? ''}".`,
      setResolveSource: resolved.source,
    }
  }

  const extraDetails = extractExtraLabelDetails(psaRow.card_name, master.card_name)
  return {
    setAbbr: master.set_abbr,
    num: master.num,
    lang: master.lang,
    masterCardId: master.id,
    masterCardName: master.card_name,
    status: 'MATCHED_CONFIRMED',
    reason: extraDetails ? `Base card confirmed; PSA extra label details: ${extraDetails}` : null,
    extraDetails,
    setResolveSource: resolved.source,
  }
}

loadEnv('/root/projects/inventory-logger/.env')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
mkdirSync(REPORT_DIR, { recursive: true })

const scans = await fetchAll(
  sb,
  'slab_stocktake_reconciliation',
  'scan_id,session_id,cert_number,scan_status,location_hint,psa_row_id,slab_id,psa_description,psa_grade,psa_card_name,psa_set_name,psa_card_number',
  (query) => query.in('session_id', sessionIds).in('scan_status', ['matched_psa_only', 'new_cert']).order('cert_number', { ascending: true }),
)
const psaIds = [...new Set(scans.map((scan) => scan.psa_row_id).filter(Boolean))]
const psaRows = []
for (const ids of chunk(psaIds, 100)) {
  const { data, error } = await sb
    .from('psa_grading_order_rows')
    .select('id,cert_number,psa_order_number,description,grade,numeric_grade,brand,language_or_release,set_code,set_name,card_number,card_name,variety,year')
    .in('id', ids)
  if (error) throw error
  psaRows.push(...(data ?? []))
}
const psaById = new Map(psaRows.map((row) => [row.id, row]))
const masterRows = await fetchAll(sb, 'master_cards', 'id,set_abbr,num,lang,card_name')
const cardSets = await fetchAll(sb, 'card_sets', 'id,set_abbr,lang,canonical_set_name')
const aliasesRaw = await fetchAll(sb, 'card_set_aliases', 'id,card_set_id,alias_name,alias_set_code,alias_language_text,confidence,source')
const cardSetById = new Map(cardSets.map((set) => [set.id, set]))
const aliases = aliasesRaw
  .map((alias) => ({ ...alias, cardSet: cardSetById.get(alias.card_set_id) }))
  .filter((alias) => alias.cardSet)

const candidates = scans.map((scan) => {
  const psaRow = scan.psa_row_id ? psaById.get(scan.psa_row_id) : null
  const match = psaRow
    ? evaluateMasterMatch(psaRow, masterRows, cardSets, aliases)
    : { setAbbr: null, num: null, lang: null, masterCardId: null, masterCardName: null, status: 'PARSE_INCOMPLETE', reason: 'No PSA staging row matched this physical cert.' }
  const listingState = scan.location_hint === 'awaiting_auction' ? 'AWAITING_AUCTION' : 'LISTED'
  const acquisitionType = scan.scan_status === 'matched_psa_only' ? 'GRADED_BY_US' : 'UNKNOWN'
  const metadataStatus = match.status === 'MATCHED_CONFIRMED' ? 'PARSED_CONFIRMED' : 'NEEDS_ENRICHMENT'
  return {
    cert: scan.cert_number,
    scan_id: scan.scan_id,
    session_id: scan.session_id,
    location_hint: scan.location_hint,
    scan_status: scan.scan_status,
    psa_row_id: scan.psa_row_id ?? '',
    psa_order_number: psaRow?.psa_order_number ?? '',
    psa_description: psaRow?.description ?? '',
    psa_grade: psaRow?.grade ?? '',
    numeric_grade: psaRow?.numeric_grade ?? '',
    psa_language_or_release: psaRow?.language_or_release ?? '',
    psa_set_code: psaRow?.set_code ?? '',
    psa_set_name: psaRow?.set_name ?? '',
    psa_card_number: psaRow?.card_number ?? '',
    psa_card_name: psaRow?.card_name ?? '',
    parsed_set_abbr: match.setAbbr ?? '',
    parsed_num: match.num ?? '',
    parsed_lang: match.lang ?? '',
    set_resolve_source: match.setResolveSource ?? '',
    master_card_id: match.masterCardId ?? '',
    master_card_name: match.masterCardName ?? '',
    master_card_match_status: match.status,
    parse_review_reason: match.reason ?? '',
    psa_label_extra_details: match.extraDetails ?? '',
    proposed_listing_state: listingState,
    proposed_acquisition_type: acquisitionType,
    proposed_metadata_status: metadataStatus,
    promote_with_strict_query_fields: match.status === 'MATCHED_CONFIRMED' ? 'yes' : 'no',
  }
})

if (shouldUpdatePsaRows) {
  const byPsaId = new Map()
  for (const row of candidates) {
    if (!row.psa_row_id) continue
    byPsaId.set(row.psa_row_id, row)
  }
  for (const rows of chunk([...byPsaId.values()], 100)) {
    const payload = rows.map((row) => ({
      id: row.psa_row_id,
      parsed_set_abbr: row.parsed_set_abbr || null,
      parsed_num: row.parsed_num || null,
      parsed_lang: row.parsed_lang || null,
      matched_master_card_id: row.master_card_id || null,
      master_card_match_status: row.master_card_match_status,
      parse_review_reason: row.parse_review_reason || null,
      psa_label_extra_details: row.psa_label_extra_details || null,
      parsed_at: new Date().toISOString(),
    }))
    for (const update of payload) {
      const { id, ...fields } = update
      const { error } = await sb.from('psa_grading_order_rows').update(fields).eq('id', id)
      if (error) throw error
    }
  }
}

const summary = candidates.reduce((acc, row) => {
  acc.total += 1
  acc.byScanStatus[row.scan_status] = (acc.byScanStatus[row.scan_status] ?? 0) + 1
  acc.byMatchStatus[row.master_card_match_status] = (acc.byMatchStatus[row.master_card_match_status] ?? 0) + 1
  acc.bySetResolveSource[row.set_resolve_source || 'none'] = (acc.bySetResolveSource[row.set_resolve_source || 'none'] ?? 0) + 1
  acc.strictPromotable += row.promote_with_strict_query_fields === 'yes' ? 1 : 0
  return acc
}, { total: 0, strictPromotable: 0, byScanStatus: {}, byMatchStatus: {}, bySetResolveSource: {} })

writeFileSync(join(REPORT_DIR, 'slab_promotion_candidates.csv'), toCsv(candidates))
writeFileSync(join(REPORT_DIR, 'slab_promotion_candidates_confirmed.csv'), toCsv(candidates.filter((row) => row.master_card_match_status === 'MATCHED_CONFIRMED')))
writeFileSync(join(REPORT_DIR, 'slab_promotion_candidates_needs_review.csv'), toCsv(candidates.filter((row) => row.master_card_match_status !== 'MATCHED_CONFIRMED')))
writeFileSync(join(REPORT_DIR, 'slab_promotion_candidates_summary.json'), JSON.stringify({ ...summary, sessionIds, updatedPsaRows: shouldUpdatePsaRows }, null, 2))

console.log(JSON.stringify({ reportDir: REPORT_DIR, ...summary, updatedPsaRows: shouldUpdatePsaRows }, null, 2))
