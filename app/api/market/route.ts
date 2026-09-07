import { parseSubscription } from '@/lib/market/types';
import { normalizeKline } from '@/lib/market/binance';
import { yahooHistory, coinbaseMarket } from '@/lib/market/alternate';
import { liveBook, publicData } from '@/lib/trading/exchange';
const cache=new Map<string,{time:number;value:unknown}>(),jobs=new Map<string,Promise<unknown>>();
export async function GET(request:Request){
 let r,provider;try{const url=new URL(request.url);r=parseSubscription(url.searchParams.get('symbol'),url.searchParams.get('interval'));provider=url.searchParams.get('provider');if(!['binance','yahoo','coinbase'].includes(provider??''))throw new Error();}catch{return Response.json({error:'Unsupported market source'},{status:400});}
 const key=`${provider}:${r.symbol}:${r.interval}`,hit=cache.get(key),ttl=provider==='yahoo'?10000:1000;
 if(hit&&Date.now()-hit.time<ttl)return Response.json(hit.value,{headers:{'Cache-Control':'no-store'}});
 try{let job=jobs.get(key);if(!job){const requestCopy=r;job=provider==='coinbase'?coinbaseMarket(requestCopy):provider==='yahoo'?yahooHistory(requestCopy).then(bars=>({bars,book:null,fetchedAt:Date.now()})):Promise.all([publicData<unknown[]>('/api/v3/klines',{...requestCopy,limit:'100'}),liveBook(requestCopy.symbol)]).then(([rows,book])=>({bars:rows.map(row=>normalizeKline(row)),book,fetchedAt:Date.now()}));jobs.set(key,job);}const value=await job;cache.set(key,{time:Date.now(),value});return Response.json(value,{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({error:error instanceof Error?error.message:'Market source unavailable'},{status:502,headers:{'Retry-After':'5'}});}finally{jobs.delete(key);}
}
