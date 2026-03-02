import type { gmail_v1 } from 'googleapis';
import { stripHtml } from '../utils/text.js';

export type GmailMessagePayload = {
  subject: string | null;
  from: string | null;
  date: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
};

export const parseGmailMessage = (message: gmail_v1.Schema$Message): GmailMessagePayload => {
  const headers = message.payload?.headers ?? [];
  type Header = { name?: string | null; value?: string | null };
  const subject = (headers as Header[]).find((header: Header) => header.name?.toLowerCase() === 'subject')?.value ?? null;
  const from = (headers as Header[]).find((header: Header) => header.name?.toLowerCase() === 'from')?.value ?? null;
  const date = (headers as Header[]).find((header: Header) => header.name?.toLowerCase() === 'date')?.value ?? null;
  const snippet = message.snippet ?? null;

  const { text, html } = extractBodies(message.payload);

  return {
    subject,
    from,
    date,
    snippet,
    bodyText: text,
    bodyHtml: html
  };
};

export const decodeGmailBody = (data?: string | null) => {
  if (!data) return null;
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const buffer = Buffer.from(padded, 'base64');
  return buffer.toString('utf8');
};

const extractBodies = (payload?: gmail_v1.Schema$MessagePart) => {
  if (!payload) return { text: null, html: null };

  const parts: gmail_v1.Schema$MessagePart[] = [];
  const walk = (part?: gmail_v1.Schema$MessagePart) => {
    if (!part) return;
    parts.push(part);
    if (part.parts) {
      part.parts.forEach(walk);
    }
  };
  walk(payload);

  const textPart = parts.find((part) => part.mimeType === 'text/plain');
  const htmlPart = parts.find((part) => part.mimeType === 'text/html');

  const text =
    decodeGmailBody(textPart?.body?.data) ??
    (htmlPart ? stripHtml(decodeGmailBody(htmlPart.body?.data) ?? '') : null);
  const html = decodeGmailBody(htmlPart?.body?.data);

  return { text, html };
};
