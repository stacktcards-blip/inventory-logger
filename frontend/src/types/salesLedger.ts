export type SalesLedgerQueryParams = {
  startDate?: string;
  endDate?: string;
  matchStatus?: string;
  fulfillmentStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type SalesLedgerRow = {
  saleId: string;
  salesChannel: string;
  soldDate: string | null;
  title: string | null;
  buyerUsername: string | null;
  quantity: number;
  salePrice: number | null;
  currency: string | null;
  shippingCost: number | null;
  fulfillmentStatus: string | null;
  matchStatus: string;
  matchMethod: string | null;
  slabId: string | null;
  slabCert: string | null;
  slabGrade: string | null;
  slabGradingCompany: string | null;
  slabSetAbbr: string | null;
  slabNum: string | null;
  slabLang: string | null;
  rawCardId: number | null;
  rawCostAud: number | null;
  grossProfitAud: number | null;
  daysHeld: number | null;
  imageUrl: string | null;
  packingRowId: string | null;
  packingImportId: string | null;
  packingCert: string | null;
  packingScanStatus: string | null;
  packingMatchMethod: string | null;
  packingReviewReason: string | null;
  packingImportedAt: string | null;
  inventoryMatchStatus: string;
  inventoryMatchLabel: string;
  reviewReason: string | null;
};

export type SalesLedgerResponse = {
  rows: SalesLedgerRow[];
  total: number;
  limit: number;
  offset: number;
  totals: {
    gross: number;
    cost: number;
    profit: number;
  };
};
