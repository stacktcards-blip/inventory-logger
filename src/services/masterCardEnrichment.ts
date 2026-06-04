export type MasterCardImportSource = 'pokemon_price_tracker';

export type PokemonPriceTrackerCard = {
  id?: string | number | null;
  tcgPlayerId?: string | number | null;
  name?: string | null;
  cardName?: string | null;
  number?: string | null;
  cardNumber?: string | null;
  setId?: string | null;
  setName?: string | null;
  language?: string | null;
  rarity?: string | null;
};

export type PokemonPriceTrackerSet = {
  id?: string | null;
  setId?: string | null;
  name?: string | null;
  setName?: string | null;
  language?: string | null;
  releaseDate?: string | null;
};

export type ExternalSetMapping = {
  source: MasterCardImportSource;
  sourceSetId: string;
  sourceSetName: string | null;
  lang: string;
  stacktSetAbbr: string;
  status: 'confirmed' | 'needs_review' | 'ignored';
};

export type MasterCardCandidate = {
  source: MasterCardImportSource;
  sourceCardId: string | null;
  sourceSetId: string | null;
  sourceSetName: string | null;
  sourceCardName: string | null;
  sourceCardNumber: string | null;
  sourceLanguage: string | null;
  sourceRarity: string | null;
  normalizedCardName: string | null;
  normalizedSetAbbr: string | null;
  normalizedNum: string | null;
  normalizedLang: string;
};

export type ExistingMasterCard = {
  id: number;
  cardName: string | null;
  setAbbr: string | null;
  num: string | null;
  lang: string | null;
};

export type MasterCardMatchStatus =
  | 'MATCHED_EXISTING'
  | 'NEW_CARD_CANDIDATE'
  | 'SET_MAPPING_NEEDED'
  | 'CARD_NUMBER_CONFLICT'
  | 'CARD_NAME_CONFLICT'
  | 'VARIANT_CANDIDATE'
  | 'PARSE_INCOMPLETE';

export type ComparedMasterCardCandidate = MasterCardCandidate & {
  matchStatus: MasterCardMatchStatus;
  matchReason: string;
  existingMasterCardId: number | null;
};

export const normalizePokemonPriceTrackerCard = (
  card: PokemonPriceTrackerCard,
  mapping: ExternalSetMapping | null
): MasterCardCandidate => {
  const sourceCardName = cleanNullable(card.name ?? card.cardName ?? null);
  const sourceCardNumber = cleanNullable(card.number ?? card.cardNumber ?? null);
  const sourceSetId = cleanNullable(card.setId ?? null);
  const sourceSetName = cleanNullable(card.setName ?? null);
  const sourceLanguage = cleanNullable(card.language ?? null);
  const normalizedLang = normalizeLanguage(mapping?.lang ?? sourceLanguage ?? 'ENG') ?? 'ENG';

  return {
    source: 'pokemon_price_tracker',
    sourceCardId: cleanNullable(String(card.id ?? card.tcgPlayerId ?? '')),
    sourceSetId,
    sourceSetName,
    sourceCardName,
    sourceCardNumber,
    sourceLanguage,
    sourceRarity: cleanNullable(card.rarity ?? null),
    normalizedCardName: sourceCardName,
    normalizedSetAbbr: mapping?.status === 'confirmed' ? normalizeSetAbbr(mapping.stacktSetAbbr) : null,
    // Initial source-derived shape only. compareMasterCardCandidates then rewrites this
    // into the existing master_cards number convention for that set/lang when possible.
    normalizedNum: normalizeCardNumber(sourceCardNumber),
    normalizedLang
  };
};

export const buildPokemonPriceTrackerCardSetQueries = (mapping: ExternalSetMapping): string[] => {
  const queries: string[] = [];
  if (mapping.sourceSetName) {
    queries.push(`set=${encodeURIComponent(mapping.sourceSetName)}&fetchAllInSet=true`);
  }
  queries.push(`setId=${encodeURIComponent(mapping.sourceSetId)}&fetchAllInSet=true`);
  return queries;
};

