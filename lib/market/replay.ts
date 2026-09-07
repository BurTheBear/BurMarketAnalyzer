import { MarketConnector, INTERVALS, type Bar, type MarketEvent, type Subscription, type Symbol } from './types';
export const ASSETS: Record<Symbol, { name: string; mark: string; price: number; seed: number }> = {
  BTCUSDT: { name: 'Bitcoin', mark: '₿', price: 67420, seed: 71 }, ETHUSDT: { name: 'Ethereum', mark: 'Ξ', price: 3520, seed: 171 }, SOLUSDT: { name: 'Solana', mark: '◎', price: 148.5, seed: 281 }, BNBUSDT: { name: 'BNB', mark: 'B', price: 591.3, seed: 913 },
};
export function random(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Deterministic synthetic history, never labeled or used as actual market performance. */
export function replayHistory(r: Subscription, end = Math.floor(Date.now() / 1000 / INTERVALS[r.interval]) * INTERVALS[r.interval], count = 1800): Bar[] {
  const asset = ASSETS[r.symbol], rand = random(asset.seed); let close = asset.price * .96;
  return Array.from({ length: count }, (_, n) => {
    const open = close, trend = Math.sin(n / 33 + asset.seed) * .00075 + .000022;
    close = open * (1 + trend + (rand() - .5) * .003);
    return { time: end - (count - n) * INTERVALS[r.interval], open, close, high: Math.max(open, close) * (1 + rand() * .0009), low: Math.min(open, close) * (1 - rand() * .0009), volume: 4 + rand() * 30, closed: true };
  });
}
export class ReplayConnector extends MarketConnector {
  private bars: Bar[] = [];
  async history(r: Subscription) { this.bars = replayHistory(r); return this.bars; }
  connect(r: Subscription, emit: (event: MarketEvent) => void) {
    const rand = random(ASSETS[r.symbol].seed + 99); let previous = this.bars.at(-1)!, ticks = 0, sequence = 0;
    let bar: Bar = { ...previous, time: previous.time + INTERVALS[r.interval], open: previous.close, high: previous.close, low: previous.close, close: previous.close, volume: 0, closed: false };
    emit({ type: 'status', status: 'replay' });
    const timer = setInterval(() => {
      const close = bar.close * (1 + (rand() - .43) * .00055);
      bar = { ...bar, close, high: Math.max(bar.high, close), low: Math.min(bar.low, close), volume: bar.volume + rand() * 4, closed: ++ticks % 5 === 0 };
      emit({ type: 'bar', bar });
      const spread = close * .00004;
      emit({ type: 'book', book: { time: Date.now(), sequence: ++sequence, bids: Array.from({ length: 20 }, (_, i) => [close - spread * (i + 1), .1 + rand() * 4]), asks: Array.from({ length: 20 }, (_, i) => [close + spread * (i + 1), .1 + rand() * 4]) } });
      if (bar.closed) { previous = bar; bar = { ...previous, time: previous.time + INTERVALS[r.interval], open: close, high: close, low: close, volume: 0, closed: false }; }
    }, 1000);
    return () => clearInterval(timer);
  }
}
