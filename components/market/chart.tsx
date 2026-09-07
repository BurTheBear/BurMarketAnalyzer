'use client';
import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp, type ISeriesMarkersPluginApi, type Time } from 'lightweight-charts';
import type { Snapshot, Point } from '@/lib/engine/pipeline';
import { CHART_STUDIES } from '@/lib/engine/chart-options';
interface State { chart:IChartApi; candle:ISeriesApi<'Candlestick'>; volume?:ISeriesApi<'Histogram'>; histogram?:ISeriesApi<'Histogram'>; lines:{series:ISeriesApi<'Line'>;value:(p:Point)=>number|null}[]; markers?:ISeriesMarkersPluginApi<Time>; last:number }
const COLORS=['#e2be93','#97b3a5','#b595ce','#d89377','#d7cf91'];
export default function MarketChart({snapshot,selected}:{snapshot?:Snapshot;selected:string[]}) {
 const container=useRef<HTMLDivElement>(null),state=useRef<State|null>(null);
 const enabled=CHART_STUDIES.filter(s=>selected.includes(s.id));
 const panels=enabled.filter(s=>s.pane),height=340+panels.length*85;
 const signature=selected.slice().sort().join(',');
 useEffect(()=>{
  if(!container.current)return;
  const chart=createChart(container.current,{autoSize:true,height,layout:{background:{type:ColorType.Solid,color:'#211b17'},textColor:'#a99b8e',fontFamily:'ui-monospace, monospace',fontSize:11,panes:{separatorColor:'#3a3028',separatorHoverColor:'#5b4839'},attributionLogo:true},grid:{vertLines:{color:'#2c241f'},horzLines:{color:'#2c241f'}},rightPriceScale:{borderColor:'#3a3028',minimumWidth:80},timeScale:{borderColor:'#3a3028',timeVisible:true,rightOffset:8,barSpacing:7},crosshair:{mode:0}});
  const candle=chart.addSeries(CandlestickSeries,{upColor:'#b4c1a3',downColor:'#bd8068',borderVisible:false,wickUpColor:'#b4c1a3',wickDownColor:'#bd8068'});
  const s:State={chart,candle,lines:[],last:0};let pane=0,colorIndex=0;
  for(const study of CHART_STUDIES.filter(x=>selected.includes(x.id))){
   const paneIndex=study.pane?++pane:0;
   if(study.id==='volume')s.volume=chart.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false},paneIndex);
   for(const key of study.core??[]){const series=chart.addSeries(LineSeries,{color:COLORS[colorIndex++%COLORS.length],lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:key},paneIndex);s.lines.push({series,value:p=>p.indicators[key]});if(key==='rsi')for(const price of [30,70])series.createPriceLine({price,color:'#8b7963',lineStyle:2,lineWidth:1,axisLabelVisible:false});}
   for(const key of study.advanced??[]){const series=chart.addSeries(LineSeries,{color:COLORS[colorIndex++%COLORS.length],lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:key},paneIndex);s.lines.push({series,value:p=>p.advanced[key]});}
   if(study.id==='macd')s.histogram=chart.addSeries(HistogramSeries,{priceLineVisible:false,lastValueVisible:false},paneIndex);
   if(study.id==='markers')s.markers=createSeriesMarkers(candle);
  }
  chart.panes().forEach((p,i)=>p.setHeight(i?85:315));
  const applyTheme=()=>{const css=getComputedStyle(document.documentElement);const light=['light','sand'].includes(document.documentElement.dataset.theme??'light');candle.applyOptions({upColor:light?'#42775c':'#b4c1a3',downColor:light?'#b36043':'#bd8068',wickUpColor:light?'#42775c':'#b4c1a3',wickDownColor:light?'#b36043':'#bd8068'});s.lines.forEach((line,i)=>line.series.applyOptions({color:(light?['#8c623d','#467568','#826299','#b05a40','#85792e']:COLORS)[i%5]}));chart.applyOptions({layout:{background:{type:ColorType.Solid,color:css.getPropertyValue('--card').trim()},textColor:css.getPropertyValue('--dim').trim()},grid:{vertLines:{color:css.getPropertyValue('--border').trim()},horzLines:{color:css.getPropertyValue('--border').trim()}}});};
  applyTheme();window.addEventListener('bur-theme',applyTheme);state.current=s;
  return()=>{window.removeEventListener('bur-theme',applyTheme);chart.remove();state.current=null;};
 },[snapshot?.symbol,snapshot?.interval,snapshot?.mode,snapshot?.source,signature,height]);
 useEffect(()=>{
  const s=state.current;if(!s||!snapshot?.points.length)return;
  for(const point of snapshot.points.filter(p=>p.bar.time>s.last)){
   const time=point.bar.time as UTCTimestamp;s.candle.update({...point.bar,time});s.volume?.update({time,value:point.bar.volume,color:point.bar.close>=point.bar.open?'#8a9b7888':'#a66e5388'});
   for(const line of s.lines){const value=line.value(point);if(value!==null&&Number.isFinite(value))line.series.update({time,value});else line.series.update({time});}
   if(point.indicators.histogram!==null)s.histogram?.update({time,value:point.indicators.histogram,color:point.indicators.histogram>=0?'#9aa88799':'#b47b6199'});
  }
  if(!s.last)s.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,snapshot.points.length-100),to:snapshot.points.length+5});
  s.last=snapshot.points.at(-1)!.bar.time;
  if(snapshot.current&&snapshot.current.time>=s.last){const current=snapshot.current;s.candle.update({...current,time:current.time as UTCTimestamp});s.volume?.update({time:current.time as UTCTimestamp,value:current.volume,color:current.close>=current.open?'#8a9b7888':'#a66e5388'});}
  s.markers?.setMarkers(snapshot.signals.filter(x=>x.time>=snapshot.points[0].bar.time).map(x=>({time:x.time as UTCTimestamp,position:x.action==='BUY'?'belowBar':'aboveBar',color:x.action==='BUY'?'#cad8b5':'#d69b7f',shape:x.action==='BUY'?'arrowUp':'arrowDown',text:x.action})));
 },[snapshot,signature,height]);
 return <div className="chart-shell" style={{height}}><div ref={container} style={{height}} aria-label="Live candlesticks and selected technical studies"/>{panels.map((p,i)=><span key={p.id} className="pane-label" style={{top:320+i*85}}>{p.label.toUpperCase()}</span>)}{!snapshot?.points.length&&<div className="chart-loading">{snapshot?.status==='error'?'Market data unavailable — choose another source or reconnect':'Connecting to the analysis engine…'}</div>}</div>;
}
