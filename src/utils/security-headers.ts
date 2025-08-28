// Security headers utility for API responses
// Implements common security best practices

export interface SecurityHeadersConfig {
  allowedOrigins?: string[];
  maxAge?: number;
  allowCredentials?: boolean;
}

export function addSecurityHeaders(response: Response, config: SecurityHeadersConfig = {}): Response {
  const headers = new Headers(response.headers);

  // Content Security Policy - Prevent XSS attacks
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
  );

  // X-Content-Type-Options - Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options - Prevent clickjacking
  headers.set('X-Frame-Options', 'DENY');

  // X-XSS-Protection - Enable XSS filtering
  headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy - Control referrer information
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy - Control browser features
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );

  // Strict-Transport-Security - Force HTTPS (only in production)
  if (import.meta.env.PROD) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // CORS headers
  const allowedOrigins = config.allowedOrigins || [
    'https://pymcu.com',
    'https://www.pymcu.com',
    'https://pymcu-landing.vercel.app',
    'https://pymcu-landing.netlify.app',
  ];

  // Add localhost for development
  if (import.meta.env.DEV) {
    allowedOrigins.push('http://localhost:4321', 'http://localhost:3000', 'http://127.0.0.1:4321');
  }

  // Set CORS headers
  headers.set('Access-Control-Allow-Origin', allowedOrigins.join(', '));
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  headers.set('Access-Control-Max-Age', (config.maxAge || 86400).toString());

  if (config.allowCredentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // Cache control for API responses
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Helper function to create a secure JSON response
export function createSecureResponse(
  data: Record<string, unknown>,
  status: number = 200,
  config: SecurityHeadersConfig = {}
): Response {
  const response = new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return addSecurityHeaders(response, config);
}

// Handle preflight OPTIONS requests
export function handleCORSPreflight(request: Request, config: SecurityHeadersConfig = {}): Response | null {
  if (request.method === 'OPTIONS') {
    return createSecureResponse({ message: 'CORS preflight' }, 200, config);
  }
  return null;
}
