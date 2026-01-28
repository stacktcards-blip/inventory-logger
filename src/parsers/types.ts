export type ParsedLineItem = {
  lineNo: number;
  store: string;
  purchaseDate?: string | null;
  cardName?: string | null;
  setAbbr?: string | null;
  cardNum?: string | null;
  lang?: string | null;
  quantity: number;
  priceJpy?: number | null;
  exchangeRateFormula?: string | null;
  notes?: string | null;
  confidence: number;
  flags: string[];
};

export type ParsedEmail = {
  store: string;
  purchaseDate?: string | null;
  orderNo?: string | null;
  items: ParsedLineItem[];
  confidence: number;
  flags: string[];
};