export const compareMasterCardCandidates = (
  candidates: MasterCardCandidate[],
  existingCards: ExistingMasterCard[]
): ComparedMasterCardCandidate[] => {
  const existingByKey = new Map(existingCards.map((card) => [strictKey(card.setAbbr, card.num, card.lang), card]));
  const numberStyleBySetLang = buildNumberStyleBySetLang(existingCards);
  const resolvedCandidates = candidates.map((candidate) => resolveCandidateNumberStyle(candidate, existingByKey, numberStyleBySetLang));
  const candidateKeyCounts = new Map<string, number>();

  for (const candidate of resolvedCandidates) {
    const key = strictKey(candidate.normalizedSetAbbr, candidate.normalizedNum, candidate.normalizedLang);
    if (key) candidateKeyCounts.set(key, (candidateKeyCounts.get(key) ?? 0) + 1);
  }

  const seenCandidateKeys = new Set<string>();

  return resolvedCandidates.map((candidate) => {
    const key = strictKey(candidate.normalizedSetAbbr, candidate.normalizedNum, candidate.normalizedLang);

    if (!candidate.normalizedSetAbbr) {
      return withStatus(candidate, 'SET_MAPPING_NEEDED', 'No confirmed source set to Stackt set_abbr mapping', null);
    }
    if (!candidate.normalizedNum || !candidate.normalizedCardName) {
      return withStatus(candidate, 'PARSE_INCOMPLETE', 'Missing normalized card number or card name', null);
    }

    const existing = key ? existingByKey.get(key) : undefined;
    if (key && (candidateKeyCounts.get(key) ?? 0) > 1 && seenCandidateKeys.has(key)) {
      return withStatus(
        candidate,
        'VARIANT_CANDIDATE',
        'Multiple source cards share the same strict key; review as a possible variant/printing under the base master_card',
        existing?.id ?? null
      );
    }
    if (key) seenCandidateKeys.add(key);

    if (!existing) {
      return withStatus(candidate, 'NEW_CARD_CANDIDATE', 'Strict key not found in master_cards', null);
    }

    if (!baseCardNamesConfirm(candidate.normalizedCardName, existing.cardName)) {
      return withStatus(candidate, 'CARD_NAME_CONFLICT', 'Strict key exists but source card name differs from master_cards card_name', existing.id);
    }

    return withStatus(candidate, 'MATCHED_EXISTING', 'Strict key and card name confirmed against master_cards', existing.id);
  });
};

export const normalizeCardNumber = (value: string | null | undefined): string | null => {
  const cleaned = cleanNullable(value);
  if (!cleaned) return null;
  const compact = compactCardNumber(cleaned);
  if (!compact) return null;

  // No global padding. Stackt master_cards is set-aware: GEN uses 9/43, while
  // many newer sets use 001/025/etc. compareMasterCardCandidates resolves the
  // final normalized_num against existing master_cards conventions per set/lang.
  if (/^\d+$/.test(compact)) return stripNumericLeadingZeroes(compact);

  const lettered = compact.match(/^([A-Z]+)(\d+)$/);
  if (lettered) {
    return `${lettered[1]}${lettered[2].padStart(2, '0')}`;
  }

  return compact;
};

export const normalizeLanguage = (value: string | null | undefined): string | null => {
  const cleaned = cleanNullable(value)?.toUpperCase();
  if (!cleaned) return null;
  if (['EN', 'ENG', 'ENGLISH'].includes(cleaned)) return 'ENG';
  if (['JP', 'JPN', 'JAPANESE'].includes(cleaned)) return 'JPN';
  return cleaned;
};

export const normalizeSetAbbr = (value: string | null | undefined): string | null => {
  const cleaned = cleanNullable(value);
  return cleaned ? cleaned.toUpperCase() : null;
};

type NumericNumberStyle = {
  numericPadLength: number | null;
};

const buildNumberStyleBySetLang = (existingCards: ExistingMasterCard[]) => {
  const buckets = new Map<string, number[]>();

  for (const card of existingCards) {
    const setLang = setLangKey(card.setAbbr, card.lang);
    const compact = compactCardNumber(card.num);
    if (!setLang || !compact || !/^\d+$/.test(compact)) continue;
    const stripped = stripNumericLeadingZeroes(compact);
    if (stripped !== compact) {
      const lengths = buckets.get(setLang) ?? [];
      lengths.push(compact.length);
      buckets.set(setLang, lengths);
    }
  }

  const styles = new Map<string, NumericNumberStyle>();
  for (const [key, lengths] of buckets.entries()) {
    const counts = lengths.reduce<Record<number, number>>((acc, length) => {
      acc[length] = (acc[length] ?? 0) + 1;
      return acc;
    }, {});
    const numericPadLength = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '') || null;
    styles.set(key, { numericPadLength });
  }

  return styles;
};

