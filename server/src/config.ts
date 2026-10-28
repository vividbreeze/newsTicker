export type Config = {
  port: number;
  apiToken: string;
  anthropicApiKey: string;
  anthropicModel: string;
  cacheTtlMinutes: number;
  rateLimitPerMinute: number;
  llmMaxCallsPerDay: number;
  maxAgeHours: number;
  feedTimeoutMs: number;
  dbPath: string;
  webDir: string;
  corsOrigin: string | false;
  userAgent: string;
  prefetchDetails: boolean;
  prefetchBudgetMs: number;
};

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 3000),
    apiToken: env.API_TOKEN ?? '',
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    cacheTtlMinutes: num(env.CACHE_TTL_MINUTES, 20),
    rateLimitPerMinute: num(env.RATE_LIMIT_PER_MINUTE, 30),
    llmMaxCallsPerDay: num(env.LLM_MAX_CALLS_PER_DAY, 300),
    maxAgeHours: num(env.MAX_AGE_HOURS, 48),
    feedTimeoutMs: num(env.FEED_TIMEOUT_MS, 8000),
    dbPath: env.DB_PATH || './data/ticker.sqlite',
    webDir: env.WEB_DIR || '../web/dist',
    corsOrigin: env.DOMAIN ? `https://${env.DOMAIN}` : false,
    prefetchDetails: env.PREFETCH_DETAILS !== '0',
    prefetchBudgetMs: num(env.PREFETCH_BUDGET_MS, 12000),
    userAgent: 'Mozilla/5.0 (compatible; PrivateNewsTicker/1.0; +personal use)',
  };
}
