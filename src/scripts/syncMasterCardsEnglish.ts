import { createClient } from '@supabase/supabase-js';

import {
  buildPokemonPriceTrackerCardSetQueries,
  compareMasterCardCandidates,
  normalizePokemonPriceTrackerCard,
  type ComparedMasterCardCandidate,
  type ExistingMasterCard,
  type ExternalSetMapping,
  type MasterCardCandidate,
  type PokemonPriceTrackerCard,
  type PokemonPriceTrackerSet
} from '../services/masterCardEnrichment.js';

type CliOptions = {
  dryRun: boolean;
  stage: boolean;
  sourceSetId: string | null;
  limitSets: number | null;
};

type SupabaseClient = ReturnType<typeof createClient>;

const SOURCE = 'pokemon_price_tracker' as const;
const API_BASE_URL = 'https://www.pokemonpricetracker.com/api/v2';

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) throw new Error('Missing POKEMON_PRICE_TRACKER_API_KEY');
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const externalSets = await fetchPokemonPriceTrackerSets(apiKey);
  if (options.stage) {
    await upsertDiscoveredSetMappings(supabase, externalSets);
  } else {
    const englishSets = externalSets.filter((set) => normalizeExternalSetLanguage(set.language) === 'ENG').length;
    console.log(`Discovered ${englishSets} English external sets. Re-run with --stage to upsert new set-mapping review rows.`);
  }

  const mappings = await fetchConfirmedMappings(supabase, options);
  if (!mappings.length) {
    console.log('No confirmed English set mappings found. Add rows to external_card_set_mappings first.');
    console.log('New/unknown sets were staged as mapping candidates where possible.');
    return;
  }

  const existingCards = await fetchExistingEnglishMasterCards(supabase);
  const allCandidates: MasterCardCandidate[] = [];
  const rawPayloadBySourceCardId = new Map<string, PokemonPriceTrackerCard>();

  for (const mapping of mappings) {
    const cards = await fetchCardsForSet(apiKey, mapping);
    for (const card of cards) {
      const candidate = normalizePokemonPriceTrackerCard(card, mapping);
      allCandidates.push(candidate);
      if (candidate.sourceCardId) rawPayloadBySourceCardId.set(candidate.sourceCardId, card);
    }
  }

  const compared = compareMasterCardCandidates(allCandidates, existingCards);
  printSummary(compared, { dryRun: options.dryRun, stage: options.stage, mappings: mappings.length });

  if (options.stage) {
    const stagedCount = await stageComparedCandidates(supabase, compared, rawPayloadBySourceCardId);
    console.log(`Staged/updated ${stagedCount} master_card_import_staging rows.`);
  } else {
    console.log('No staging write performed. Re-run with --stage to upsert review rows.');
  }
};

const parseArgs = (args: string[]): CliOptions => {
  const sourceSetArg = args.find((arg) => arg.startsWith('--set='));
  const limitSetsArg = args.find((arg) => arg.startsWith('--limit-sets='));

  return {
    dryRun: !args.includes('--stage'),
    stage: args.includes('--stage'),
    sourceSetId: sourceSetArg ? sourceSetArg.split('=')[1] || null : null,
    limitSets: limitSetsArg ? Number.parseInt(limitSetsArg.split('=')[1] || '', 10) || null : null
  };
};

const fetchPokemonPriceTrackerSets = async (apiKey: string): Promise<PokemonPriceTrackerSet[]> => {
  const json = await fetchJson(`${API_BASE_URL}/sets?sortBy=releaseDate&sortOrder=desc`, apiKey);
  return unwrapArray<PokemonPriceTrackerSet>(json);
};

const fetchCardsForSet = async (apiKey: string, mapping: ExternalSetMapping): Promise<PokemonPriceTrackerCard[]> => {
  for (const query of buildPokemonPriceTrackerCardSetQueries(mapping)) {
    const cards = unwrapArray<PokemonPriceTrackerCard>(await fetchJson(`${API_BASE_URL}/cards?${query}`, apiKey));
    if (cards.length) return cards;
  }

  return [];
};

const fetchJson = async (url: string, apiKey: string, attempt = 1): Promise<unknown> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });

  if (response.status === 429 && attempt <= 3) {
    const body = await response.text();
    const retryAfter = parseRetryAfterSeconds(response.headers.get('retry-after'), body);
    console.warn(`Pokemon Price Tracker rate limit hit; retrying in ${retryAfter}s (${url})`);
    await sleep(retryAfter * 1000);
    return fetchJson(url, apiKey, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pokemon Price Tracker request failed ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
  }

  return response.json();
};

const parseRetryAfterSeconds = (headerValue: string | null, body: string) => {
  const headerSeconds = headerValue ? Number.parseInt(headerValue, 10) : Number.NaN;
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) return Math.min(headerSeconds, 120);

  try {
    const parsed = JSON.parse(body) as { retryAfter?: unknown };
    const bodySeconds = typeof parsed.retryAfter === 'number' ? parsed.retryAfter : Number.parseInt(String(parsed.retryAfter ?? ''), 10);
    if (Number.isFinite(bodySeconds) && bodySeconds > 0) return Math.min(bodySeconds, 120);
  } catch {
    // Body is not JSON; fall through to conservative default.
  }

  return 60;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const unwrapArray = <T>(json: unknown): T[] => {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === 'object') {
    const record = json as Record<string, unknown>;
    for (const key of ['data', 'sets', 'cards', 'results', 'items']) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
};

