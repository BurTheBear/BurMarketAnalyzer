import type { Action, Bar } from '../market/types';
import type { Advanced } from './advanced';
import type { Indicators } from './indicators';
export const STRATEGY = { threshold: 35, stopATR: 1.5, rewardMultiple: 2, horizon: 12, costBps: 12, minSamples: 30 } as const;
export interface Factor { name: string; value: number; weight: number }
export interface Score { action: Action; score: number; factors: Factor[] }
const clamp = (n: number) => Math.max(-1, Math.min(1, n));
/** Bur Confluence v2: fixed, inspectable weights, not a fitted performance claim. */
export function scoreSignal(bar: Bar, i: Indicators, advanced?: Advanced): Score {
  if ([i.ema200, i.rsi, i.histogram, i.bbUpper, i.atr].some(x => x === null) || !i.atr) return { action: 'HOLD', score: 0, factors: [] };
  const factors = [
    { name: 'Trend alignment', value: (Math.sign(i.ema9! - i.ema21!) + Math.sign(i.ema21! - i.ema50!) + Math.sign(bar.close - i.ema200!)) / 3, weight: 30 },
    { name: 'MACD momentum', value: clamp(i.histogram! / (i.atr * .15)), weight: 20 },
    { name: 'RSI balance', value: i.rsi! > 70 ? -.6 : i.rsi! < 30 ? .6 : clamp((i.rsi! - 50) / 20), weight: 10 },
    { name: 'Band position', value: clamp((bar.close - i.bbMiddle!) / Math.max(i.atr, (i.bbUpper! - i.bbLower!) / 2)), weight: 5 },
  ];
  if (advanced) {
    factors.push(
      { name: 'Volume flow', value: clamp((advanced.cmf ?? 0) * 4), weight: 10 },
      { name: 'Trend strength', value: advanced.adx === null ? 0 : Math.sign((advanced.plusDI ?? 0) - (advanced.minusDI ?? 0)) * Math.max(0,clamp((advanced.adx - 15) / 25)), weight: 10 },
      { name: 'VWAP position', value: advanced.vwap === null ? 0 : clamp((bar.close - advanced.vwap) / (i.atr * 3)), weight: 5 },
      { name: 'Candle patterns', value: clamp(advanced.patterns.reduce((n,p)=>n+(p.bias==='bullish'?1:p.bias==='bearish'?-1:0)*p.strength,0)), weight: 10 }
    );
  }
  const score = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  return { action: score >= STRATEGY.threshold ? 'BUY' : score <= -STRATEGY.threshold ? 'SELL' : 'HOLD', score, factors };
}
export function levels(entry: number, atr: number, action: Action) {
  const sign = action === 'SELL' ? -1 : 1;
  const risk = Math.min(entry * .25, Math.max(atr * STRATEGY.stopATR, entry * .0001));
  return { entry, stop: entry - sign * risk, target: entry + sign * risk * STRATEGY.rewardMultiple };
}
export interface Estimate { percent: number | null; lower: number | null; upper: number | null; samples: number; wins: number; exploratory: boolean }
/** Beta(2,2) posterior mean with a Wilson 95% sampling interval for observed wins. */
export function probability(wins: number, samples: number): Estimate {
  if (!samples) return { percent: null, lower: null, upper: null, samples, wins, exploratory: true };
  const p = wins / samples, z = 1.96, d = 1 + z * z / samples;
  const center = (p + z * z / (2 * samples)) / d;
  const half = z / d * Math.sqrt(p * (1 - p) / samples + z * z / (4 * samples * samples));
  return { percent: 100 * (wins + 2) / (samples + 4), lower: 100 * Math.max(0, center - half), upper: 100 * Math.min(1, center + half), samples, wins, exploratory: samples < STRATEGY.minSamples };
}
interface Trial { action: Exclude<Action, 'HOLD'>; entry: number; stop: number; target: number; age: number }
/** One non-overlapping trial per market. Only future candles can resolve a trial. */
export class Calibration {
  private results: { action: Exclude<Action, 'HOLD'>; win: boolean }[] = [];
  private trial: Trial | null = null;
  advance(bar: Bar) {
    const t = this.trial; if (!t) return;
    t.age++;
    const stopHit = t.action === 'BUY' ? bar.low <= t.stop : bar.high >= t.stop;
    const targetHit = t.action === 'BUY' ? bar.high >= t.target : bar.low <= t.target;
    if (stopHit || targetHit || t.age >= STRATEGY.horizon) {
      // Both touches are a loss. Timeouts are failures. Net target return must exceed estimated round-trip costs.
      const win = !stopHit && targetHit && Math.abs(t.target - t.entry) / t.entry > STRATEGY.costBps / 10000;
      this.results.push({ action: t.action, win }); if (this.results.length > 300) this.results.shift(); this.trial = null;
    }
  }
  enter(bar: Bar, indicators: Indicators, score: Score): boolean {
    if (this.trial || score.action === 'HOLD' || !indicators.atr) return false;
    this.trial = { action: score.action, ...levels(bar.close, indicators.atr, score.action), age: 0 }; return true;
  }
  estimate(action: Action): Estimate {
    const sample = this.results.filter(x => x.action === action);
    return probability(sample.filter(x => x.win).length, sample.length);
  }
}
