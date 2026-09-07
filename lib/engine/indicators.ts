import type { Bar } from '../market/types';

/** SMA-seeded recursive EMA. Null explicitly represents the warm-up period. */
export class EMA {
  private count = 0; private sum = 0; private value: number | null = null;
  constructor(readonly period: number) {}
  push(x: number): number | null {
    if (this.value === null) { this.sum += x; if (++this.count === this.period) this.value = this.sum / this.period; }
    else this.value += 2 / (this.period + 1) * (x - this.value);
    return this.value;
  }
}
/** Wilder smoothing, used by RSI and ATR, seeded with the arithmetic mean. */
class Wilder {
  private count = 0; private sum = 0; private value: number | null = null;
  constructor(private period: number) {}
  push(x: number) {
    if (this.value === null) { this.sum += x; if (++this.count === this.period) this.value = this.sum / this.period; }
    else this.value += (x - this.value) / this.period;
    return this.value;
  }
}
export interface Indicators {
  ema9: number | null; ema21: number | null; ema50: number | null; ema200: number | null;
  rsi: number | null; macd: number | null; signal: number | null; histogram: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null; atr: number | null;
}
/** O(1) recursive indicators; Bollinger variance uses a bounded 20-value window for numerical stability. */
export class IndicatorEngine {
  private emas = [9, 21, 50, 200, 12, 26].map(n => new EMA(n));
  private macdSignal = new EMA(9); private gain = new Wilder(14); private loss = new Wilder(14); private tr = new Wilder(14);
  private previous: number | null = null; private window: number[] = [];
  push(bar: Bar): Indicators {
    const values = this.emas.map(ema => ema.push(bar.close));
    const [ema9, ema21, ema50, ema200, fast, slow] = values;
    const macd = fast === null || slow === null ? null : fast - slow;
    const signal = macd === null ? null : this.macdSignal.push(macd);
    let rsi: number | null = null;
    if (this.previous !== null) {
      const delta = bar.close - this.previous;
      const gain = this.gain.push(Math.max(0, delta)), loss = this.loss.push(Math.max(0, -delta));
      if (gain !== null && loss !== null) rsi = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    const atr = this.tr.push(this.previous === null ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - this.previous), Math.abs(bar.low - this.previous)));
    this.previous = bar.close; this.window.push(bar.close); if (this.window.length > 20) this.window.shift();
    let bbMiddle = null, bbUpper = null, bbLower = null;
    if (this.window.length === 20) {
      bbMiddle = this.window.reduce((s, x) => s + x, 0) / 20;
      const sd = Math.sqrt(this.window.reduce((s, x) => s + (x - bbMiddle!) ** 2, 0) / 20);
      bbUpper = bbMiddle + 2 * sd; bbLower = bbMiddle - 2 * sd;
    }
    return { ema9, ema21, ema50, ema200, rsi, macd, signal, histogram: macd === null || signal === null ? null : macd - signal, bbMiddle, bbUpper, bbLower, atr };
  }
}
