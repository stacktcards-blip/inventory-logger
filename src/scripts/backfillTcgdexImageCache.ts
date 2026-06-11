import { execFileSync, spawnSync } from 'node:child_process';

type RawKey = {
  setAbbr: string;
  cardNum: string;
  lang: string;
  canonicalSetName: string;
  rawRows: number;
};

type TcgSetSummary = {
  id: string;
  name: string;
};

type TcgCardSummary = {
  id: string;
  image?: string;
  localId: string;
  name: string;
};

type TcgSetDetail = {
  id?: string;
  name?: string;
  cards?: TcgCardSummary[];
};

type CacheRow = {
  provider: 'tcgdex';
  set_abbr: string;
  card_num: string;
  lang: string;
  image_url: string | null;
  image_small_url: string | null;
  resolved_card_id: string | null;
  resolved_set_id: string | null;
  resolved_api_lang: string | null;
  response_json: Record<string, unknown>;
};

const provider = 'tcgdex' as const;
const envDbUrl = process.env.SUPABASE_DB_URL;
const dryRun = process.argv.includes('--dry-run');
const includeAll = process.argv.includes('--all');
const useMasterCards = process.argv.includes('--master-cards');
const onlySetArg = process.argv.find((arg) => arg.startsWith('--set='));
const onlySet = onlySetArg?.slice('--set='.length).trim();

if (!envDbUrl) {
  throw new Error('SUPABASE_DB_URL is required');
}
const dbUrl = envDbUrl;

function psql(args: string[], input?: string) {
  const result = input === undefined
    ? spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', ...args], {
        input,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
  }
  return result.stdout;
}

function normalizedLangSqlExpression(column: string) {
  return `case lower(trim(${column}))
       when 'eng' then 'en'
       when 'en' then 'en'
       when 'english' then 'en'
       when 'jpn' then 'ja'
       when 'jp' then 'ja'
       when 'ja' then 'ja'
       when 'japanese' then 'ja'
       else lower(trim(${column}))
     end`;
}

function imageCacheMissingClause(sourceAlias: string, setColumn = 'set_abbr', numColumn = 'num', langColumn = 'lang') {
  if (includeAll) return '';
  const sourceSet = `${sourceAlias}.${setColumn}`;
  const sourceNum = `${sourceAlias}.${numColumn}`;
  const sourceLang = `${sourceAlias}.${langColumn}`;
  return `and not exists (
      select 1
      from tcgdex_image_cache cache
      where cache.provider = 'tcgdex'
        and lower(trim(cache.set_abbr)) = lower(trim(${sourceSet}))
        and (
          lower(trim(cache.card_num)) = lower(trim(${sourceNum}))
          or (
            lower(trim(${sourceLang})) in ('eng', 'en', 'english')
            and upper(trim(${sourceSet})) in ('XY', 'SM', 'SWSH', 'SVP', 'MEP')
            and lower(trim(cache.card_num)) in (
              lower(trim(${sourceSet}) || trim(${sourceNum})),
              lower(trim(${sourceSet}) || lpad(regexp_replace(trim(${sourceNum}), '^0+', ''), 2, '0')),
              lower(trim(${sourceSet}) || lpad(regexp_replace(trim(${sourceNum}), '^0+', ''), 3, '0'))
            )
          )
        )
        and ${normalizedLangSqlExpression('cache.lang')} = ${normalizedLangSqlExpression(sourceLang)}
        and (cache.image_url is not null or cache.image_small_url is not null)
    )`;
}

