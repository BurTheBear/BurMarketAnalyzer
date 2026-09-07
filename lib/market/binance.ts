import { MarketConnector, INTERVALS, validBar, type Bar, type Book, type MarketEvent, type Subscription } from './types';
export function normalizeKline(row: unknown, now = Date.now()): Bar {
  if (!Array.isArray(row) || row.length < 7) throw new Error('Invalid candle payload');
  const bar = { time: Number(row[0]) / 1000, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closed: Number(row[6]) < now };
  if (!validBar(bar)) throw new Error('Invalid candle values'); return bar;
}
export function normalizeBook(data: { bids: unknown; asks: unknown; lastUpdateId: unknown }): Book {
  const side = (rows: unknown): [number, number][] => {
    if (!Array.isArray(rows)) throw new Error('Invalid order book');
    return rows.map(r => { if (!Array.isArray(r)) throw new Error('Invalid depth level'); const p = Number(r[0]), q = Number(r[1]); if (!Number.isFinite(p) || !Number.isFinite(q) || p <= 0 || q < 0) throw new Error('Invalid depth value'); return [p, q] as [number, number]; }).filter(r => r[1] > 0).slice(0, 20);
  };
  const sequence = Number(data.lastUpdateId); if (!Number.isSafeInteger(sequence)) throw new Error('Invalid book sequence');
  return { time: Date.now(), sequence, bids: side(data.bids).sort((a,b) => b[0]-a[0]), asks: side(data.asks).sort((a,b) => a[0]-b[0]) };
}
/** Public read-only adapter. Partial-depth messages are complete top-20 snapshots, not diff deltas. */
export class BinanceConnector extends MarketConnector {
  constructor(private restBase = 'https://data-api.binance.vision', private streamBase = 'wss://data-stream.binance.vision', private proxy = false, private pollingOnly = false) { super(); }
  async history(r: Subscription, signal?: AbortSignal): Promise<Bar[]> {
    const url = this.proxy ? `${this.restBase}/api/history?symbol=${r.symbol}&interval=${r.interval}` : `${this.restBase}/api/v3/klines?symbol=${r.symbol}&interval=${r.interval}&limit=1000`;
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Market history unavailable (${response.status}). Check provider access in your region.`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected history response');
    return data.map(row => this.proxy ? row as Bar : normalizeKline(row)).filter(validBar).sort((a,b) => a.time-b.time);
  }
  connect(r: Subscription, emit: (event: MarketEvent) => void) {
    let socket: WebSocket | null = null, stopped=false, attempt=0, lastSocket=0, polling=false, lastPoll=0, socketOpenedAt=0, reported='';
    let retry:ReturnType<typeof setTimeout>|undefined,pollTimer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    const poll=async()=>{
      if(stopped||polling)return;clearTimeout(pollTimer);polling=true;
      try{
        let bars:Bar[],book:Book;
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]);
        if(this.proxy){const response=await fetch(`${this.restBase}/api/market?provider=binance&symbol=${r.symbol}&interval=${r.interval}`,{signal});if(!response.ok)throw new Error(`Live polling unavailable (${response.status})`);const payload=await response.json() as {bars:Bar[];book:Book};bars=payload.bars;book=payload.book;}
        else{const [candles,depth]=await Promise.all([fetch(`${this.restBase}/api/v3/klines?symbol=${r.symbol}&interval=${r.interval}&limit=100`,{signal}),fetch(`${this.restBase}/api/v3/depth?symbol=${r.symbol}&limit=20`,{signal})]);if(!candles.ok||!depth.ok)throw new Error('Live polling unavailable');bars=(await candles.json() as unknown[]).map(row=>normalizeKline(row));book=normalizeBook(await depth.json() as Parameters<typeof normalizeBook>[0]);}
        if(stopped)return;
        bars.forEach(bar=>emit({type:'bar',bar}));emit({type:'book',book});lastPoll=Date.now();
        if(this.pollingOnly||Date.now()-lastSocket>5000){reported='polling';emit({type:'status',status:'polling'});}
      }catch(e){if(!stopped&&Date.now()-lastSocket>5000)emit({type:'status',status:'reconnecting',error:e instanceof Error?e.message:'Both live transports unavailable; retaining last chart.'});}
      finally{polling=false;if(!stopped)pollTimer=setTimeout(()=>{if(this.pollingOnly||Date.now()-lastSocket>5000)void poll();else pollTimer=setTimeout(poll,15000);},3000);}
    };
    const open=()=>{
      if(stopped||this.pollingOnly)return;
      const s=r.symbol.toLowerCase(),base=attempt%2===0?this.streamBase:'wss://stream.binance.com:443';
      socketOpenedAt=Date.now();socket=new WebSocket(`${base}/stream?streams=${s}@kline_${r.interval}/${s}@depth20@100ms`);
      socket.onmessage=message=>{
        try{const {data:d}=JSON.parse(String(message.data));lastSocket=Date.now();attempt=0;
          if(d?.k){const k=d.k,bar:Bar={time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v,closed:!!k.x};if(k.s!==r.symbol||k.i!==r.interval||!validBar(bar))throw new Error('Invalid candle');emit({type:'bar',bar});}
          else if(d?.lastUpdateId!==undefined)emit({type:'book',book:normalizeBook(d)});
          if(reported!=='streaming'){reported='streaming';emit({type:'status',status:'streaming'});}
        }catch{emit({type:'status',status:'degraded',error:'Invalid market update rejected.'});}
      };
      socket.onerror=()=>socket?.close();
      socket.onclose=()=>{if(stopped)return;void poll();retry=setTimeout(open,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*500);};
    };
    void poll();open();
    const watchdog=setInterval(()=>{if(!this.pollingOnly&&socket&&Date.now()-Math.max(lastSocket,socketOpenedAt)>15000)socket.close();if(Date.now()-Math.max(lastSocket,lastPoll)>10000)void poll();},5000);
    return()=>{stopped=true;controller.abort();clearTimeout(retry);clearTimeout(pollTimer);clearInterval(watchdog);socket?.close();};
  }
}
