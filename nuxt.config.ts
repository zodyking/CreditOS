import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

export default defineNuxtConfig({
  compatibilityDate: '2025-10-01',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@nuxt/icon', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  icon: {
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true, sizeLimitKb: 512 },
    mode: 'svg',
  },
  eslint: {
    config: { stylistic: false },
  },
  app: {
    head: {
      title: 'CreditOS',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'CreditOS — AI-powered personal credit intelligence and dispute operations.' },
        { name: 'theme-color', content: '#0B1220' },
        { name: 'robots', content: 'noindex' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },
  runtimeConfig: {
    // Server-only. Every value can be overridden at runtime with NUXT_* env vars,
    // and server/utils/env.ts additionally honours the un-prefixed names
    // (DATABASE_URL, OPENROUTER_API_KEY, ...) so Dokploy-style env panels work.
    databaseUrl: '',
    appEncryptionKey: '',
    appMode: 'demo',
    openrouterApiKey: '',
    openrouterDefaultModel: 'openai/gpt-4o-mini',
    dataDir: './data',
    autoMigrate: 'true',
    demoSeed: 'true',
    session: {
      name: 'creditos-session',
      password: '',
      cookie: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
      maxAge: 60 * 60 * 12,
    },
    public: {
      appName: 'CreditOS',
      appVersion: pkg.version,
    },
  },
  nitro: {
    preset: 'node-server',
  },
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
