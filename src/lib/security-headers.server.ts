/**
 * Security headers applied to every Worker response (see app/src/server.ts).
 * Cashfree and Razorpay checkout need their scripts and payment frames allowed.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com https://sdk.cashfree.com https://*.cashfree.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; media-src 'self' https:; " +
      "connect-src 'self' https:; " +
      "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://*.cashfree.com; " +
      "base-uri 'self'; form-action 'self' https://*.cashfree.com; frame-ancestors 'self'",
  );
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\" \"https://api.razorpay.com\")");
  headers.set("X-XSS-Protection", "0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
