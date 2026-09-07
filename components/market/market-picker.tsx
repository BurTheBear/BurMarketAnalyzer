'use client';
import { useEffect,useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import type { ListedMarket } from '@/lib/market/catalogue';
import type { Symbol } from '@/lib/market/types';
export default function MarketPicker({symbol,onSelect}:{symbol:Symbol;onSelect:(market:ListedMarket)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[markets,setMarkets]=useState<ListedMarket[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setError('');fetch('/api/symbols',{signal:controller.signal}).then(async r=>{const d=await r.json() as {markets?:ListedMarket[];error?:string};if(!r.ok)throw new Error(d.error);setMarkets(d.markets??[]);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[open,retry]);
 const matches=markets.filter(m=>m.symbol.includes(query.trim().toUpperCase()));
 return <><button className="button secondary" onClick={()=>setOpen(true)}><Search size={15}/>Find a Binance coin</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="market-picker"><DialogTitle>Binance Spot markets</DialogTitle><DialogDescription>{markets.length?`${markets.length} active USDT pairs from Binance.`:'Loading the current Binance listings…'} Selecting a coin switches to live Binance analysis. Other quote currencies, derivatives, and delisted markets are excluded.</DialogDescription><label className="field">Search coin or symbol<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="BTC, XRP, DOGE, ADA…"/></label>{error&&<p role="alert">{error}<button className="text-button" onClick={()=>setRetry(r=>r+1)}>Retry</button></p>}<div className="market-results">{matches.slice(0,80).map(m=><button key={m.symbol} className={`market-result ${symbol===m.symbol?'selected':''}`} onClick={()=>{onSelect(m);setOpen(false);}}><b>{m.baseAsset}<small> / USDT</small></b><span>Spot · min. {m.minNotional} USDT ↗</span></button>)}{markets.length>0&&!matches.length&&<p>No active USDT pair matches your search.</p>}</div>{matches.length>80&&<p className="muted text-xs">Showing 80 of {matches.length}. Type to narrow the list.</p>}</DialogContent></Dialog></>;
}
