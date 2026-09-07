/** Canonical market contracts. Prices are quote currency; timestamps are UTC seconds. */
export type Symbol = `${string}USDT`;
export const SYMBOLS:readonly Symbol[] = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
export const INTERVALS = { '1m': 60, '5m': 300, '15m': 900 } as const;
export type Interval = keyof typeof INTERVALS;
export type Mode = 'replay' | 'live';
export type Action = 'BUY' | 'SELL' | 'HOLD';
export interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean }
export interface Book { time: number; sequence: number; bids: [number, number][]; asks: [number, number][] }
export type MarketEvent = { type: 'bar'; bar: Bar } | { type: 'book'; book: Book } | { type: 'status'; status: string; error?: string };
export interface Subscription { symbol: Symbol; interval: Interval }
/** A connector owns transport and normalization, never analysis or UI state. */
export abstract class MarketConnector {
  abstract history(request: Subscription, signal?: AbortSignal): Promise<Bar[]>;
  abstract connect(request: Subscription, emit: (event: MarketEvent) => void): () => void;
}
export function validBar(bar: Bar): boolean {
  return [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)
    && bar.time > 0 && bar.open > 0 && bar.close > 0 && bar.low > 0 && bar.volume >= 0
    && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
}
export function parseSubscription(symbol: string | null, interval: string | null): Subscription {
  if (!symbol || !/^[A-Z0-9]{2,24}USDT$/.test(symbol) || !Object.hasOwn(INTERVALS, interval ?? '')) throw new Error('Unsupported symbol or interval');
  return { symbol: symbol as Symbol, interval: interval as Interval };
}
