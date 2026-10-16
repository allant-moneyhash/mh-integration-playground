import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Other sites may not frame the playground (clickjacking); MoneyHash's own iframes inside it are unaffected.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // payment=*: wallets in MoneyHash's embed run in further nested frames
          // (MoneyHash's wallet session page, pay.google.com, Apple), which a list of
          // origins here would block. Each iframe still has to opt in with allow="payment".
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=*',
          },
        ],
      },
      {
        // Apple Pay domain verification (with and without .txt), as plain text.
        source:
          '/.well-known/apple-developer-merchantid-domain-association:ext(\\.txt)?',
        headers: [{ key: 'Content-Type', value: 'text/plain' }],
      },
      {
        // Never cache API responses: they can carry intent secrets.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
