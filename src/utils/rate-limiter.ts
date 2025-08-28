// Simple in-memory rate limiter for API endpoints
// In production, consider using Redis or a more robust solution

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; resetTime?: number; remaining?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    // 1% chance to clean up
    cleanupExpiredEntries(now);
  }

  if (!entry || now > entry.resetTime) {
    // First request or window expired, create new entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      resetTime: newEntry.resetTime,
      remaining: config.maxRequests - 1,
    };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      resetTime: entry.resetTime,
      remaining: 0,
    };
  }

  // Increment counter
  entry.count++;
  rateLimitStore.set(identifier, entry);

  return {
    allowed: true,
    resetTime: entry.resetTime,
    remaining: config.maxRequests - entry.count,
  };
}

function cleanupExpiredEntries(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Get client IP address from request
export function getClientIP(request: Request): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');

  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback - this won't work in production behind a proxy
  return 'unknown';
}

// Rate limit configurations for different endpoints
export const RATE_LIMITS = {
  waitlist: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 3, // 3 registrations per 15 minutes per IP
  },
  confirm: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10, // 10 confirmation attempts per 5 minutes per IP
  },
  unsubscribe: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5, // 5 unsubscribe attempts per 5 minutes per IP
  },
} as const;
