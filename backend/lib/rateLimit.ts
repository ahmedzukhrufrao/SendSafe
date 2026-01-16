// ============================================================================
// Rate Limiting Module
// ============================================================================
// This file prevents abuse by limiting how many requests each IP address
// can make within a time window.
//
// WHY DO WE NEED RATE LIMITING?
// - Prevents malicious users from spamming requests
// - Controls costs (each OpenAI call costs money)
// - Protects server resources
// - Fair usage for all users
//
// HOW IT WORKS:
// We track requests by IP address in memory.
// Each IP gets a "bucket" that can hold N requests.
// After the time window expires, the bucket resets.
// ============================================================================

import { config } from './config';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/**
 * Information about a single IP address's rate limit status
 */
interface RateLimitEntry {
  count: number;              // How many requests made in current window
  windowStart: number;        // Timestamp when current window started (milliseconds)
}

/**
 * Result of checking rate limit
 */
export interface RateLimitResult {
  allowed: boolean;           // Can this request proceed?
  remaining: number;          // How many requests left in window
  resetTime: number;          // When the window resets (timestamp)
  retryAfter?: number;        // If blocked, how many seconds until they can try again
}

// ---------------------------------------------------------------------------
// In-Memory Storage
// ---------------------------------------------------------------------------

/**
 * Storage for rate limit data
 * 
 * WHAT IS A MAP?
 * Map is like a dictionary or phone book:
 * - Key: IP address (e.g., "192.168.1.1")
 * - Value: RateLimitEntry with request count and window start time
 * 
 * Example:
 * {
 *   "192.168.1.1": { count: 3, windowStart: 1673123456789 },
 *   "10.0.0.5": { count: 1, windowStart: 1673123460000 }
 * }
 * 
 * WHY IN-MEMORY?
 * - Fast (no database needed)
 * - Simple for MVP
 * - Automatically clears when server restarts
 * 
 * LIMITATIONS:
 * - Doesn't persist across server restarts
 * - Doesn't work across multiple servers (in scaled deployments)
 * - For production at scale, would use Redis or similar
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

// ---------------------------------------------------------------------------
// Main Rate Limiting Function
// ---------------------------------------------------------------------------

/**
 * Checks if a request should be allowed based on rate limits
 * 
 * ALGORITHM:
 * 1. Get current time
 * 2. Look up IP in storage
 * 3. Check if window has expired (time to reset?)
 * 4. If expired: reset counter
 * 5. If not expired: check if under limit
 * 6. Increment counter if allowed
 * 7. Return result
 * 
 * @param ipAddress - The IP address making the request
 * @returns RateLimitResult indicating if request is allowed
 */
export function checkRateLimit(ipAddress: string): RateLimitResult {
  // -------------------------------------------------------------------------
  // Step 1: Get current time
  // -------------------------------------------------------------------------
  // Date.now() returns current timestamp in milliseconds since Jan 1, 1970
  // Example: 1673123456789
  const now = Date.now();
  
  // -------------------------------------------------------------------------
  // Step 2: Calculate window duration in milliseconds
  // -------------------------------------------------------------------------
  // Config is in minutes, we need milliseconds
  // 1 minute = 60 seconds = 60,000 milliseconds
  const windowDuration = config.rateLimit.windowMinutes * 60 * 1000;
  
  // -------------------------------------------------------------------------
  // Step 3: Look up IP address in storage
  // -------------------------------------------------------------------------
  // .get() returns the value for a key, or undefined if key doesn't exist
  let entry = rateLimitStore.get(ipAddress);
  
  // -------------------------------------------------------------------------
  // Step 4: Check if this is a new IP or if window has expired
  // -------------------------------------------------------------------------
  if (!entry) {
    // New IP address - create entry
    entry = {
      count: 0,
      windowStart: now,
    };
    rateLimitStore.set(ipAddress, entry);
  } else {
    // Existing IP - check if window has expired
    const windowAge = now - entry.windowStart;  // How long since window started
    
    if (windowAge >= windowDuration) {
      // Window expired - reset to a fresh window
      entry.count = 0;
      entry.windowStart = now;
    }
  }
  
  // -------------------------------------------------------------------------
  // Step 5: Check if request is allowed
  // -------------------------------------------------------------------------
  const maxRequests = config.rateLimit.maxRequests;
  const allowed = entry.count < maxRequests;
  
  // -------------------------------------------------------------------------
  // Step 6: If allowed, increment counter
  // -------------------------------------------------------------------------
  if (allowed) {
    entry.count++;
  }
  
  // -------------------------------------------------------------------------
  // Step 7: Calculate remaining requests and reset time
  // -------------------------------------------------------------------------
  const remaining = Math.max(0, maxRequests - entry.count);
  
  // When will the window reset?
  const resetTime = entry.windowStart + windowDuration;
  
  // If blocked, how long until they can try again?
  let retryAfter: number | undefined;
  if (!allowed) {
    // Calculate seconds until window resets
    // Math.ceil rounds up to nearest whole number
    // Example: 45.2 seconds becomes 46 seconds
    retryAfter = Math.ceil((resetTime - now) / 1000);
  }
  
  // -------------------------------------------------------------------------
  // Step 8: Return result
  // -------------------------------------------------------------------------
  return {
    allowed,
    remaining,
    resetTime,
    retryAfter,
  };
}

