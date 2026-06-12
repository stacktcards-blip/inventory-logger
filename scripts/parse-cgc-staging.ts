import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function loadEnv(path: string) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function normText(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/POKÉMON/g, 'POKEMON')
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: unknown): string {
  return normText(value).replace(/\s+/g, '')
}

function normalizeCardName(value: unknown): string {
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

function extractExtraLabelDetails(labelName: unknown, masterName: unknown): string {
  const labelWords = normText(labelName).match(/[A-Z0-9]+/g) ?? []
  const masterWords = new Set(normText(masterName).match(/[A-Z0-9]+/g) ?? [])
  for (const word of [...masterWords]) {
    for (const suffix of ['EX', 'GX', 'VSTAR', 'VMAX']) {
      if (word.endsWith(suffix) && word.length > suffix.length) {
        masterWords.add(word.slice(0, -suffix.length))
        masterWords.add(suffix)
      }
    }
  }
  return labelWords.filter((word) => !masterWords.has(word)).join(' ')
}

function detectLang(row: { language_or_release?: string | null; set_code?: string | null; set_name?: string | null; description?: string | null }): string | null {
  const blob = normText([row.language_or_release, row.set_code, row.set_name, row.description].filter(Boolean).join(' '))
  if (/\b(TRADITIONAL CHINESE|CHINESE|CHN|CN)\b/.test(blob)) return 'chn'
  if (/\b(JAPANESE|JPN|JP)\b/.test(blob)) return 'jpn'
  if (/\b(ENGLISH|ENG|EN)\b/.test(blob)) return 'eng'
  return null
}

function normalizeNum(value: unknown): string | null {
  const text = String(value ?? '').trim().toUpperCase()
  if (!text) return null
  const slashless = text.split('/')[0].trim()
  return slashless || null
}

function numKey(value: unknown): string {
  const text = normalizeNum(value)
  if (!text) return ''
  const match = text.match(/^0*(\d+)([A-Z]*)$/)
  return match ? `${Number(match[1])}${match[2]}` : text.replace(/^0+(?=\d)/, '')
}

function candidateNumbers(row: { card_number?: string | null; card_name?: string | null; description?: string | null }): string[] {
  const candidates: string[] = []
  const add = (value: unknown) => {
    const normalized = normalizeNum(value)
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
  }
  const leadingCardNameNumber = String(row.card_name ?? '').trim().match(/^([A-Z]{0,3}\d{1,4}[A-Z]?|\d{1,4}[A-Z]?)(?:\b|\/)/i)
  if (leadingCardNameNumber) add(leadingCardNameNumber[1])
  const cardNumberIs151SetContext =
    leadingCardNameNumber &&
    normalizeNum(row.card_number) === '151' &&
    /\b(151|SV2A|POKEMON 151)\b/i.test([row.description].filter(Boolean).join(' '))
  if (!cardNumberIs151SetContext) add(row.card_number)
  const blob = String([row.description, row.card_name].filter(Boolean).join(' ')).toUpperCase()
  for (const match of blob.matchAll(/(?:#|\bNO\.?\s*)?([A-Z]{0,3}\d{1,4}[A-Z]?|\d{1,4}[A-Z]?)(?:\/\d{1,4})?\b/g)) {
    const value = match[1]
    if (cardNumberIs151SetContext && value === '151') continue
    if (!['10', '9', '8', '7', '2020', '2021', '2022', '2023', '2024', '2025', '2026'].includes(value)) add(value)
  }
  return candidates
}

function aliasScore(alias: CardSetAlias & { cardSet?: CardSet }): number {
  let score = 0
  if (alias.confidence === 'manual') score += 1000
  if (alias.confidence === 'high') score += 500
  if (alias.alias_set_code) score += 100
  if (alias.alias_language_text) score += 100
  score += compact(alias.alias_name).length
  return score
}

function resolveSet(row: CgcRow, cardSets: CardSet[], aliases: (CardSetAlias & { cardSet?: CardSet })[]) {
  const setName = normText(row.set_name)
  const setCode = normText(row.set_code)
  const langText = normText(row.language_or_release)
  const detectedLang = detectLang(row)
  const blob = normText([
    row.description,
    row.language_or_release,
    row.set_code,
    row.set_name,
    row.card_name,
    row.variety,
    row.year,
    row.brand,
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
  if (exactAliases[0]?.cardSet) return { ...exactAliases[0].cardSet, source: 'exact_alias', alias: exactAliases[0] }

  const directSetCode = cardSets.find((set) => compact(set.set_abbr) === compact(setCode) && (!detectedLang || set.lang === detectedLang))
  if (directSetCode) return { ...directSetCode, source: 'set_code_language' }

  const relaxedAliases = aliases
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
  if (relaxedAliases[0]?.cardSet) return { ...relaxedAliases[0].cardSet, source: 'contained_alias', alias: relaxedAliases[0] }

  return { set_abbr: null, lang: detectedLang, source: null, reason: 'No card_set_aliases/card_sets mapping matched CGC metadata.' }
}

function evaluateMasterMatch(row: CgcRow, masterRows: MasterCard[], cardSets: CardSet[], aliases: (CardSetAlias & { cardSet?: CardSet })[]) {
  if (String(row.brand ?? '').toUpperCase() && !String(row.brand ?? '').toUpperCase().includes('POKEMON')) {
    return { setAbbr: null, num: null, lang: null, masterCardId: null, masterCardName: null, status: 'NON_POKEMON', reason: `Brand is ${row.brand}` }
  }

  const resolved = resolveSet(row, cardSets, aliases)
  const nums = candidateNumbers(row)
  if (!resolved.set_abbr || !resolved.lang || nums.length === 0) {
    return {
      setAbbr: resolved.set_abbr,
      num: nums[0] ?? null,
      lang: resolved.lang,
      masterCardId: null,
      masterCardName: null,
      status: 'PARSE_INCOMPLETE',
      reason: !resolved.set_abbr ? resolved.reason : 'Could not derive a card number from CGC metadata.',
    }
  }

  const matches = masterRows.filter((card) =>
    compact(card.set_abbr) === compact(resolved.set_abbr) &&
    String(card.lang ?? '').toLowerCase() === String(resolved.lang).toLowerCase() &&
    nums.some((num) => numKey(card.num) === numKey(num))
  )

  if (matches.length === 0) {
    return {
      setAbbr: resolved.set_abbr,
      num: nums[0],
      lang: resolved.lang,
      masterCardId: null,
      masterCardName: null,
      status: 'NO_MASTER_CARD',
      reason: `No master_cards row for ${resolved.set_abbr} / ${nums.join('|')} / ${resolved.lang}.`,
    }
  }

  const uniqueById = [...new Map(matches.map((card) => [card.id, card])).values()]
  if (uniqueById.length > 1) {
    return {
      setAbbr: resolved.set_abbr,
      num: nums[0],
      lang: resolved.lang,
      masterCardId: null,
      masterCardName: null,
      status: 'AMBIGUOUS_MASTER_CARD',
      reason: `${uniqueById.length} master_cards rows match parsed set_abbr + num + lang.`,
    }
  }

  const master = uniqueById[0]
  const cgcName = normalizeCardName(row.card_name)
  const masterName = normalizeCardName(master.card_name)
  const baseCardConfirmed = Boolean(cgcName && masterName && (cgcName === masterName || cgcName.includes(masterName) || masterName.includes(cgcName)))
  if (!baseCardConfirmed) {
    return {
      setAbbr: master.set_abbr,
      num: master.num,
      lang: master.lang,
      masterCardId: master.id,
      masterCardName: master.card_name,
      status: 'CARD_NAME_MISMATCH',
      reason: `CGC card name "${row.card_name ?? ''}" did not confirm master_cards name "${master.card_name ?? ''}".`,
    }
  }

  const extraDetails = extractExtraLabelDetails(row.card_name, master.card_name)
  return {
    setAbbr: master.set_abbr,
    num: master.num,
    lang: master.lang,
    masterCardId: master.id,
    masterCardName: master.card_name,
    status: 'MATCHED_CONFIRMED',
    reason: extraDetails ? `Base card confirmed; CGC extra label details: ${extraDetails}` : null,
    extraDetails,
  }
}

loadEnv('/root/projects/inventory-logger/.env')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAll<T>(table: string, select: string) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

async function main() {
  const cgcRows = await fetchAll<CgcRow>('cgc_grading_order_rows', 'id,cert_number,description,grade,numeric_grade,normalized_grade,language_or_release,set_code,set_name,card_number,card_name,variety,year,brand')
  const masterRows = await fetchAll<MasterCard>('master_cards', 'id,set_abbr,num,lang,card_name')
  const cardSets = await fetchAll<CardSet>('card_sets', 'id,set_abbr,lang,canonical_set_name')
  const aliasesRaw = await fetchAll<CardSetAlias>('card_set_aliases', 'id,card_set_id,alias_name,alias_set_code,alias_language_text,confidence,source')
  const cardSetById = new Map(cardSets.map((set) => [set.id, set]))
  const aliases = aliasesRaw.map((alias) => ({ ...alias, cardSet: cardSetById.get(alias.card_set_id) }))

  const updates: Array<{ id: string; cert_number: string | null; parsed_set_abbr: string | null; parsed_num: string | null; parsed_lang: string | null; matched_master_card_id: number | null; master_card_match_status: string; parse_review_reason: string | null; cgc_label_extra_details: string | null; parsed_at: string }> = []
  const summary: Record<string, number> = {}

  for (const row of cgcRows) {
    const match = evaluateMasterMatch(row, masterRows, cardSets, aliases)
    summary[match.status] = (summary[match.status] ?? 0) + 1
    updates.push({
      id: row.id,
      cert_number: row.cert_number,
      parsed_set_abbr: match.setAbbr ?? null,
      parsed_num: match.num ?? null,
      parsed_lang: match.lang ?? null,
      matched_master_card_id: match.masterCardId ?? null,
      master_card_match_status: match.status,
      parse_review_reason: match.reason ?? null,
      cgc_label_extra_details: match.extraDetails ?? null,
      parsed_at: new Date().toISOString(),
    })
  }

  for (const part of chunk(updates, 100)) {
    const { error } = await supabase
      .from('cgc_grading_order_rows')
      .upsert(part, { onConflict: 'id' })
    if (error) throw error
  }

  console.log('CGC parsing summary:', summary)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

type CgcRow = {
  id: string
  cert_number: string | null
  description: string | null
  grade: string | null
  numeric_grade: number | null
  normalized_grade: string | null
  language_or_release: string | null
  set_code: string | null
  set_name: string | null
  card_number: string | null
  card_name: string | null
  variety: string | null
  year: string | null
  brand: string | null
}

type MasterCard = { id: number; set_abbr: string; num: string; lang: string; card_name: string }

type CardSet = { id: number; set_abbr: string; lang: string; canonical_set_name: string | null }

type CardSetAlias = {
  id: number
  card_set_id: number
  alias_name: string | null
  alias_set_code: string | null
  alias_language_text: string | null
  confidence: string
  source: string | null
}
