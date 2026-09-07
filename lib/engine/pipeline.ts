import { validBar, type Bar, type Book, type Mode, type Subscription } from '../market/types';
import { AdvancedEngine, type Advanced } from './advanced';
import { IndicatorEngine, type Indicators } from './indicators';
import { Calibration, levels, scoreSignal, type Estimate, type Score } from './signals';
export interface Point { bar: Bar; indicators: Indicators; advanced: Advanced; score: Score }
export interface Signal extends Score { id: string; time: number; symbol: string; estimate: Estimate; entry: number; target: number; stop: number }
export interface Snapshot extends Subscription { source?: string; quote?: string; mode: Mode; points: Point[]; current: Bar | null; book: Book | null; signal: Signal | null; signals: Signal[]; status: string; error?: string; updatedAt: number }
/** Canonical committed state. Incomplete bars never enter recursive indicators or calibration. */
export class Pipeline {
  private engine = new IndicatorEngine(); private advanced = new AdvancedEngine(); private calibration = new Calibration();
  private points: Point[] = []; private signals: Signal[] = []; private current: Bar | null = null; private book: Book | null = null;
  private signal: Signal | null = null; private last = 0;
  constructor(private request: Subscription, private mode: Mode) {}
  push(bar: Bar) {
    if (!validBar(bar) || bar.time <= this.last || (this.current && bar.time < this.current.time)) return;
    this.current = bar;
    if (!bar.closed) return;
    this.last = bar.time;
    this.calibration.advance(bar);
    const indicators = this.engine.push(bar), advanced = this.advanced.push(bar, indicators), score = scoreSignal(bar, indicators, advanced);
    this.signal = { ...score, id: `${this.request.symbol}-${bar.time}`, time: bar.time, symbol: this.request.symbol, estimate: this.calibration.estimate(score.action), ...levels(bar.close, indicators.atr ?? 0, score.action) };
    if (this.calibration.enter(bar, indicators, score)) { this.signals.push(this.signal); if (this.signals.length > 80) this.signals.shift(); }
    this.points.push({ bar, indicators, advanced, score }); if (this.points.length > 600) this.points.shift();
  }
  updateBook(book: Book) { if (!this.book || book.sequence >= this.book.sequence) this.book = book; }
  snapshot(status = 'connected', error?: string): Snapshot {
    return { ...this.request, mode: this.mode, points: this.points, current: this.current, book: this.book, signal: this.signal, signals: this.signals, status, error, updatedAt: Date.now() };
  }
}
