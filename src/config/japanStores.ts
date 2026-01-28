export type StoreConfig = {
  name: 'CardRush' | 'Hareruya' | 'Magi' | 'Unknown';
  senderDomains: string[];
  subjectIncludes: string[];
};

export const STORE_CONFIGS: StoreConfig[] = [
  {
    name: 'CardRush',
    senderDomains: ['cardrush.jp', 'cardrush-pokemon.jp'],
    subjectIncludes: ['注文', 'ご注文', 'CardRush']
  },
  {
    name: 'Hareruya',
    senderDomains: ['hareruya2.com', 'hareruya-shop.com'],
    subjectIncludes: ['ご注文', '晴れる屋', 'Hareruya']
  },
  {
    name: 'Magi',
    senderDomains: ['magi.camp', 'magi.tokyo'],
    subjectIncludes: ['購入', 'マギ', 'Magi']
  }
];

export const PARSER_VERSION = 'japan-email-v1';

export const GMAIL_QUERY =
  '(from:cardrush.jp OR from:hareruya2.com OR from:hareruya-shop.com OR from:magi.camp OR from:magi.tokyo) (subject:ご注文 OR subject:注文 OR subject:購入 OR subject:Hareruya OR subject:CardRush OR subject:Magi)';
