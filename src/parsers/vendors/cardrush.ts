import { cleanCardName } from '../../utils/text.js';
import { ParsedEmail, ParsedLineItem } from '../types.js';

type CardRushParseResult = {
  orderNo: string | null;
  purchaseDate: string | null;
  items: ParsedLineItem[];
};

export const parseCardRushEmail = (bodyText: string): ParsedEmail => {
  const parsed = parseCardRushBody(bodyText);
  const flags = parsed.items.flatMap((item) => item.flags);
  const confidence = parsed.items.length
    ? parsed.items.reduce((sum, item) => sum + item.confidence, 0) / parsed.items.length
    : 0;

  return {
    store: 'CardRush',
    orderNo: parsed.orderNo,
    purchaseDate: parsed.purchaseDate,
    items: parsed.items,
    confidence,
    flags
  };
};

const parseCardRushBody = (bodyText: string): CardRushParseResult => {
  const orderNoMatch = bodyText.match(/受注番号：\s*(\d+)/);
  const orderNo = orderNoMatch ? orderNoMatch[1] : null;

  const purchaseDateMatch = bodyText.match(/受注日時：\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const purchaseDate = purchaseDateMatch
    ? `${purchaseDateMatch[1]}-${purchaseDateMatch[2].padStart(2, '0')}-${purchaseDateMatch[3].padStart(2, '0')}`
    : null;

  const items: ParsedLineItem[] = [];
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('[商品名]：')) continue;
    const parsedItem = parseLineItem(line, purchaseDate, items.length + 1);
    items.push(parsedItem);
  }

  return { orderNo, purchaseDate, items };
};

const parseLineItem = (line: string, purchaseDate: string | null, lineNo: number): ParsedLineItem => {
  const flags: string[] = [];
  const namePart = line.replace('[商品名]：', '').split('{')[0]?.trim() ?? '';
  const cleanedName = cleanCardName(namePart.replace(/【[^】]+】/g, '').trim());

  const numMatches = [...line.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const num = numMatches.length ? numMatches[0].split('/')[0] : null;
  if (numMatches.length > 1) flags.push('ambiguous_num');
  if (!num) flags.push('missing_num');

  const setMatch = line.match(/\[([^\]]+)\]/g);
  const setRaw = setMatch?.[setMatch.length - 1] ?? null;
  const setAbbr = setRaw ? setRaw.replace(/[\[\]]/g, '').toUpperCase() : null;
  if (!setAbbr) flags.push('missing_set_abbr');

  const unitPriceMatch = line.match(/([\d,]+)\s*円\s*x\s*(\d+)\s*個/);
  const price = unitPriceMatch ? Number.parseInt(unitPriceMatch[1].replace(/,/g, ''), 10) : null;
  if (!price) flags.push('missing_price');

  const quantity = unitPriceMatch ? Number.parseInt(unitPriceMatch[2], 10) : 1;
  if (!unitPriceMatch) flags.push('missing_qty');

  const lineTotalMatch = line.match(/円\s*x\s*\d+\s*個\s*([\d,]+)\s*円/);
  if (lineTotalMatch && price && quantity) {
    const lineTotal = Number.parseInt(lineTotalMatch[1].replace(/,/g, ''), 10);
    if (price * quantity !== lineTotal) {
      flags.push('price_mismatch');
    }
  }

  const confidence = computeConfidence({ cleanedName, num, setAbbr, price, quantity, flags });

  return {
    lineNo,
    store: 'CardRush',
    purchaseDate,
    cardName: cleanedName || null,
    setAbbr,
    cardNum: num,
    lang: 'JPN',
    quantity,
    priceJpy: price,
    exchangeRateFormula: null,
    notes: null,
    confidence,
    flags
  };
};

const computeConfidence = (data: {
  cleanedName: string;
  num: string | null;
  setAbbr: string | null;
  price: number | null;
  quantity: number;
  flags: string[];
}) => {
  let score = 0.4;
  if (data.cleanedName) score += 0.2;
  if (data.num) score += 0.15;
  if (data.setAbbr) score += 0.15;
  if (data.price) score += 0.1;
  if (data.quantity) score += 0.05;
  if (data.flags.length) score -= 0.1;
  return Math.max(0, Math.min(1, score));
};
