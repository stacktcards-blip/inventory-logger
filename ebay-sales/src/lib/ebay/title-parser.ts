/**
 * Parse carduploader-format eBay listing titles.
 * Format: Grading company > Grade > Card Name > Card Number > Set Number > Set Name > Set abbreviation > Rarity > Language (if not English) > Card Game
 */

export type ParsedTitle = {
  card_name: string | null;
  set_abbr: string | null;
  num: string | null;
  set_num: string | null;
  set_name: string | null;
  lang: string;
  grade: string | null;
  grading_company: string | null;
  rarity: string | null;
  card_game: string | null;
  parse_confidence: number;
  parse_flags: string[];
};

const KNOWN_GRADING = ['PSA', 'CGC', 'BGS', 'SGC', 'ACE'];
const KNOWN_LANGS = ['ENG', 'EN', 'JPN', 'JAP', 'KOR', 'CHT', 'CHS'];
const KNOWN_GAMES = ['Pokemon', 'Pokémon', 'Magic', 'Sports', 'Yu-Gi-Oh', 'One Piece'];

function normalizeLang(raw: string | undefined): string {
  if (!raw || !raw.trim()) return 'ENG';
  const u = raw.trim().toUpperCase();
  if (u === 'EN' || u === 'ENG' || u === 'ENGLISH') return 'ENG';
  if (u === 'JPN' || u === 'JAP' || u === 'JAPANESE') return 'JPN';
  if (u === 'KOR' || u === 'KOREAN') return 'KOR';
  if (u === 'CHT' || u === 'CHINESE') return 'CHT';
  if (u === 'CHS') return 'CHS';
  return raw.trim();
}

/**
 * Fallback parser for alternate formats like:
 * "PSA 10 Greninja EX 090/066 Sv5a Crimson Haze Special Art Rare Japanese POKEMON"
 * "[PSA 10] Latias & Latios Gx 190/181 Team Up Secret POKEMON"
 */
function parseAlternateFormat(title: string): ParsedTitle {
  const flags: string[] = ['alt_format'];
  let t = title.trim();

  const gradingMatch = t.match(/^\[?(PSA|CGC|BGS|SGC|ACE)\s*(\d+(?:\.\d+)?)\]?\s*/i);
  const grading_company = gradingMatch?.[1] ?? null;
  const grade = gradingMatch?.[2] ?? null;
  if (gradingMatch) t = t.slice(gradingMatch[0].length).trim();

  const cardNumMatch = t.match(/(\d{2,4})\/(\d{2,4})/);
  const num = cardNumMatch ? `${cardNumMatch[1]}/${cardNumMatch[2]}` : null;
  const numIdx = cardNumMatch ? t.indexOf(cardNumMatch[0]) : -1;

  let card_name: string | null = null;
  let set_abbr: string | null = null;
  let set_name: string | null = null;
  let rarity: string | null = null;
  let lang = 'ENG';
  let card_game: string | null = null;

  const gameMatch = t.match(/\b(POKEMON|POKÉMON|Magic|Sports|Yu-Gi-Oh|One Piece)\s*$/i);
  if (gameMatch) {
    card_game = gameMatch[1];
    t = t.slice(0, -gameMatch[0].length).trim();
  }

  const langMatch = t.match(/\b(Japanese|JPN|Korean|JAP)\b/i);
  if (langMatch) {
    lang = langMatch[1].toUpperCase().startsWith('J') ? 'JPN' : 'KOR';
    t = t.replace(langMatch[0], '').trim();
  }

  const rarityWords = ['Secret', 'Holo', 'Special Art Rare', 'SAR', 'Promo', 'Prerelease', 'Staff Stamp', 'Rare', 'Uncommon', 'Common'];
  for (const r of rarityWords) {
    const re = new RegExp(`\\b${r.replace(/\s+/g, '\\s+')}\\b`, 'i');
    const m = t.match(re);
    if (m) {
      rarity = m[0];
      t = t.replace(re, '').trim();
      break;
    }
  }

  if (numIdx > 0) {
    card_name = t.slice(0, numIdx).trim().replace(/\s+/g, ' ') || null;
    const afterNum = t.slice(numIdx + (num?.length ?? 0)).trim();
    const setParts = afterNum.split(/\s+/).filter(Boolean);
    if (setParts.length >= 1) {
      set_abbr = setParts[0];
      set_name = setParts.slice(1).join(' ') || setParts[0];
    }
  } else if (num) {
    const beforeNum = t.slice(0, t.indexOf(num)).trim();
    card_name = beforeNum.replace(/\s+/g, ' ') || null;
    const afterNum = t.slice(t.indexOf(num) + num.length).trim();
    const setParts = afterNum.split(/\s+/).filter(Boolean);
    if (setParts.length >= 1) {
      set_abbr = setParts[0];
      set_name = setParts.slice(1).join(' ') || setParts[0];
    }
  } else {
    card_name = t.replace(/\s+/g, ' ').trim() || null;
  }

  const confidence = (grading_company && grade ? 0.5 : 0.3) +
    (card_name ? 0.2 : 0) +
    (num ? 0.2 : 0) +
    (set_abbr || set_name ? 0.1 : 0);

  return {
    card_name,
    set_abbr: set_abbr ?? set_name,
    num,
    set_num: num?.split('/')[0] ?? null,
    set_name,
    lang,
    grade,
    grading_company,
    rarity,
    card_game,
    parse_confidence: Math.round(Math.min(1, confidence) * 100) / 100,
    parse_flags: flags,
  };
}

