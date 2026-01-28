import { STORE_CONFIGS } from '../config/japanStores.js';

export const detectStore = (from: string | null, subject: string | null): string => {
  const sender = (from ?? '').toLowerCase();
  const subj = (subject ?? '').toLowerCase();

  for (const store of STORE_CONFIGS) {
    const domainMatch = store.senderDomains.some((domain) => sender.includes(domain.toLowerCase()));
    const subjectMatch = store.subjectIncludes.some((pattern) => subj.includes(pattern.toLowerCase()));
    if (domainMatch || subjectMatch) {
      return store.name;
    }
  }

  return 'Unknown';
};