// ---------------------------------------------------------------------------
// Management Functions
// ---------------------------------------------------------------------------

/**
 * Manually resets rate limit for a specific IP
 * Useful for testing or if you need to unblock someone
 * 
 * @param ipAddress - The IP address to reset
 * @returns true if IP was in storage, false if it wasn't
 */
export function resetRateLimit(ipAddress: string): boolean {
  // .delete() removes an entry from the Map
  // Returns true if the key existed, false if it didn't
  return rateLimitStore.delete(ipAddress);
}

/**
 * Clears all rate limit data
 * Useful for testing or maintenance
 */
export function clearAllRateLimits(): void {
  // .clear() removes all entries from the Map
  rateLimitStore.clear();
}

/**
 * Gets current rate limit status for an IP without incrementing counter
 * Useful for checking status without affecting the count
 * 
 * @param ipAddress - The IP address to check
 * @returns RateLimitResult (but doesn't increment counter)
 */
export function getRateLimitStatus(ipAddress: string): RateLimitResult {
  const now = Date.now();
  const windowDuration = config.rateLimit.windowMinutes * 60 * 1000;
  
  const entry = rateLimitStore.get(ipAddress);
  
  if (!entry) {
    // IP not in storage - they have full quota available
    return {
      allowed: true,
      remaining: config.rateLimit.maxRequests,
      resetTime: now + windowDuration,
    };
  }
  
  // Check if window has expired
  const windowAge = now - entry.windowStart;
  if (windowAge >= windowDuration) {
    // Window expired - they have full quota again
    return {
      allowed: true,
      remaining: config.rateLimit.maxRequests,
      resetTime: now + windowDuration,
    };
  }
  
  // Window still active
  const maxRequests = config.rateLimit.maxRequests;
  const allowed = entry.count < maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetTime = entry.windowStart + windowDuration;
  
  let retryAfter: number | undefined;
  if (!allowed) {
    retryAfter = Math.ceil((resetTime - now) / 1000);
  }
  
  return {
    allowed,
    remaining,
    resetTime,
    retryAfter,
  };
}

/**
 * Gets statistics about current rate limiting state
 * Useful for monitoring and debugging
 * 
 * @returns Object with statistics
 */
export function getRateLimitStats(): {
  totalIPs: number;
  activeWindows: number;
  expiredWindows: number;
} {
  const now = Date.now();
  const windowDuration = config.rateLimit.windowMinutes * 60 * 1000;
  
  let activeWindows = 0;
  let expiredWindows = 0;
  
  // .forEach() loops through all entries in the Map
  rateLimitStore.forEach((entry) => {
    const windowAge = now - entry.windowStart;
    if (windowAge < windowDuration) {
      activeWindows++;
    } else {
      expiredWindows++;
    }
  });
  
  return {
    totalIPs: rateLimitStore.size,      // .size is the total number of entries
    activeWindows,
    expiredWindows,
  };
}