/**
 * Parse title using carduploader format (fields separated by " > ").
 * Falls back to alternate format when no " > " separators.
 */
export function parseCarduploaderTitle(title: string): ParsedTitle {
  const flags: string[] = [];
  const parts = title.split(/\s*>\s*/).map((p) => p.trim()).filter(Boolean);

  if (parts.length < 6) {
    const alt = parseAlternateFormat(title);
    if (alt.card_name || alt.grade) return alt;
    flags.push('too_few_parts');
    return {
      card_name: parts[2] ?? null,
      set_abbr: parts[6] ?? null,
      num: parts[3] ?? null,
      set_num: parts[4] ?? null,
      set_name: parts[5] ?? null,
      lang: 'ENG',
      grade: parts[1] ?? null,
      grading_company: parts[0] ?? null,
      rarity: parts[7] ?? null,
      card_game: parts[9] ?? null,
      parse_confidence: 0.3,
      parse_flags: flags,
    };
  }

  const grading_company = parts[0] ?? null;
  const grade = parts[1] ?? null;
  const card_name = parts[2] ?? null;
  const num = parts[3] ?? null;
  const set_num = parts[4] ?? null;
  const set_name = parts[5] ?? null;
  const set_abbr = parts[6] ?? null;
  const rarity = parts[7] ?? null;
  const langRaw = parts[8];
  const card_game = parts[9] ?? null;

  if (!KNOWN_GRADING.includes(grading_company ?? '')) {
    flags.push('unknown_grading_company');
  }
  if (!card_name) flags.push('missing_card_name');
  if (!set_abbr) flags.push('missing_set_abbr');
  if (!num) flags.push('missing_num');

  const lang = normalizeLang(langRaw);
  if (langRaw && !KNOWN_LANGS.some((l) => l.toUpperCase() === lang)) {
    flags.push('unknown_lang');
  }

  let confidence = 0.7;
  if (grading_company && grade && card_name && set_abbr && num) confidence += 0.2;
  if (flags.length === 0) confidence += 0.1;
  confidence = Math.min(1, Math.max(0, confidence - flags.length * 0.05));

  return {
    card_name,
    set_abbr,
    num,
    set_num,
    set_name,
    lang,
    grade,
    grading_company,
    rarity,
    card_game,
    parse_confidence: Math.round(confidence * 100) / 100,
    parse_flags: flags,
  };
}
