import { randomBytes } from 'node:crypto';
export const config = {
  env: process.env.APP_ENV || 'demo',
  databaseUrl: process.env.DATABASE_URL,
  origin: process.env.APP_ORIGIN || 'http://localhost:8088',
  port: Number(process.env.PORT || 8088),
  secret: process.env.APP_SECRET || (process.env.APP_ENV === 'production' ? '' : 'local-demo-only-change-before-production'),
  authMode: process.env.AUTH_MODE || 'email',
  publicDemo: process.env.DEMO_PUBLIC === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  oidc: {
    issuer: process.env.OIDC_ISSUER || '',
    internalIssuer: process.env.OIDC_INTERNAL_ISSUER || process.env.OIDC_ISSUER || '',
    clientId: process.env.OIDC_CLIENT_ID || 'oop-web',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
  },
  llmMode: process.env.LLM_MODE || 'manual',
  llmUrl: process.env.LLM_URL || '',
  llmKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || '',
  mailMode: process.env.MAIL_MODE || 'smtp',
  smtpHost: process.env.SMTP_HOST || 'mailpit',
  smtpPort: Number(process.env.SMTP_PORT || 1025),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  mailFrom: process.env.MAIL_FROM || 'ООП <oop@example.test>',
  pdfFont: process.env.PDF_FONT || '/usr/share/fonts/dejavu/DejaVuSans.ttf',
};
if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
if (!['email','keycloak'].includes(config.authMode)) throw new Error('Unsupported AUTH_MODE');
if (config.authMode === 'keycloak' && (!config.oidc.issuer || !config.oidc.clientSecret)) throw new Error('Keycloak requires OIDC_ISSUER and OIDC_CLIENT_SECRET');
if (config.env === 'production' && (!config.origin.startsWith('https://') || config.secret.length < 32 || config.mailMode !== 'smtp' || ['mailpit','localhost'].includes(config.smtpHost))) {
  throw new Error('Production requires HTTPS, APP_SECRET >=32 characters and an external SMTP provider');
}
export const token = () => randomBytes(32).toString('hex');
