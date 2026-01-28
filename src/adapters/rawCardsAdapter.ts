export type RawCardInsert = {
  is_1ed?: boolean | null;
  is_rev?: boolean | null;
  purchase_price?: number | null;
  exchange_rate?: number | null;
  purchase_date?: string | null;
  cond?: string | null;
  set_abbr?: string | null;
  num?: string | null;
  lang?: string | null;
  seller?: string | null;
  note?: string | null;
};

export type DraftRow = {
  id: string;
  purchase_source_id: string;
  store: string;
  purchase_date: string | null;
  card_name: string | null;
  set_abbr: string | null;
  card_num: string | null;
  lang: string | null;
  quantity: number;
  price_jpy: number | null;
  notes: string | null;
};

export type RawCardMappingConfig = {
  defaults: RawCardInsert;
  fieldMap: {
    purchase_price: keyof RawCardInsert;
    purchase_date: keyof RawCardInsert;
    set_abbr: keyof RawCardInsert;
    num: keyof RawCardInsert;
    lang: keyof RawCardInsert;
    seller: keyof RawCardInsert;
    note: keyof RawCardInsert;
  };
};

export const DEFAULT_RAW_CARD_MAPPING: RawCardMappingConfig = {
  defaults: {
    is_1ed: null,
    is_rev: null,
    exchange_rate: null,
    cond: null
  },
  fieldMap: {
    purchase_price: 'purchase_price',
    purchase_date: 'purchase_date',
    set_abbr: 'set_abbr',
    num: 'num',
    lang: 'lang',
    seller: 'seller',
    note: 'note'
  }
};

export const mapDraftToRawCardInsert = (
  draft: DraftRow,
  note: string,
  mapping: RawCardMappingConfig = DEFAULT_RAW_CARD_MAPPING
): RawCardInsert => {
  return {
    ...mapping.defaults,
    [mapping.fieldMap.purchase_price]: draft.price_jpy,
    [mapping.fieldMap.purchase_date]: draft.purchase_date,
    [mapping.fieldMap.set_abbr]: draft.set_abbr,
    [mapping.fieldMap.num]: draft.card_num,
    [mapping.fieldMap.lang]: draft.lang,
    [mapping.fieldMap.seller]: draft.store,
    [mapping.fieldMap.note]: note
  };
};