const resolveCandidateNumberStyle = (
  candidate: MasterCardCandidate,
  existingByKey: Map<string, ExistingMasterCard>,
  numberStyleBySetLang: Map<string, NumericNumberStyle>
): MasterCardCandidate => {
  const variants = cardNumberVariants(candidate.sourceCardNumber ?? candidate.normalizedNum);

  for (const variant of variants) {
    const key = strictKey(candidate.normalizedSetAbbr, variant, candidate.normalizedLang);
    const existing = existingByKey.get(key);
    if (existing?.num) return { ...candidate, normalizedNum: existing.num };
  }

  const sourceCompact = compactCardNumber(candidate.sourceCardNumber ?? candidate.normalizedNum);
  if (!sourceCompact || !/^\d+$/.test(sourceCompact)) return candidate;

  const style = numberStyleBySetLang.get(setLangKey(candidate.normalizedSetAbbr, candidate.normalizedLang));
  if (style?.numericPadLength) {
    return { ...candidate, normalizedNum: stripNumericLeadingZeroes(sourceCompact).padStart(style.numericPadLength, '0') };
  }

  return { ...candidate, normalizedNum: stripNumericLeadingZeroes(sourceCompact) };
};

const cardNumberVariants = (value: string | null | undefined): string[] => {
  const compact = compactCardNumber(value);
  if (!compact) return [];

  const variants = new Set<string>([normalizeCardNumber(compact) ?? compact, compact]);
  if (/^\d+$/.test(compact)) {
    const stripped = stripNumericLeadingZeroes(compact);
    variants.add(stripped);
    variants.add(stripped.padStart(2, '0'));
    variants.add(stripped.padStart(3, '0'));
  }

  const lettered = compact.match(/^([A-Z]+)(\d+)$/);
  if (lettered) {
    const stripped = stripNumericLeadingZeroes(lettered[2]);
    variants.add(`${lettered[1]}${stripped}`);
    variants.add(`${lettered[1]}${stripped.padStart(2, '0')}`);
    variants.add(`${lettered[1]}${stripped.padStart(3, '0')}`);
  }

  return [...variants];
};

const compactCardNumber = (value: string | null | undefined): string | null => {
  const cleaned = cleanNullable(value);
  if (!cleaned) return null;
  const beforeSlash = cleaned.split('/')[0]?.trim() ?? cleaned;
  const compact = beforeSlash.replace(/\s+/g, '').toUpperCase();
  return compact || null;
};

const stripNumericLeadingZeroes = (value: string) => value.replace(/^0+(?=\d)/, '') || '0';

const setLangKey = (setAbbr: string | null | undefined, lang: string | null | undefined) => {
  const normalizedSet = normalizeSetAbbr(setAbbr);
  const normalizedLang = normalizeLanguage(lang);
  return normalizedSet && normalizedLang ? `${normalizedSet}|${normalizedLang}` : '';
};

const withStatus = (
  candidate: MasterCardCandidate,
  matchStatus: MasterCardMatchStatus,
  matchReason: string,
  existingMasterCardId: number | null
): ComparedMasterCardCandidate => ({
  ...candidate,
  matchStatus,
  matchReason,
  existingMasterCardId
});

const strictKey = (setAbbr: string | null | undefined, num: string | null | undefined, lang: string | null | undefined) => {
  const normalizedSet = normalizeSetAbbr(setAbbr);
  const normalizedNum = compactCardNumber(num);
  const normalizedLang = normalizeLanguage(lang);
  if (!normalizedSet || !normalizedNum || !normalizedLang) return '';
  return `${normalizedSet}|${normalizedNum}|${normalizedLang}`;
};

const baseCardNamesConfirm = (sourceName: string | null, masterName: string | null) => {
  const source = normalizeNameForCompare(sourceName);
  const master = normalizeNameForCompare(masterName);
  if (!source || !master) return false;
  return source === master || source.includes(master) || master.includes(source);
};

const normalizeNameForCompare = (value: string | null | undefined) =>
  cleanNullable(value)
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '') ?? '';

const cleanNullable = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
};
