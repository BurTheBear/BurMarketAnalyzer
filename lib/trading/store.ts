import { env } from 'cloudflare:workers';
export type Runtime = { DB: D1Database; VAULT?: R2Bucket; CREDENTIAL_ENCRYPTION_KEY?: string };
export function runtime() { return env as unknown as Runtime; }
export function db() { const binding = runtime().DB; if (!binding) throw new Error('Trading database is not configured'); return binding; }
/** The private Sites dispatcher authenticates and strips spoofed identity headers. */
export function identity(request: Request): string {
  const user = request.headers.get('oai-authenticated-user-id') || (import.meta.env.DEV && ['localhost','127.0.0.1'].includes(new URL(request.url).hostname) ? 'local-development-user' : null);
  if (!user) throw new Error('Sign in to use your trading account.');
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) throw new Error('Invalid request origin');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('JSON request required');
  }
  return user;
}