const upsertDiscoveredSetMappings = async (supabase: SupabaseClient, sets: PokemonPriceTrackerSet[]) => {
  const rows = sets
    .map((set) => {
      const sourceSetId = set.id ?? set.setId;
      const sourceSetName = set.name ?? set.setName ?? null;
      const lang = normalizeExternalSetLanguage(set.language);
      if (!sourceSetId || lang !== 'ENG') return null;
      return {
        source: SOURCE,
        source_set_id: sourceSetId,
        source_set_name: sourceSetName,
        lang,
        confidence: 'needs_review',
        status: 'needs_review'
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (!rows.length) return;

  const { error } = await supabase
    .from('external_card_set_mappings')
    .upsert(rows, { onConflict: 'source,source_set_id,lang', ignoreDuplicates: true });

  if (error) throw new Error(`Failed to stage discovered set mappings: ${error.message}`);
};

const fetchConfirmedMappings = async (supabase: SupabaseClient, options: CliOptions): Promise<ExternalSetMapping[]> => {
  let query = supabase
    .from('external_card_set_mappings')
    .select('source, source_set_id, source_set_name, lang, stackt_set_abbr, status')
    .eq('source', SOURCE)
    .eq('lang', 'ENG')
    .eq('status', 'confirmed')
    .not('stackt_set_abbr', 'is', null)
    .order('source_set_id', { ascending: true });

  if (options.sourceSetId) query = query.eq('source_set_id', options.sourceSetId);
  if (options.limitSets) query = query.limit(options.limitSets);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load confirmed set mappings: ${error.message}`);

  return ((data ?? []) as Array<{
    source_set_id: string;
    source_set_name: string | null;
    lang: string;
    stackt_set_abbr: string;
  }>).map((row) => ({
    source: SOURCE,
    sourceSetId: row.source_set_id,
    sourceSetName: row.source_set_name,
    lang: row.lang,
    stacktSetAbbr: row.stackt_set_abbr,
    status: 'confirmed'
  }));
};

const fetchExistingEnglishMasterCards = async (supabase: SupabaseClient): Promise<ExistingMasterCard[]> => {
  const pageSize = 1000;
  let from = 0;
  const rows: ExistingMasterCard[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('master_cards')
      .select('id, card_name, set_abbr, num, lang')
      .ilike('lang', 'ENG')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load master_cards: ${error.message}`);
    if (!data?.length) break;

    rows.push(...((data ?? []) as Array<{
      id: number;
      card_name: string | null;
      set_abbr: string | null;
      num: string | null;
      lang: string | null;
    }>).map((row) => ({
      id: row.id,
      cardName: row.card_name,
      setAbbr: row.set_abbr,
      num: row.num,
      lang: row.lang
    })));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

const stageComparedCandidates = async (
  supabase: SupabaseClient,
  compared: ComparedMasterCardCandidate[],
  rawPayloadBySourceCardId: Map<string, PokemonPriceTrackerCard>
) => {
  const rows = compared.map((candidate) => ({
    source: candidate.source,
    source_card_id: candidate.sourceCardId,
    source_set_id: candidate.sourceSetId,
    source_set_name: candidate.sourceSetName,
    source_card_name: candidate.sourceCardName,
    source_card_number: candidate.sourceCardNumber,
    source_language: candidate.sourceLanguage,
    source_rarity: candidate.sourceRarity,
    normalized_card_name: candidate.normalizedCardName,
    normalized_set_abbr: candidate.normalizedSetAbbr,
    normalized_num: candidate.normalizedNum,
    normalized_lang: candidate.normalizedLang,
    match_status: candidate.matchStatus,
    match_reason: candidate.matchReason,
    existing_master_card_id: candidate.existingMasterCardId,
    raw_payload: candidate.sourceCardId ? rawPayloadBySourceCardId.get(candidate.sourceCardId) ?? null : null
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('master_card_import_staging')
      .upsert(chunk, { onConflict: 'source,source_card_id,normalized_lang' });

    if (error) throw new Error(`Failed to stage master card candidates: ${error.message}`);
  }

  return rows.length;
};

const printSummary = (
  compared: ComparedMasterCardCandidate[],
  context: { dryRun: boolean; stage: boolean; mappings: number }
) => {
  const counts = compared.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.matchStatus] = (acc[candidate.matchStatus] ?? 0) + 1;
    return acc;
  }, {});

  console.log('Master Cards English Sync Summary');
  console.log(`Mode: ${context.stage ? 'stage review rows' : 'dry-run only'}`);
  console.log(`Confirmed set mappings used: ${context.mappings}`);
  console.log(`Cards fetched/compared: ${compared.length}`);
  for (const [status, count] of Object.entries(counts).sort()) {
    console.log(`${status}: ${count}`);
  }
};

const normalizeExternalSetLanguage = (value: string | null | undefined) => {
  const cleaned = value?.trim().toUpperCase();
  if (!cleaned || ['EN', 'ENG', 'ENGLISH'].includes(cleaned)) return 'ENG';
  if (['JP', 'JPN', 'JAPANESE'].includes(cleaned)) return 'JPN';
  return cleaned;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
