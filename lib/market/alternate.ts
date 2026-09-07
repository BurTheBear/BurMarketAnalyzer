import { MarketConnector, INTERVALS, validBar, type Bar, type Subscription, type MarketEvent } from './types';
export type Source='binance'|'binance-rest'|'coinbase'|'yahoo'|'replay';
export const SOURCES:Record<Source,string>={binance:'Binance · auto reconnect','binance-rest':'Binance · live polling',coinbase:'Coinbase · USD candles',yahoo:'Yahoo Finance · indicative USD',replay:'Synthetic replay'};
interface YahooResult { timestamp?:number[];indicators?:{quote?:{open:(number|null)[];high:(number|null)[];low:(number|null)[];close:(number|null)[];volume:(number|null)[]}[]};meta?:{currency?:string} }
/** Yahoo's chart endpoint is an unofficial integration: indicative USD bars, no execution-quality depth. */
export async function yahooHistory(r:Subscription,signal?:AbortSignal):Promise<Bar[]>{
 const ticker=r.symbol.replace('USDT','-USD');const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${r.interval}&range=5d`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`Yahoo Finance unavailable (${response.status}). Select Binance or retry.`);
 const payload=await response.json() as {chart:{result:YahooResult[]|null;error:unknown}},result=payload.chart?.result?.[0],q=result?.indicators?.quote?.[0];
 if(!result?.timestamp||!q)throw new Error('Yahoo did not return usable chart data');
 return result.timestamp.map((time,n)=>({time,open:Number(q.open[n]),high:Number(q.high[n]),low:Number(q.low[n]),close:Number(q.close[n]),volume:Number(q.volume[n]??0),closed:(time+INTERVALS[r.interval])*1000<Date.now()})).filter(validBar).slice(-1500);
}
export class YahooConnector extends MarketConnector {
 constructor(private origin:string,private provider:'yahoo'|'coinbase'='yahoo'){super();}
 async history(r:Subscription,signal?:AbortSignal){const response=await fetch(`${this.origin}/api/market?provider=${this.provider}&symbol=${r.symbol}&interval=${r.interval}`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000)});const data=await response.json() as {bars:Bar[];error?:string};if(!response.ok)throw new Error(data.error??'Yahoo Finance unavailable');return data.bars;}
 connect(r:Subscription,emit:(event:MarketEvent)=>void){let stopped=false,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();const poll=async()=>{try{const bars=await this.history(r,controller.signal);if(stopped)return;bars.forEach(bar=>emit({type:'bar',bar}));emit({type:'status',status:this.provider==='yahoo'?'indicative':'polling'});}catch(e){if(!stopped)emit({type:'status',status:'error',error:e instanceof Error?e.message:'Yahoo unavailable'});}finally{if(!stopped)timer=setTimeout(poll,this.provider==='yahoo'?15000:5000);}};void poll();return()=>{stopped=true;controller.abort();clearTimeout(timer);};}
}

export async function coinbaseMarket(r:Subscription){
 if(r.symbol==='BNBUSDT')throw new Error('BNB is not listed on Coinbase. Choose BTC, ETH, or SOL.');
 const product=r.symbol.replace('USDT','-USD');
 const response=await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${INTERVALS[r.interval]}`,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`Coinbase unavailable (${response.status}). Select another source.`);
 const rows=await response.json() as number[][];
 const bars=rows.map(row=>({time:row[0],low:row[1],high:row[2],open:row[3],close:row[4],volume:row[5],closed:(row[0]+INTERVALS[r.interval])*1000<Date.now()})).filter(validBar).sort((a,b)=>a.time-b.time);
 return {bars,book:null,fetchedAt:Date.now()};
}