/**
 * Cleans up expired rate limit entries
 * Should be called periodically to prevent memory growth
 * 
 * In production, you might run this on a schedule (e.g., every hour)
 * 
 * @returns Number of entries removed
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  const windowDuration = config.rateLimit.windowMinutes * 60 * 1000;
  
  let removedCount = 0;
  
  // Can't delete while iterating, so collect IPs to delete first
  const ipsToDelete: string[] = [];
  
  rateLimitStore.forEach((entry, ipAddress) => {
    const windowAge = now - entry.windowStart;
    if (windowAge >= windowDuration) {
      ipsToDelete.push(ipAddress);
    }
  });
  
  // Now delete them
  ipsToDelete.forEach(ip => {
    rateLimitStore.delete(ip);
    removedCount++;
  });
  
  return removedCount;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Extracts IP address from a request
 * Handles various header formats (proxy, load balancer, etc.)
 * 
 * EXPLANATION:
 * When requests go through proxies or load balancers,
 * the real client IP might be in different headers.
 * 
 * @param headers - Request headers object
 * @returns IP address string (or 'unknown' if can't determine)
 */
export function extractIPAddress(headers: Record<string, string | string[] | undefined>): string {
  // Check common headers in order of priority
  
  // 1. X-Forwarded-For (most common for proxies)
  //    Format: "client-ip, proxy1-ip, proxy2-ip"
  //    We want the first IP (the client)
  let ip = headers['x-forwarded-for'];
  if (ip) {
    if (Array.isArray(ip)) {
      ip = ip[0];
    }
    // Take first IP if comma-separated
    return ip.split(',')[0].trim();
  }
  
  // 2. X-Real-IP (some load balancers)
  ip = headers['x-real-ip'];
  if (ip) {
    if (Array.isArray(ip)) {
      ip = ip[0];
    }
    return ip.trim();
  }
  
  // 3. CF-Connecting-IP (Cloudflare)
  ip = headers['cf-connecting-ip'];
  if (ip) {
    if (Array.isArray(ip)) {
      ip = ip[0];
    }
    return ip.trim();
  }
  
  // 4. X-Client-IP (some CDNs)
  ip = headers['x-client-ip'];
  if (ip) {
    if (Array.isArray(ip)) {
      ip = ip[0];
    }
    return ip.trim();
  }
  
  // If we couldn't find IP, return 'unknown'
  // In production, you might want to reject requests without valid IP
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Constants for HTTP Headers
// ---------------------------------------------------------------------------

/**
 * Standard rate limit headers to include in responses
 * These follow RFC 6585 and common practice
 */
export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',           // Maximum requests allowed in window
  REMAINING: 'X-RateLimit-Remaining',   // Requests remaining in current window
  RESET: 'X-RateLimit-Reset',           // Timestamp when window resets
  RETRY_AFTER: 'Retry-After',           // Seconds to wait before retrying
} as const;

// ---------------------------------------------------------------------------
// Example Usage (for documentation)
// ---------------------------------------------------------------------------

/*
EXAMPLE 1: Normal usage

const result = checkRateLimit('192.168.1.1');
if (!result.allowed) {
  // Return 429 Too Many Requests
  return {
    statusCode: 429,
    headers: {
      'Retry-After': result.retryAfter,
    },
    body: JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter,
    }),
  };
}

EXAMPLE 2: Including rate limit info in response headers

const result = checkRateLimit(ipAddress);
const headers = {
  [RATE_LIMIT_HEADERS.LIMIT]: config.rateLimit.maxRequests.toString(),
  [RATE_LIMIT_HEADERS.REMAINING]: result.remaining.toString(),
  [RATE_LIMIT_HEADERS.RESET]: result.resetTime.toString(),
};

EXAMPLE 3: Extracting IP from request

const ipAddress = extractIPAddress(request.headers);
const result = checkRateLimit(ipAddress);

EXAMPLE 4: Periodic cleanup (in a scheduled job)

setInterval(() => {
  const removed = cleanupExpiredEntries();
  console.log(`Cleaned up ${removed} expired rate limit entries`);
}, 3600000);  // Run every hour
*/

