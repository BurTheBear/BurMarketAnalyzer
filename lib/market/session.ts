import { Pipeline, type Snapshot } from '../engine/pipeline';
import { INTERVALS, type Bar, type MarketConnector, type Mode, type Subscription } from './types';
/** Shared by the browser worker and Node backend. Reconnects backfill before applying buffered events. */
export class MarketSession {
  private pipeline: Pipeline; private controller = new AbortController(); private stopTransport?: () => void;
  private transportStatus='connecting'; private integrityError?:string; private status = 'connecting'; private error?: string; private stopped = false; private recovering = false;
  private pending: Bar[] = []; private lastClosed = 0; private lastPublish = 0; private retry?: ReturnType<typeof setTimeout>; private retries=0;
  constructor(private connector: MarketConnector, private request: Subscription, mode: Mode, private publish: (snapshot: Snapshot) => void) { this.pipeline = new Pipeline(request, mode); }
  private emit(force = false) { if (!this.stopped && (force || Date.now() - this.lastPublish >= 200)) { this.lastPublish = Date.now(); this.publish(this.pipeline.snapshot(this.integrityError?'error':this.recovering?'recovering':this.status,this.integrityError??this.error)); } }
  private apply(bar: Bar) { this.pipeline.push(bar); if (bar.closed) this.lastClosed = Math.max(this.lastClosed, bar.time); }
  private async recover() {
    if (this.recovering || this.stopped) return;
    this.recovering = true;
    try {
      const bars = await this.connector.history(this.request, this.controller.signal); if (this.stopped) return;
      const closed = bars.filter(b => b.closed);
      if (this.lastClosed && closed[0]?.time > this.lastClosed + INTERVALS[this.request.interval]) throw new Error('History gap exceeds recovery window. Restart the source to rebuild analysis.');
      closed.filter(b => b.time > this.lastClosed).forEach(b => this.apply(b));
      this.pending.sort((a,b) => a.time-b.time || Number(a.closed)-Number(b.closed)).forEach(b => this.apply(b)); this.pending = [];
      this.status = this.transportStatus; this.error = undefined; this.integrityError=undefined;
    } catch (error) { if (!this.stopped) { this.status = 'error'; this.integrityError = error instanceof Error ? error.message : 'History recovery failed'; } }
    finally { this.recovering = false; this.emit(true); }
  }
  async start() {
    this.emit(true);
    try {
      const bars = await this.connector.history(this.request, this.controller.signal); if (this.stopped) return;
      this.retries=0; bars.forEach(b => this.apply(b)); this.emit(true);
      this.stopTransport = this.connector.connect(this.request, event => {
        if (this.stopped) return;
        if (event.type === 'status') {
          this.transportStatus=event.status; this.status = event.status; this.error = event.error;
          if (event.status === 'connected') void this.recover();
        } else if (event.type === 'book') this.pipeline.updateBook(event.book);
        else {
          if (event.bar.time < this.lastClosed || (event.bar.closed && event.bar.time === this.lastClosed)) return;
          const gap = this.lastClosed && event.bar.time > this.lastClosed + INTERVALS[this.request.interval];
          if (this.recovering || gap) { this.pending.push(event.bar); if (this.pending.length > 2000) this.pending.shift(); if (!this.recovering) void this.recover(); }
          else this.apply(event.bar);
        }
        this.emit(event.type !== 'book');
      });
    } catch (error) { if (!this.stopped) { this.status = 'error'; this.error = error instanceof Error ? error.message : 'Market source unavailable'; this.emit(true); this.retry=setTimeout(()=>void this.start(),Math.min(30000,2000*2**Math.min(this.retries++,4)));  } }
  }
  stop() { this.stopped = true; this.controller.abort(); clearTimeout(this.retry); this.stopTransport?.(); }
}
