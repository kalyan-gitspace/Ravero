import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  code: string;
  message: string;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();

  return (request, _response, next) => {
    const now = Date.now();
    const key = request.socket.remoteAddress ?? 'unknown';
    let entry = entries.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      entries.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > options.maxRequests) {
      next(new AppError(429, options.code, options.message));
      return;
    }

    if (entries.size > 10_000) {
      for (const [entryKey, value] of entries) {
        if (value.resetAt <= now) entries.delete(entryKey);
      }
    }

    next();
  };
}
