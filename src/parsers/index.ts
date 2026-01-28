import { PARSER_VERSION } from '../config/japanStores.js';
import { detectStore } from './detectStore.js';
import { parseCardRushEmail } from './vendors/cardrush.js';
import { parseHareruyaEmail } from './vendors/hareruya.js';
import { parseMagiEmail } from './vendors/magi.js';
import { ParsedEmail, ParsedLineItem } from './types.js';

export type RawEmail = {
  subject: string | null;
  from: string | null;
  bodyText: string;
};

export const parseJapanEmail = (raw: RawEmail): ParsedEmail => {
  const store = detectStore(raw.from, raw.subject);
  const purchaseDate = extractPurchaseDate(raw.bodyText);

  let parsed: ParsedEmail;
  switch (store) {
    case 'CardRush':
      parsed = parseCardRushEmail(raw.bodyText);
      break;
    case 'Hareruya':
      parsed = parseHareruyaEmail(raw.bodyText, purchaseDate);
      break;
    case 'Magi':
      parsed = parseMagiEmail(raw.bodyText, purchaseDate);
      break;
    default:
      parsed = parseUnknown(raw.bodyText, purchaseDate);
      break;
  }

  parsed.items = parsed.items.map((item) => enrichLineItem(item));

  return {
    ...parsed,
    store,
    confidence: parsed.items.length
      ? parsed.items.reduce((sum, item) => sum + item.confidence, 0) / parsed.items.length
      : 0,
    flags: parsed.items.flatMap((item) => item.flags)
  };
};

export const parserVersion = PARSER_VERSION;

const parseUnknown = (bodyText: string, purchaseDate?: string | null): ParsedEmail => {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: ParsedLineItem[] = [];

  for (const line of lines) {
    if (!line.match(/[¥￥]/)) continue;
    items.push({
      lineNo: items.length + 1,
      store: 'Unknown',
      purchaseDate,
      cardName: line,
      setAbbr: null,
      cardNum: null,
      lang: 'JPN',
      quantity: 1,
      priceJpy: null,
      exchangeRateFormula: null,
      notes: 'Unknown vendor parsing',
      confidence: 0.2,
      flags: ['unknown_vendor']
    });
  }

  return {
    store: 'Unknown',
    purchaseDate,
    items,
    confidence: 0.2,
    flags: ['unknown_vendor']
  };
};

const enrichLineItem = (item: ParsedLineItem): ParsedLineItem => {
  const flags = new Set(item.flags);
  if (!item.setAbbr) flags.add('missing_set_abbr');
  if (!item.cardNum) flags.add('missing_card_num');
  if (!item.priceJpy) flags.add('missing_price');

  item.flags = [...flags];
  item.confidence = computeLineConfidence(item);
  return item;
};

const computeLineConfidence = (item: ParsedLineItem): number => {
  let score = 0.4;
  if (item.cardName) score += 0.2;
  if (item.setAbbr) score += 0.15;
  if (item.cardNum) score += 0.15;
  if (item.priceJpy) score += 0.1;
  if (item.flags.length) score -= 0.1;
  return Math.max(0, Math.min(1, score));
};

const extractPurchaseDate = (text: string): string | null => {
  const match = text.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
  if (!match) return null;
  return match[1].replace(/\//g, '-');
};
