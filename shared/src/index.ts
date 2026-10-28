import { z } from 'zod';

export const COUNTRY_CODES = ['jp', 'de', 'us', 'gb'] as const;
export const CountrySchema = z.enum(COUNTRY_CODES);
export type CountryCode = z.infer<typeof CountrySchema>;

export const COUNTRIES: Record<CountryCode, { name: string; lang: string; flag: string; short: string }> = {
  jp: { name: 'Japan', lang: 'ja', flag: '🇯🇵', short: 'JP' },
  de: { name: 'Deutschland', lang: 'de', flag: '🇩🇪', short: 'DE' },
  us: { name: 'USA', lang: 'en', flag: '🇺🇸', short: 'US' },
  gb: { name: 'England/UK', lang: 'en', flag: '🇬🇧', short: 'UK' },
};

export const CATEGORIES = [
  { key: 'top', label: 'Top-Meldungen', icon: 'Star' },
  { key: 'politics', label: 'Politik', icon: 'Landmark' },
  { key: 'business', label: 'Wirtschaft', icon: 'TrendingUp' },
  { key: 'tech', label: 'Technik', icon: 'Cpu' },
  { key: 'science', label: 'Wissenschaft', icon: 'Atom' },
  { key: 'health', label: 'Gesundheit', icon: 'HeartPulse' },
  { key: 'culture', label: 'Kultur', icon: 'Drama' },
  { key: 'sports', label: 'Sport', icon: 'Trophy' },
] as const;
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as unknown as readonly [string, ...string[]];
export const CategorySchema = z.enum(['top', 'politics', 'business', 'tech', 'science', 'health', 'culture', 'sports']);
export type CategoryKey = z.infer<typeof CategorySchema>;

export const SummaryLengthSchema = z.enum(['short', 'medium', 'long']);
export type SummaryLength = z.infer<typeof SummaryLengthSchema>;

export const TickerItemSchema = z.object({
  id: z.string(),
  publishedAt: z.string(),
  rank: z.number().int(),
  isTop: z.boolean(),
  title: z.string(),
  teaser: z.string(),
  originalTitle: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  url: z.string(),
});
export type TickerItem = z.infer<typeof TickerItemSchema>;

export const TickerResponseSchema = z.object({
  country: CountrySchema,
  category: z.string(),
  fetchedAt: z.string(),
  stale: z.boolean(),
  items: z.array(TickerItemSchema),
  sourceErrors: z.array(z.object({ sourceId: z.string(), message: z.string() })),
  /** Hinweis, z. B. wenn die Übersetzung nicht möglich war. */
  notice: z.string().optional(),
});
export type TickerResponse = z.infer<typeof TickerResponseSchema>;

export const TickerDetailSchema = z.object({
  id: z.string(),
  summary: z.string(),
  limited: z.boolean(),
  url: z.string(),
  sourceName: z.string(),
});
export type TickerDetail = z.infer<typeof TickerDetailSchema>;

export const SourceSettingSchema = z.object({ id: z.string(), enabled: z.boolean() });
export const SettingsSchema = z.object({
  activeCountries: z.array(CountrySchema).length(3).refine((a) => new Set(a).size === 3, 'Länder müssen verschieden sein'),
  itemCount: z.number().int().min(5).max(30),
  summaryLength: SummaryLengthSchema,
  defaultCategory: CategorySchema,
  /** Pro Land: Quellen in Reißverschluss-Reihenfolge inkl. Schalter. */
  sources: z.record(CountrySchema, z.array(SourceSettingSchema)),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SourceInfoSchema = z.object({
  id: z.string(),
  country: CountrySchema,
  name: z.string(),
  type: z.enum(['google_news', 'rss']),
  enabled: z.boolean(),
  categories: z.array(z.string()),
  status: z.enum(['ok', 'warn', 'error', 'unknown']),
  checkedAt: z.string().nullable(),
  message: z.string().nullable(),
});
export type SourceInfo = z.infer<typeof SourceInfoSchema>;

export const MetaSchema = z.object({
  countries: z.array(z.object({ code: CountrySchema, name: z.string(), lang: z.string(), flag: z.string(), short: z.string() })),
  categories: z.array(z.object({ key: z.string(), label: z.string(), icon: z.string() })),
});
export type Meta = z.infer<typeof MetaSchema>;

export const SeedSourceSchema = z.object({
  id: z.string(),
  country: CountrySchema,
  name: z.string(),
  type: z.enum(['google_news', 'rss']),
  feeds: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  defaultEnabled: z.boolean(),
});
export type SeedSource = z.infer<typeof SeedSourceSchema>;
