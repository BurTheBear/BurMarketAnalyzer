import { normalizeBook } from '../market/binance';
import type { Symbol } from '../market/types';
export interface Credentials { apiKey: string; secret: string }
export interface Filter { filterType: string; minQty?: string; maxQty?: string; stepSize?: string; minNotional?: string; maxNotional?: string }
export class ExchangeError extends Error { constructor(message: string, public uncertain = false) { super(message); } }
export interface ExchangeAccount { canTrade: boolean; balances: { asset:string; free:string; locked:string }[] }
export interface ExchangeOrder { orderId:number; status:string; executedQty:string; cummulativeQuoteQty:string }
const PUBLIC = 'https://data-api.binance.vision', PRIVATE = 'https://api.binance.com';
/** Restrict paths to adapter-owned constants. This client cannot call withdrawals or transfers. */
export async function publicData<T>(path: string, query: Record<string,string> = {}) {
  const response = await fetch(`${PUBLIC}${path}?${new URLSearchParams(query)}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Binance market access unavailable (${response.status}). Live orders and paper fills are paused.`);
  return await response.json() as T;
}
export async function liveBook(symbol: Symbol) { return normalizeBook(await publicData<{bids:unknown;asks:unknown;lastUpdateId:unknown}>('/api/v3/depth', { symbol, limit: '20' })); }
export async function validateQuantity(symbol: Symbol, quantity: number, price: number) {
  const info = await publicData<{symbols:{status:string;isSpotTradingAllowed:boolean;filters:Filter[]}[]}>('/api/v3/exchangeInfo', { symbol });
  const asset = info.symbols?.[0]; if (!asset || asset.status !== 'TRADING' || !asset.isSpotTradingAllowed) throw new Error('Market is not available for spot trading');
  for (const filter of asset.filters as Filter[]) {
    if (filter.filterType === 'LOT_SIZE' || filter.filterType === 'MARKET_LOT_SIZE') {
      const min = Number(filter.minQty), max = Number(filter.maxQty), step = Number(filter.stepSize);
      if (quantity < min || (max > 0 && quantity > max)) throw new Error(`Quantity must be between ${min} and ${max}`);
      if (step > 0) { const units = Math.round(quantity * 1e8), stepUnits = Math.round(step * 1e8); if (stepUnits && units % stepUnits !== 0) throw new Error(`Quantity must use increments of ${filter.stepSize}`); }
    }
    if (filter.filterType === 'MIN_NOTIONAL' || filter.filterType === 'NOTIONAL') {
      const value = quantity * price;
      if (value < Number(filter.minNotional)) throw new Error(`Order must be at least ${filter.minNotional} USDT`);
      if (Number(filter.maxNotional) > 0 && value > Number(filter.maxNotional)) throw new Error('Order exceeds exchange notional limit');
    }
  }
}
export async function signed<T = ExchangeOrder>(credentials: Credentials, method: 'GET'|'POST', path: '/api/v3/account'|'/api/v3/order', parameters: Record<string,string> = {}) {
  // Exchange time avoids local clock skew. Never retry a POST: a timeout may already have placed the order.
  const time = await publicData<{serverTime:number}>('/api/v3/time');
  const query = new URLSearchParams({ ...parameters, recvWindow: '5000', timestamp: String(time.serverTime) });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(credentials.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(query.toString()));
  query.set('signature', [...new Uint8Array(signature)].map(n=>n.toString(16).padStart(2,'0')).join(''));
  let response: Response;
  try { response = await fetch(`${PRIVATE}${path}${method==='GET'?'?'+query:''}`, { method, headers: { 'X-MBX-APIKEY': credentials.apiKey, ...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}) }, body: method==='POST'?query:undefined, signal: AbortSignal.timeout(10000), cache:'no-store' }); }
  catch { throw new ExchangeError('Exchange response unknown. Reconcile this order before placing another.', method === 'POST'); }
  const data = await response.json() as T & {code?:number;msg?:string};
  if (!response.ok) throw new ExchangeError(`Binance rejected the request (${data.code ?? response.status}): ${String(data.msg ?? 'Request failed').slice(0,180)}`, method === 'POST' && (response.status >= 500 || data.code === -1007));
  return data;
}
const bytes = (value: string) => Uint8Array.from(atob(value), c=>c.charCodeAt(0));
async function encryptionKey(secret: string) { const raw = bytes(secret); if (raw.length !== 32) throw new Error('Credential vault key must be 32 bytes'); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']); }
/** Per-user authenticated encryption prevents swapping credentials between user records. */
export async function seal(credentials: Credentials, secret: string, user: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), key = await encryptionKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name:'AES-GCM', iv, additionalData:new TextEncoder().encode(user) }, key, new TextEncoder().encode(JSON.stringify(credentials)));
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
export async function unseal(value: string, secret: string, user: string): Promise<Credentials> {
  const data=bytes(value), key=await encryptionKey(secret);
  const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12),additionalData:new TextEncoder().encode(user)},key,data.slice(12));
  return JSON.parse(new TextDecoder().decode(decoded));
}
