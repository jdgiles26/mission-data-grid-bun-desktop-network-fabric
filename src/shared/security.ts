/**
 * Security Utilities - Input validation, sanitization, and encryption
 * Prevents XSS, injection, and other common vulnerabilities
 */

/**
 * Sanitize user input to prevent XSS attacks
 * Removes all HTML tags and dangerous attributes
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/[<>\"']/g, (match) => {
      const map: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
      };
      return map[match] || match;
    })
    .trim();
}

/**
 * Escape HTML entities to prevent XSS in dynamically rendered content
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;'
  };
  return text.replace(/[&<>"'\/]/g, (char) => map[char]);
}

/**
 * Validate URL to prevent javascript: protocol and similar attacks
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Escape shell argument to prevent command injection
 * Wraps in single quotes and escapes any existing quotes
 */
export function escapeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') return "''";
  return `'${arg.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Validate JSON structure to prevent JSON injection
 */
export function isValidJson(json: string): boolean {
  try {
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate cryptographically secure random token for CSRF protection
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate CSRF token by comparing with stored token
 */
export function validateCsrfToken(token: string, storedToken: string): boolean {
  if (!token || !storedToken) return false;
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.subtle ? timerSafeCompare(token, storedToken) : token === storedToken;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timerSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate IP address (IPv4 and IPv6)
 */
export function isValidIpAddress(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
  
  return ipv6Regex.test(ip);
}

/**
 * Validate YAML to prevent code injection
 */
export function isValidYaml(yaml: string): boolean {
  // Check for dangerous patterns
  const dangerousPatterns = [
    /^\s*!!python/m,
    /^\s*!!ruby/m,
    /^\s*!!js/m,
    /eval\(/i,
    /exec\(/i,
    /__import__/i,
  ];
  
  return !dangerousPatterns.some((pattern) => pattern.test(yaml));
}

/**
 * Rate limiter helper to prevent brute force attacks
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const attemptTimes = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = attemptTimes.filter((time) => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    // Record this attempt
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    
    return true;
  }

  getRemainingAttempts(identifier: string): number {
    const now = Date.now();
    const attemptTimes = this.attempts.get(identifier) || [];
    const recentAttempts = attemptTimes.filter((time) => now - time < this.windowMs);
    return Math.max(0, this.maxAttempts - recentAttempts.length);
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

/**
 * Content Security Policy helper
 */
export function getCspHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: http: https:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}

/**
 * Hash sensitive data for logging (never log the actual value)
 */
export function hashForLogging(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

/**
 * Create safe log entry (no sensitive data)
 */
export function createSafeLogEntry(data: Record<string, any>): Record<string, any> {
  const safeEntry: Record<string, any> = {};
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
  
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      safeEntry[key] = `[REDACTED_${typeof value}]`;
    } else if (typeof value === 'object') {
      safeEntry[key] = createSafeLogEntry(value);
    } else {
      safeEntry[key] = value;
    }
  }
  
  return safeEntry;
}
