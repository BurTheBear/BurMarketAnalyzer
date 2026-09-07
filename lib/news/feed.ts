import { XMLParser } from 'fast-xml-parser';
import type { Symbol } from '../market/types';
export interface NewsItem { title:string;url:string;source:string;publishedAt:number;symbols:Symbol[];sentiment:'positive'|'negative'|'neutral';risk:boolean }
export interface NewsFeed { items:NewsItem[];fetchedAt:number;healthy:boolean;unavailable:string[] }
const SOURCES=[{name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/',host:'coindesk.com'},{name:'Cointelegraph',url:'https://cointelegraph.com/rss',host:'cointelegraph.com'}];
const terms:Record<Symbol,RegExp>={BTCUSDT:/\b(bitcoin|btc)\b/i,ETHUSDT:/\b(ethereum|ether|eth)\b/i,SOLUSDT:/\b(solana|sol)\b/i,BNBUSDT:/\b(binance|bnb)\b/i};
const text=(v:unknown)=>String(v??'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
/** Headline-only classifications are transparent heuristics, not predictions or verified article facts. */
export function classify(title:string){const risk=/\b(hack(?:ed)?|exploit|insolvency|bankrupt(?:cy)?|outage|breach|fraud|liquidation)\b/i.test(title);const pos=(title.match(/\b(surge|rally|approval|approved|inflows|gain|record|adoption)\b/gi)??[]).length,neg=(title.match(/\b(plunge|crash|outflows|ban|lawsuit|selloff|fall|hack|exploit|loss)\b/gi)??[]).length;return {sentiment:pos>neg?'positive':neg>pos?'negative':'neutral',risk} as const;}
let cached:NewsFeed|null=null,pending:Promise<NewsFeed>|null=null;
export async function news():Promise<NewsFeed>{
 if(cached&&Date.now()-cached.fetchedAt<120000)return cached;if(pending)return pending;
 pending=(async()=>{
 const results=await Promise.allSettled(SOURCES.map(async source=>{
  const r=await fetch(source.url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/rss+xml, application/xml'},cache:'no-store'});if(!r.ok)throw new Error('News source unavailable');
  const raw=await r.text();if(raw.length>1500000)throw new Error('Oversized news response');
  const parsed=new XMLParser({ignoreAttributes:true,processEntities:false,htmlEntities:false}).parse(raw);
  const items=parsed.rss?.channel?.item;if(!items)throw new Error('Invalid news feed');
  return (Array.isArray(items)?items:[items]).slice(0,30).flatMap((item:Record<string,unknown>)=>{
   const title=text(item.title).slice(0,220),url=text(item.link),publishedAt=Date.parse(text(item.pubDate));let host;
   try{const u=new URL(url);if(u.protocol!=='https:')return [];host=u.hostname;}catch{return [];}
   if(!(host===source.host||host.endsWith('.'+source.host))||!Number.isFinite(publishedAt)||publishedAt>Date.now()+300000||Date.now()-publishedAt>86400000)return [];
   const symbols=(Object.keys(terms) as Symbol[]).filter(s=>terms[s].test(title));return [{title,url,source:source.name,publishedAt,symbols,...classify(title)}];
  });
 }));
 const unavailable=results.flatMap((r,n)=>r.status==='rejected'?[SOURCES[n].name]:[]),items=results.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((a,b)=>b.publishedAt-a.publishedAt);
 const unique=items.filter((item,index)=>items.findIndex(x=>x.title.toLowerCase()===item.title.toLowerCase())===index).slice(0,35);
 // Require at least one recently published item. A reachable but old feed isn't healthy.
 cached={items:unique,fetchedAt:Date.now(),healthy:unavailable.length<SOURCES.length&&unique.some(x=>Date.now()-x.publishedAt<6*3600000),unavailable};return cached;
 })();try{return await pending;}finally{pending=null;}
}
export function newsGate(feed:NewsFeed,symbol:Symbol,now=Date.now()){
 if(!feed.healthy||now-feed.fetchedAt>300000)return {allowed:false,reason:'News is unavailable or stale. The bot is paused until fresh coverage returns.'};
 const risk=feed.items.find(x=>x.risk&&now-x.publishedAt<3600000&&(!x.symbols.length||x.symbols.includes(symbol)));
 return risk?{allowed:false,reason:`Recent risk headline: ${risk.title}. Review the news before a manual decision.`}:{allowed:true,reason:'Fresh news available; no matching high-risk headline detected in the last hour.'};
}
