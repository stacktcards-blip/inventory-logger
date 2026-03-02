/**
 * Map PSA GetByCertNumber API response to slab intake draft fields.
 * PSA response schema is not fully documented; we use defensive extraction
 * and store result_json on the draft for debugging and future field extraction.
 */

import type { PsaCertResponse } from '../services/psaCertClient.js';

const LANG_NORMALIZE: Record<string, string> = {
  EN: 'ENG',
};

function getStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function normalizeLang(lang: string | null | undefined): string {
  if (!lang) return '';
  const trimmed = lang.trim();
  return LANG_NORMALIZE[trimmed] ?? trimmed;
}

export type SlabDraftFromPsa = {
  cert: string;
  grade: string | null;
  set_abbr: string | null;
  num: string | null;
  lang: string | null;
  grading_company: string;
  card_name: string | null;
  is_1ed: boolean | null;
  is_rev: boolean | null;
  note: string | null;
  order_number: string | null;
  acquired_date: string | null;
  image_url: string | null;
};

/**
 * Extract slab draft fields from PSA cert API response.
 * Cert number should be passed in from the request (API may return it under different keys).
 */
export function psaCertToSlabDraft(
  raw: PsaCertResponse,
  certNumber: string
): SlabDraftFromPsa {
  const o = raw as Record<string, unknown>;

  const grade =
    getStr(o, 'Grade', 'grade') ??
    getStr(o, 'CertGrade', 'certGrade') ??
    null;
  const setAbbr =
    getStr(o, 'Set', 'set', 'SetName', 'setName', 'SetAbbr', 'set_abbr') ??
    null;
  const num =
    getStr(o, 'CardNumber', 'cardNumber', 'Number', 'number', 'Num', 'num') ??
    null;
  const langRaw =
    getStr(o, 'Language', 'language', 'Lang', 'lang') ?? null;
  const lang = langRaw ? normalizeLang(langRaw) : null;
  const cardName =
    getStr(o, 'CardName', 'cardName', 'Title', 'title', 'ItemDescription', 'itemDescription') ??
    null;
  const orderNumber =
    getStr(o, 'OrderNumber', 'orderNumber', 'SubmissionNumber', 'submissionNumber') ??
    null;

  // Image URL – if PSA provides it (keys may vary)
  let imageUrl: string | null = null;
  const imageKeys = [
    'ImageUrl', 'imageUrl', 'ImageURL', 'Image', 'image',
    'FrontImage', 'frontImage', 'CertImage', 'certImage', 'SlabImage'
  ];
  for (const k of imageKeys) {
    const v = o[k];
    if (typeof v === 'string' && (v as string).indexOf('http') === 0) {
      imageUrl = v;
      break;
    }
  }

  return {
    cert: String(certNumber).trim(),
    grade,
    set_abbr: setAbbr,
    num,
    lang,
    grading_company: 'PSA',
    card_name: cardName,
    is_1ed: null,
    is_rev: null,
    note: null,
    order_number: orderNumber,
    acquired_date: null,
    image_url: imageUrl,
  };
}