function queryMasterCardKeys(): RawKey[] {
  const setFilterClause = onlySet ? `and lower(trim(mc.set_abbr)) = lower(${sqlString(onlySet)})` : '';
  const missingImageClause = imageCacheMissingClause('mc');
  const sql = `
copy (
  select
    btrim(mc.set_abbr) as set_abbr,
    btrim(mc.num) as card_num,
    btrim(mc.lang) as lang,
    coalesce(max(cs.canonical_set_name), '') as canonical_set_name,
    count(*)::int as raw_rows
  from master_cards mc
  left join card_sets cs
    on lower(cs.set_abbr) = lower(mc.set_abbr)
   and ${normalizedLangSqlExpression('cs.lang')} = ${normalizedLangSqlExpression('mc.lang')}
  where mc.set_abbr is not null and btrim(mc.set_abbr) <> ''
    and mc.num is not null and btrim(mc.num) <> ''
    and mc.lang is not null and btrim(mc.lang) <> ''
    ${setFilterClause}
    ${missingImageClause}
  group by 1,2,3
  order by 1,2,3
) to stdout with csv header;
`;
  return parseRawKeys(psql(['-q', '-c', sql]));
}

function queryRawKeys(): RawKey[] {
  const missingPreviewClause = includeAll ? '' : 'and r.image_url is null and r.image_small_url is null';
  const setFilterClause = onlySet ? `and lower(trim(r.set_abbr)) = lower(${sqlString(onlySet)})` : '';
  const sql = `
copy (
  with unique_set_lang as (
    select
      lower(trim(set_abbr)) as set_abbr_key,
      min(trim(lang)) as inferred_lang
    from master_cards
    where set_abbr is not null and trim(set_abbr) <> ''
      and lang is not null and trim(lang) <> ''
    group by lower(trim(set_abbr))
    having count(distinct lower(trim(lang))) = 1
  )
  select
    btrim(r.set_abbr) as set_abbr,
    btrim(r.num) as card_num,
    btrim(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang)) as lang,
    coalesce(max(cs.canonical_set_name), '') as canonical_set_name,
    count(*)::int as raw_rows
  from raw_cards_enriched r
  left join unique_set_lang usl
    on usl.set_abbr_key = lower(trim(r.set_abbr))
  left join card_sets cs
    on lower(cs.set_abbr) = lower(r.set_abbr)
   and ${normalizedLangSqlExpression('cs.lang')} = ${normalizedLangSqlExpression("coalesce(nullif(trim(r.lang), ''), usl.inferred_lang)")}
  where r.set_abbr is not null and btrim(r.set_abbr) <> ''
    and r.num is not null and btrim(r.num) <> ''
    and coalesce(nullif(trim(r.lang), ''), usl.inferred_lang) is not null
    and btrim(coalesce(nullif(trim(r.lang), ''), usl.inferred_lang)) <> ''
    ${missingPreviewClause}
    ${setFilterClause}
  group by 1,2,3
  order by count(*) desc, 1,2,3
) to stdout with csv header;
`;
  return parseRawKeys(psql(['-q', '-c', sql]));
}

