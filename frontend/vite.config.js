import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content Security Policy: only our own scripts, Stripe's and Paystack's may run.
// Applied at build time only, because Vite's dev server injects inline scripts.
function buildCsp(apiOrigin, mediaOrigin) {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  const media = mediaOrigin ? ` ${mediaOrigin}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' https://js.stripe.com https://*.js.stripe.com https://challenges.cloudflare.com https://js.paystack.co",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${api}${media} https://*.paystack.co https://*.paystack.com`,
    `connect-src 'self'${api} https://api.stripe.com https://api.paystack.co`,
    // Video ads stream from the API (dev) or the media bucket; blob: is the local preview.
    `media-src 'self' blob:${api}${media}`,
    // Google Maps Embed (map add-on), loaded only when a visitor clicks "Show map".
    'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://www.google.com https://checkout.paystack.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function securityHeaders(apiOrigin, mediaOrigin) {
  const csp = buildCsp(apiOrigin, mediaOrigin);
  return {
    name: 'throne-security-headers',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
    ],
    // Cloudflare Pages / Netlify read dist/_headers. frame-ancestors (anti-
    // clickjacking) only works as a real header, not in the meta tag above.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          '/*',
          `  Content-Security-Policy: ${csp}; frame-ancestors 'none'`,
          '  X-Frame-Options: DENY',
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
          '',
        ].join('\n'),
      });
    },
  };
}

// sitemap.xml + robots.txt, written at build time from the public site URL
// (VITE_SITE_URL), so they always point at the real domain.
const PUBLIC_PAGES = ['/', '/kings', '/practice', '/invite', '/faq', '/safety', '/contact', '/partners', '/changelog', '/legal'];
function seoFiles(siteUrl) {
  return {
    name: 'throne-seo-files',
    apply: 'build',
    generateBundle() {
      const base = (siteUrl || 'https://throne.example').replace(/\/$/, '');
      const today = new Date().toISOString().slice(0, 10);
      const urls = PUBLIC_PAGES.map(
        (path) => `  <url><loc>${base}${path === '/' ? '/' : path}</loc><lastmod>${today}</lastmod><changefreq>${path === '/' ? 'hourly' : 'weekly'}</changefreq><priority>${path === '/' ? '1.0' : '0.6'}</priority></url>`,
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          '</urlset>',
          '',
        ].join('\n'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /my-ads', 'Disallow: /wallet', 'Disallow: /go/', 'Disallow: /api/', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n'),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : '';
  // Where ad images are served from in production (the Supabase project URL).
  const mediaOrigin = env.VITE_MEDIA_ORIGIN ? new URL(env.VITE_MEDIA_ORIGIN).origin : '';
  return {
    plugins: [react(), securityHeaders(apiOrigin, mediaOrigin), seoFiles(env.VITE_SITE_URL)],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:5000',
        '/uploads': 'http://localhost:5000',
      },
    },
  };
});
