import { BinanceConnector } from '@/lib/market/binance';
import { parseSubscription } from '@/lib/market/types';
const cache = new Map<string, { expires: number; bars: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
/** Allowlisted read-only proxy. No credentials, arbitrary URLs, or trading endpoints are accepted. */
export async function GET(request: Request) {
  let subscription;
  try { const url = new URL(request.url); subscription = parseSubscription(url.searchParams.get('symbol'), url.searchParams.get('interval')); }
  catch { return Response.json({ error: 'Unsupported symbol or interval' }, { status: 400 }); }
  const key = `${subscription.symbol}:${subscription.interval}`, hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Response.json(hit.bars, { headers: { 'Cache-Control': 'private, max-age=5' } });
  try {
    let job = inFlight.get(key);
    if (!job) { job = new BinanceConnector().history(subscription); inFlight.set(key, job); }
    const bars = await job; cache.set(key, { bars, expires: Date.now() + 5000 });
    return Response.json(bars, { headers: { 'Cache-Control': 'private, max-age=5' } });
  } catch { return Response.json({ error: 'Provider unavailable; select replay or retry later.' }, { status: 502, headers: { 'Retry-After': '10' } }); }
  finally { inFlight.delete(key); }
}