function parseRawKeys(out: string): RawKey[] {
  const lines = out.trim().split('\n');
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const [setAbbr, cardNum, lang, canonicalSetName, rawRows] = parseCsvLine(line);
    return { setAbbr, cardNum, lang, canonicalSetName, rawRows: Number(rawRows) || 0 };
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else if (char === '"') {
      quoted = true;
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function normalizeLang(lang: string) {
  const value = lang.trim().toLowerCase();
  if (['eng', 'en', 'english'].includes(value)) return 'en';
  if (['jpn', 'jp', 'ja', 'japanese'].includes(value)) return 'ja';
  return value;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const englishPromoSetIds: Record<string, string> = {
  XY: 'xyp',
  SM: 'smp',
  SWSH: 'swshp',
  SVP: 'svp',
  MEP: 'mep',
};

function englishPromoSetId(setAbbr: string, lang: string) {
  if (normalizeLang(lang) !== 'en') return null;
  return englishPromoSetIds[setAbbr.trim().toUpperCase()] ?? null;
}

function numberVariants(cardNum: string, setAbbr?: string, lang?: string) {
  const raw = cardNum.trim();
  const variants = new Set<string>([raw, raw.toUpperCase(), raw.toLowerCase()]);
  const noSlash = raw.includes('/') ? raw.split('/')[0] : raw;
  variants.add(noSlash);
  variants.add(noSlash.toUpperCase());
  variants.add(noSlash.toLowerCase());
  const numeric = noSlash.match(/^0*(\d+)$/)?.[1];
  if (numeric) {
    variants.add(numeric);
    variants.add(numeric.padStart(2, '0'));
    variants.add(numeric.padStart(3, '0'));
  }

  // English Black Star promo eras often print the set prefix as part of the card
  // number (e.g. SWSH144 / SWSH144, XY01, SM210). Stackt stores these split
  // as set_abbr + num, so try both the normalized DB number and the printed
  // promo identifier when resolving image sources.
  if (setAbbr && lang && englishPromoSetId(setAbbr, lang)) {
    const prefix = setAbbr.trim().toUpperCase();
    const baseNumbers = new Set<string>([noSlash]);
    if (numeric) {
      baseNumbers.add(numeric);
      baseNumbers.add(numeric.padStart(2, '0'));
      baseNumbers.add(numeric.padStart(3, '0'));
    }
    for (const number of baseNumbers) {
      variants.add(`${prefix}${number}`);
      variants.add(`${prefix}${number}`.toLowerCase());
    }
  }

  return Array.from(variants).filter(Boolean);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync('curl', ['-fsSL', '--max-time', '60', '-H', 'accept: application/json', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0) return JSON.parse(result.stdout) as T;
    // curl exits 22 for non-2xx responses under -f. Treat HTTP misses as not found.
    if (result.status === 22) return null;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    else throw new Error(`Failed to fetch ${url}: ${result.stderr || `curl exited ${result.status}`}`);
  }
  return null;
}

const setLists = new Map<string, TcgSetSummary[]>();
const setDetails = new Map<string, TcgSetDetail | null>();

async function getSetLists(apiLang: string) {
  const existing = setLists.get(apiLang);
  if (existing) return existing;
  const data = await fetchJson<TcgSetSummary[]>(`https://api.tcgdex.net/v2/${apiLang}/sets`);
  const list = data ?? [];
  setLists.set(apiLang, list);
  return list;
}

const tcgdexSetAliases: Record<string, string> = {
  XYB: 'xy1',
  CELC: 'cel25',
};

async function resolveSet(apiLang: string, rawSetAbbr: string, canonicalSetName: string) {
  const list = await getSetLists(apiLang);
  const byId = new Map(list.map((set) => [set.id.toLowerCase(), set]));
  const exact = byId.get(rawSetAbbr.toLowerCase());
  if (exact) return { set: exact, match: 'set_id_exact' };

  const aliasSetId = tcgdexSetAliases[rawSetAbbr.trim().toUpperCase()];
  if (aliasSetId) {
    const aliasSet = byId.get(aliasSetId.toLowerCase());
    if (aliasSet) return { set: aliasSet, match: 'tcgdex_set_alias' };
  }

  const promoSetId = englishPromoSetId(rawSetAbbr, apiLang);
  if (promoSetId) {
    const promoSet = byId.get(promoSetId.toLowerCase());
    if (promoSet) return { set: promoSet, match: 'english_promo_set_alias' };
  }

  const wantedName = normalizeText(canonicalSetName || rawSetAbbr);
  if (wantedName) {
    const byName = list.find((set) => normalizeText(set.name) === wantedName);
    if (byName) return { set: byName, match: 'set_name_exact' };
  }

  return { set: null, match: 'unknown_set' };
}

async function getSetDetail(apiLang: string, setId: string) {
  const key = `${apiLang}:${setId}`;
  if (setDetails.has(key)) return setDetails.get(key) ?? null;
  const data = await fetchJson<TcgSetDetail>(`https://api.tcgdex.net/v2/${apiLang}/sets/${encodeURIComponent(setId)}`);
  setDetails.set(key, data);
  return data;
}

async function resolveCard(raw: RawKey): Promise<CacheRow> {
  const apiLang = normalizeLang(raw.lang);
  const setResolution = await resolveSet(apiLang, raw.setAbbr, raw.canonicalSetName);
  if (!setResolution.set) {
    return notFound(raw, apiLang, {
      reason: 'unknown_set',
      setInput: raw.setAbbr,
      canonicalSetName: raw.canonicalSetName,
      langInput: raw.lang,
      apiLang,
    });
  }

  const detail = await getSetDetail(apiLang, setResolution.set.id);
  const cards = detail?.cards ?? [];
  const variants = numberVariants(raw.cardNum, raw.setAbbr, raw.lang).map((value) => value.toLowerCase());
  const card = cards.find((candidate) => variants.includes(candidate.localId.toLowerCase()));
  if (!card?.image) {
    return notFound(raw, apiLang, {
      reason: 'no_card_match',
      setInput: raw.setAbbr,
      setId: setResolution.set.id,
      setName: setResolution.set.name,
      setMatch: setResolution.match,
      cardNumInput: raw.cardNum,
      numVariants: numberVariants(raw.cardNum, raw.setAbbr, raw.lang),
      langInput: raw.lang,
      apiLang,
    });
  }

  return {
    provider,
    set_abbr: raw.setAbbr,
    card_num: raw.cardNum,
    lang: raw.lang,
    image_url: `${card.image}/high.webp`,
    image_small_url: `${card.image}/low.webp`,
    resolved_card_id: card.id,
    resolved_set_id: setResolution.set.id,
    resolved_api_lang: apiLang,
    response_json: {
      match: 'set_cards_local_id',
      setInput: raw.setAbbr,
      setId: setResolution.set.id,
      setName: setResolution.set.name,
      setMatch: setResolution.match,
      cardNumInput: raw.cardNum,
      localId: card.localId,
      cardName: card.name,
      langInput: raw.lang,
      apiLang,
      rawRows: raw.rawRows,
    },
  };
}

function notFound(raw: RawKey, apiLang: string, response_json: Record<string, unknown>): CacheRow {
  return {
    provider,
    set_abbr: raw.setAbbr,
    card_num: raw.cardNum,
    lang: raw.lang,
    image_url: null,
    image_small_url: null,
    resolved_card_id: null,
    resolved_set_id: typeof response_json.setId === 'string' ? response_json.setId : null,
    resolved_api_lang: apiLang,
    response_json: { ...response_json, rawRows: raw.rawRows, notFound: true },
  };
}

function sqlString(value: string | null) {
  if (value === null) return 'null';
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonb(value: Record<string, unknown>) {
  return `${sqlString(JSON.stringify(value))}::jsonb`;
}

function normalizedLangSql(column: string) {
  return `case lower(trim(${column})) when 'eng' then 'en' when 'en' then 'en' when 'english' then 'en' when 'jpn' then 'ja' when 'jp' then 'ja' when 'ja' then 'ja' when 'japanese' then 'ja' else lower(trim(${column})) end`;
}

function buildApplySql(rows: CacheRow[]) {
  const values = rows.map((row) => `(${[
    sqlString(row.provider),
    sqlString(row.set_abbr),
    sqlString(row.card_num),
    sqlString(row.lang),
    sqlString(row.image_url),
    sqlString(row.image_small_url),
    sqlString(row.resolved_card_id),
    sqlString(row.resolved_set_id),
    sqlString(row.resolved_api_lang),
    jsonb(row.response_json),
  ].join(', ')})`).join(',\n');

  return `
begin;
create temp table _tcgdex_image_backfill (
  provider text not null,
  set_abbr text not null,
  card_num text not null,
  lang text not null,
  image_url text,
  image_small_url text,
  resolved_card_id text,
  resolved_set_id text,
  resolved_api_lang text,
  response_json jsonb not null
) on commit drop;

insert into _tcgdex_image_backfill (
  provider, set_abbr, card_num, lang, image_url, image_small_url,
  resolved_card_id, resolved_set_id, resolved_api_lang, response_json
) values
${values};

with deduped_backfill as (
  select distinct on (
    provider,
    lower(trim(set_abbr)),
    lower(trim(card_num)),
    ${normalizedLangSql('lang')}
  ) *
  from _tcgdex_image_backfill
  order by provider,
           lower(trim(set_abbr)),
           lower(trim(card_num)),
           ${normalizedLangSql('lang')},
           (image_url is not null or image_small_url is not null) desc
), updated as (
  update tcgdex_image_cache c
  set image_url = b.image_url,
      image_small_url = b.image_small_url,
      resolved_card_id = b.resolved_card_id,
      resolved_set_id = b.resolved_set_id,
      resolved_api_lang = b.resolved_api_lang,
      response_json = b.response_json,
      fetched_at = now(),
      expires_at = now() + interval '30 days',
      last_accessed_at = now(),
      updated_at = now()
  from deduped_backfill b
  where c.provider = b.provider
    and lower(trim(c.set_abbr)) = lower(trim(b.set_abbr))
    and lower(trim(c.card_num)) = lower(trim(b.card_num))
    and ${normalizedLangSql('c.lang')} = ${normalizedLangSql('b.lang')}
  returning c.id
), inserted as (
  insert into tcgdex_image_cache (
    provider, set_abbr, card_num, lang, image_url, image_small_url,
    resolved_card_id, resolved_set_id, resolved_api_lang, response_json,
    fetched_at, expires_at, last_accessed_at
  )
  select b.provider, b.set_abbr, b.card_num, b.lang, b.image_url, b.image_small_url,
         b.resolved_card_id, b.resolved_set_id, b.resolved_api_lang, b.response_json,
         now(), now() + interval '30 days', now()
  from deduped_backfill b
  where not exists (
    select 1 from tcgdex_image_cache c
    where c.provider = b.provider
      and lower(trim(c.set_abbr)) = lower(trim(b.set_abbr))
      and lower(trim(c.card_num)) = lower(trim(b.card_num))
      and ${normalizedLangSql('c.lang')} = ${normalizedLangSql('b.lang')}
  )
  returning id
)
select (select count(*) from updated) as updated_rows,
       (select count(*) from inserted) as inserted_rows,
       (select count(*) from _tcgdex_image_backfill where image_url is not null or image_small_url is not null) as rows_with_images,
       (select count(*) from _tcgdex_image_backfill where image_url is null and image_small_url is null) as rows_not_found;
commit;
`;
}

async function main() {
  const rawKeys = useMasterCards ? queryMasterCardKeys() : queryRawKeys();
  const sourceLabel = useMasterCards ? 'master_cards' : 'raw-card keys';
  console.log(`Found ${rawKeys.length} distinct ${sourceLabel} to backfill${includeAll ? ' (--all)' : ' (missing images only)'}${onlySet ? ` for set ${onlySet}` : ''}.`);
  const rows: CacheRow[] = [];
  let processed = 0;
  for (const raw of rawKeys) {
    rows.push(await resolveCard(raw));
    processed += 1;
    if (processed % 50 === 0) {
      const found = rows.filter((row) => row.image_url || row.image_small_url).length;
      console.log(`Resolved ${processed}/${rawKeys.length}; found images for ${found}.`);
    }
  }

  const found = rows.filter((row) => row.image_url || row.image_small_url).length;
  console.log(`Resolved ${rows.length} keys; found images for ${found}; not found ${rows.length - found}.`);
  if (rows.length === 0) return;

  const sql = buildApplySql(rows);
  if (dryRun) {
    execFileSync('mkdir', ['-p', '/tmp/stackt-tcgdex']);
    const path = '/tmp/stackt-tcgdex/backfill_tcgdex_image_cache.sql';
    await import('node:fs/promises').then((fs) => fs.writeFile(path, sql));
    console.log(`Dry run: wrote ${path}`);
    return;
  }

  const result = psql([], sql);
  console.log(result.trim());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
