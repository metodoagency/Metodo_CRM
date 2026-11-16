import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';
import { isoDate, istanbulToday } from './domain.js';

export const marketCurrencies = ['TRY', 'EUR', 'USD', 'GBP'] as const;
export const marketAmount = z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/);
export const marketEntry = z.object({
  amount: marketAmount, currency: z.enum(marketCurrencies), date: isoDate,
  sourceUrl: manualSourceUrl, method: z.string().trim().min(1).max(1000),
}).strict();
export const marketWrite = marketEntry.extend({
  version: z.number().int().positive(), profileUrl: manualSourceUrl.nullable().optional(),
}).refine(value => value.date <= istanbulToday(), { path: ['date'], message: 'FUTURE_DATE' });
export const marketPage = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type MarketEntry = z.infer<typeof marketEntry>;
export type MarketCurrency = typeof marketCurrencies[number];
export type MarketView = {
  version: number; profileUrl: string | null;
  current: { amount: string; currency: MarketCurrency | null; date: string | null; sourceUrl: string | null } | null;
  items: (MarketEntry & { id: string })[]; more: boolean;
};

export function formatMarketAmount(amount: string, currency: MarketCurrency, language: string) {
  if (!marketAmount.safeParse(amount).success) return `${amount} ${currency}`;
  const [whole, fraction = ''] = amount.split('.');
  return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(BigInt(whole)).map(part => part.type === 'fraction' ? fraction.padEnd(2, '0') : part.value).join('');
}
