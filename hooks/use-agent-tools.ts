'use client';
import { useEffect,useRef } from 'react';
import { SOURCES,type Source } from '@/lib/market/alternate';
import { SYMBOLS,INTERVALS,type Symbol,type Interval } from '@/lib/market/types';
import type { Snapshot } from '@/lib/engine/pipeline';
interface Tool {name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown|Promise<unknown>}
export function useAgentTools(state:{source:Source;symbol:Symbol;interval:Interval;market?:Snapshot},configure:(s:Source,m:Symbol,i:Interval)=>void){
 const current=useRef(state),action=useRef(configure);current.current=state;action.current=configure;
 useEffect(()=>{
  const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void}}).modelContext;if(!context)return;
  const life=new AbortController();
  const register=(tool:Tool)=>{try{void Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{/* Unsupported experimental browser registry: normal UI remains available. */}};
  register({name:'read_market_analysis',description:'Read the selected market, source, signal, evidence, and quote time. Does not trade.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>{const s=current.current;return {source:s.source,symbol:s.symbol,interval:s.interval,status:s.market?.status,quoteTime:s.market?.current?.time,signal:s.market?.signal};}});
  register({name:'configure_market_analysis',description:'Change the visible chart source, market, and timeframe. This pauses the bot; it never approves or executes orders.',inputSchema:{type:'object',properties:{source:{type:'string',enum:Object.keys(SOURCES)},symbol:{type:'string',enum:SYMBOLS},interval:{type:'string',enum:Object.keys(INTERVALS)}},required:['source','symbol','interval'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{const p=input as {source:Source;symbol:Symbol;interval:Interval};if(!p||!Object.hasOwn(SOURCES,p.source)||!SYMBOLS.includes(p.symbol)||!Object.hasOwn(INTERVALS,p.interval)||(p.source==='coinbase'&&p.symbol==='BNBUSDT'))throw new Error('Unsupported analysis configuration');action.current(p.source,p.symbol,p.interval);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return {source:p.source,symbol:p.symbol,interval:p.interval,status:'configured; market data loading'};}});
  return()=>life.abort();
 },[]);
}
