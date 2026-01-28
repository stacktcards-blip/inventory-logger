import { cleanCardName, extractCardNumbers, extractPrices } from '../../utils/text.js';
import { ParsedEmail, ParsedLineItem } from '../types.js';

export const parseMagiEmail = (bodyText: string, purchaseDate?: string | null): ParsedEmail => {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: ParsedLineItem[] = [];

  for (const line of lines) {
    const prices = extractPrices(line);
    if (!prices.length) {
      continue;
    }
    const cardNums = extractCardNumbers(line);
    const namePart = line.replace(/[¥￥].*$/, '').trim();
    const cardName = cleanCardName(namePart);
    const flags: string[] = [];
    if (!cardNums.length) flags.push('missing_card_num');
    if (!prices.length) flags.push('missing_price');
    if (cardNums.length > 1) flags.push('ambiguous_card_num');

    const confidence = computeConfidence({ cardName, cardNums, prices, flags });

    items.push({
      lineNo: items.length + 1,
      store: 'Magi',
      purchaseDate,
      cardName: cardName || null,
      setAbbr: null,
      cardNum: cardNums[0] ?? null,
      lang: 'JPN',
      quantity: 1,
      priceJpy: prices[0] ?? null,
      exchangeRateFormula: null,
      notes: null,
      confidence,
      flags
    });
  }

  return summarize(items, 'Magi');
};

const computeConfidence = (data: { cardName: string; cardNums: string[]; prices: number[]; flags: string[] }) => {
  let score = 0.4;
  if (data.cardName) score += 0.2;
  if (data.cardNums.length) score += 0.2;
  if (data.prices.length) score += 0.2;
  if (data.flags.length) score -= 0.2;
  return Math.max(0, Math.min(1, score));
};

const summarize = (items: ParsedLineItem[], store: string): ParsedEmail => {
  const flags = items.flatMap((item) => item.flags);
  const confidence = items.length
    ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
    : 0;
  return {
    store,
    items,
    confidence,
    flags
  };
};
