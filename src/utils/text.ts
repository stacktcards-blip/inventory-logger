import crypto from 'crypto';

export const stripHtml = (html: string): string => {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeContent = (subject: string | null, from: string | null, body: string | null): string => {
  return [subject ?? '', from ?? '', body ?? '']
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

export const sha256 = (content: string): string => {
  return crypto.createHash('sha256').update(content).digest('hex');
};

export const extractPrices = (text: string): number[] => {
  const matches = text.match(/[¥￥]\s?([0-9,]+)/g) ?? [];
  return matches
    .map((match) => match.replace(/[¥￥\s]/g, '').replace(/,/g, ''))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
};

export const extractCardNumbers = (text: string): string[] => {
  const matches = text.match(/\b([A-Za-z]{0,3}\d{1,4})\b/g) ?? [];
  return matches.map((match) => match.replace(/\s+/g, ''));
};

export const cleanCardName = (name: string): string => {
  return name
    .replace(/(Scarlet & Violet|Sword & Shield|Sun & Moon)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};
