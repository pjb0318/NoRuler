import { createRateLimiter, handleImageDimensionsRequest } from '../../server/analyzeCore.ts';
import type { RateLimitKV, RateLimiter } from '../../server/analyzeCore.ts';

interface Env {
  GEMINI_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOWED_ORIGINS?: string;
  RATE_LIMIT_PER_MIN?: string;
  RATE_LIMIT_PER_DAY?: string;
  RATE_LIMIT_GLOBAL_PER_DAY?: string;
  MAX_CONCURRENT_REQUESTS?: string;
  RATE_LIMIT_KV?: RateLimitKV;
}

interface PagesContext<TEnv = unknown> {
  request: Request;
  env: TEnv;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

let cachedLimiterKey = '';
let cachedLimiter: RateLimiter | undefined;

function getLimiter(env: Env): RateLimiter {
  const perMinute = parsePositiveInt(env.RATE_LIMIT_PER_MIN, 4);
  const perDay = parsePositiveInt(env.RATE_LIMIT_PER_DAY, 20);
  const globalPerDay = parsePositiveInt(env.RATE_LIMIT_GLOBAL_PER_DAY, 150);
  const maxConcurrent = parsePositiveInt(env.MAX_CONCURRENT_REQUESTS, 3);
  const configKey = `${perMinute}:${perDay}:${globalPerDay}:${maxConcurrent}`;
  if (!cachedLimiter || cachedLimiterKey !== configKey) {
    cachedLimiter = createRateLimiter({ perMinute, perDay, globalPerDay, maxConcurrent });
    cachedLimiterKey = configKey;
  }
  return cachedLimiter;
}

export async function onRequest(context: PagesContext<Env>): Promise<Response> {
  const { request, env } = context;
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return handleImageDimensionsRequest(request, {
    apiKey: env.GEMINI_API_KEY,
    mode: 'public',
    clientIp: request.headers.get('CF-Connecting-IP') ?? '',
    allowedOrigins,
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
    requireTurnstile: true,
    limiter: getLimiter(env),
    rateLimitKv: env.RATE_LIMIT_KV,
  });
}
