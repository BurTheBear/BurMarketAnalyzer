import type { Snapshot } from '../engine/pipeline';
export interface MarketUpdate { full:boolean; data:Snapshot }
/** History is sent once. Subsequent frames contain only newly closed bars/signals and the latest depth. */
export class WireEncoder {
 private initialized=false;private time=0;private signalTime=0;
 encode(snapshot:Snapshot):MarketUpdate{
  const full=!this.initialized;this.initialized=true;
  const data={...snapshot,points:full?snapshot.points:snapshot.points.filter(p=>p.bar.time>this.time),signals:full?snapshot.signals:snapshot.signals.filter(s=>s.time>this.signalTime)};
  this.time=snapshot.points.at(-1)?.bar.time??this.time;this.signalTime=snapshot.signals.at(-1)?.time??this.signalTime;return {full,data};
 }
}
export function mergeUpdate(previous:Snapshot|undefined,update:MarketUpdate):Snapshot{
 if(update.full||!previous)return update.data;
 return {...update.data,points:[...previous.points,...update.data.points.filter(p=>p.bar.time>(previous.points.at(-1)?.bar.time??0))].slice(-600),signals:[...previous.signals,...update.data.signals.filter(s=>!previous.signals.some(p=>p.id===s.id))].slice(-80)};
}
