import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content Security Policy: only our own scripts and Stripe's may run.
// Applied at build time only, because Vite's dev server injects inline scripts.
function buildCsp(apiOrigin, mediaOrigin) {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  const media = mediaOrigin ? ` ${mediaOrigin}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' https://js.stripe.com https://*.js.stripe.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${api}${media}`,
    `connect-src 'self'${api} https://api.stripe.com`,
    'frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com',
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : '';
  // Where ad images are served from in production (the Supabase project URL).
  const mediaOrigin = env.VITE_MEDIA_ORIGIN ? new URL(env.VITE_MEDIA_ORIGIN).origin : '';
  return {
    plugins: [react(), securityHeaders(apiOrigin, mediaOrigin)],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:5000',
        '/uploads': 'http://localhost:5000',
      },
    },
  };
});
