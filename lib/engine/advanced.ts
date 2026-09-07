import type { Bar } from '../market/types';
import type { Indicators } from './indicators';
export interface Pattern { name:string; bias:'bullish'|'bearish'|'neutral'; strength:number }
export interface Advanced {
 sma20:number|null;sma50:number|null;sma200:number|null;wma20:number|null;vwma20:number|null;
 stochasticK:number|null;stochasticD:number|null;stochRsi:number|null;cci:number|null;williamsR:number|null;roc:number|null;momentum:number|null;
 plusDI:number|null;minusDI:number|null;adx:number|null;vwap:number|null;obv:number;mfi:number|null;cmf:number|null;volumeZ:number|null;
 keltnerUpper:number|null;keltnerLower:number|null;donchianHigh:number|null;donchianLow:number|null;historicalVolatility:number|null;
 tenkan:number|null;kijun:number|null;senkouA:number|null;senkouB:number|null;supertrend:number|null;supertrendBullish:boolean|null;
 pivot:number|null;support1:number|null;resistance1:number|null;fibonacci382:number|null;fibonacci618:number|null;patterns:Pattern[];
}
const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/a.length;
const high=(a:Bar[])=>Math.max(...a.map(b=>b.high)),low=(a:Bar[])=>Math.min(...a.map(b=>b.low));
/** Pattern recognition uses completed candles only; a pattern is evidence, never an order by itself. */
export function patterns(bars:Bar[]):Pattern[]{
 const b=bars.at(-1);if(!b)return [];const p=bars.at(-2),q=bars.at(-3),range=b.high-b.low;if(!range)return [];
 const body=Math.abs(b.close-b.open),upper=b.high-Math.max(b.open,b.close),lower=Math.min(b.open,b.close)-b.low,out:Pattern[]=[];
 const prior=bars.slice(-7,-1),trend=prior.length>1?prior.at(-1)!.close-prior[0].close:0;
 if(body<=range*.1)out.push({name:'Doji',bias:'neutral',strength:.2});
 if(body>range*.05&&lower>=2*body&&upper<=body&&trend<0)out.push({name:'Hammer',bias:'bullish',strength:.5});
 if(body>range*.05&&upper>=2*body&&lower<=body&&trend>0)out.push({name:'Shooting star',bias:'bearish',strength:.5});
 if(body>=range*.9)out.push({name:'Marubozu',bias:b.close>b.open?'bullish':'bearish',strength:.5});
 if(p){
  if(p.close<p.open&&b.close>b.open&&b.open<=p.close&&b.close>=p.open)out.push({name:'Bullish engulfing',bias:'bullish',strength:.7});
  if(p.close>p.open&&b.close<b.open&&b.open>=p.close&&b.close<=p.open)out.push({name:'Bearish engulfing',bias:'bearish',strength:.7});
  if(b.high<p.high&&b.low>p.low)out.push({name:'Inside bar',bias:'neutral',strength:.2});
  if(b.high>p.high&&b.low<p.low)out.push({name:'Outside bar',bias:b.close>b.open?'bullish':'bearish',strength:.3});
  if(Math.max(b.open,b.close)<Math.max(p.open,p.close)&&Math.min(b.open,b.close)>Math.min(p.open,p.close))out.push({name:'Harami',bias:b.close>b.open?'bullish':'bearish',strength:.35});
 }
 if(p&&q){
  if(q.close<q.open&&Math.abs(p.close-p.open)<Math.abs(q.close-q.open)*.35&&b.close>b.open&&b.close>(q.open+q.close)/2)out.push({name:'Morning star (gapless)',bias:'bullish',strength:.65});
  if(q.close>q.open&&Math.abs(p.close-p.open)<Math.abs(q.close-q.open)*.35&&b.close<b.open&&b.close<(q.open+q.close)/2)out.push({name:'Evening star (gapless)',bias:'bearish',strength:.65});
  if([q,p,b].every(x=>x.close>x.open)&&b.close>p.close&&p.close>q.close&&p.open>q.open&&p.open<q.close&&b.open>p.open&&b.open<p.close)out.push({name:'Three white soldiers',bias:'bullish',strength:.7});
  if([q,p,b].every(x=>x.close<x.open)&&b.close<p.close&&p.close<q.close&&p.open<q.open&&p.open>q.close&&b.open<p.open&&b.open>p.close)out.push({name:'Three black crows',bias:'bearish',strength:.7});
 }
 return out;
}
class Smooth {private n=0;private sum=0;private value:number|null=null;push(x:number){if(this.value===null){this.sum+=x;if(++this.n===14)this.value=this.sum/14;}else this.value+=(x-this.value)/14;return this.value;}}
/** Bounded windows cap per-bar work; recursive volume/trend measures retain constant state. */
export class AdvancedEngine {
 private bars:Bar[]=[];private rsi:number[]=[];private k:number[]=[];private positiveDM=new Smooth();private negativeDM=new Smooth();private tr=new Smooth();private adx=new Smooth();private obv=0;
 private completeDay=false;private day=-1;private pv=0;private volume=0;private dayHigh=0;private dayLow=Infinity;private dayClose=0;private previousDay:{high:number;low:number;close:number}|null=null;
 private upper:number|null=null;private lower:number|null=null;private bull=true;
 push(bar:Bar,i:Indicators):Advanced{
  const previous=this.bars.at(-1);this.bars.push(bar);if(this.bars.length>201)this.bars.shift();
  const day=Math.floor(bar.time/86400);if(day!==this.day){if(this.day>=0&&this.completeDay)this.previousDay={high:this.dayHigh,low:this.dayLow,close:this.dayClose};this.completeDay=bar.time===day*86400;this.day=day;this.pv=0;this.volume=0;this.dayHigh=bar.high;this.dayLow=bar.low;}
  this.dayHigh=Math.max(this.dayHigh,bar.high);this.dayLow=Math.min(this.dayLow,bar.low);this.dayClose=bar.close;
  const typical=(bar.high+bar.low+bar.close)/3;this.pv+=typical*bar.volume;this.volume+=bar.volume;
  if(previous)this.obv+=Math.sign(bar.close-previous.close)*bar.volume;
  const window=(n:number)=>this.bars.length>=n?this.bars.slice(-n):null;
  const w20=window(20),w14=window(14),w26=window(26),w52=window(52),w9=window(9);
  const sma=(n:number)=>{const w=window(n);return w?mean(w.map(b=>b.close)):null;};
  const sma20=sma(20),sma50=sma(50),sma200=sma(200);
  const stochasticK=w14?(high(w14)===low(w14)?50:100*(bar.close-low(w14))/(high(w14)-low(w14))):null;
  if(stochasticK!==null){this.k.push(stochasticK);if(this.k.length>3)this.k.shift();}
  if(i.rsi!==null){this.rsi.push(i.rsi);if(this.rsi.length>14)this.rsi.shift();}
  const maxRSI=Math.max(...this.rsi),minRSI=Math.min(...this.rsi);
  let plusDI=null,minusDI=null,adx=null;
  if(previous){const up=bar.high-previous.high,down=previous.low-bar.low,plus=this.positiveDM.push(up>down&&up>0?up:0),minus=this.negativeDM.push(down>up&&down>0?down:0),tr=this.tr.push(Math.max(bar.high-bar.low,Math.abs(bar.high-previous.close),Math.abs(bar.low-previous.close)));if(plus!==null&&minus!==null&&tr!==null){plusDI=tr?100*plus/tr:0;minusDI=tr?100*minus/tr:0;adx=this.adx.push(plusDI+minusDI?100*Math.abs(plusDI-minusDI)/(plusDI+minusDI):0);}}
  let cci=null,cmf=null,volumeZ=null,historicalVolatility=null,vwma20=null;
  if(w20){const t=w20.map(b=>(b.high+b.low+b.close)/3),avg=mean(t),deviation=mean(t.map(x=>Math.abs(x-avg)));cci=deviation?(typical-avg)/(.015*deviation):0;const vol=w20.reduce((s,b)=>s+b.volume,0);cmf=vol?w20.reduce((s,b)=>s+(b.high===b.low?0:(2*b.close-b.high-b.low)/(b.high-b.low))*b.volume,0)/vol:0;vwma20=vol?w20.reduce((s,b)=>s+b.close*b.volume,0)/vol:null;const v=w20.map(b=>b.volume),mv=mean(v),sd=Math.sqrt(mean(v.map(x=>(x-mv)**2)));volumeZ=sd?(bar.volume-mv)/sd:0;}
  const w21=window(21);if(w21){const r=w21.slice(1).map((b,n)=>Math.log(b.close/w21[n].close)),m=mean(r);historicalVolatility=100*Math.sqrt(mean(r.map(x=>(x-m)**2)));}
  let mfi=null;const w15=window(15);if(w15){let pos=0,neg=0;for(let n=1;n<w15.length;n++){const x=w15[n],p=w15[n-1],t=(x.high+x.low+x.close)/3,pt=(p.high+p.low+p.close)/3;if(t>pt)pos+=t*x.volume;else if(t<pt)neg+=t*x.volume;}mfi=!pos&&!neg?50:!neg?100:100-100/(1+pos/neg);}
  if(i.atr!==null){const upper=(bar.high+bar.low)/2+3*i.atr,lower=(bar.high+bar.low)/2-3*i.atr;const oldUpper=this.upper,oldLower=this.lower;this.upper=oldUpper===null||upper<oldUpper||(previous&&previous.close>oldUpper)?upper:oldUpper;this.lower=oldLower===null||lower>oldLower||(previous&&previous.close<oldLower)?lower:oldLower;if(this.bull&&bar.close<this.lower)this.bull=false;else if(!this.bull&&bar.close>this.upper)this.bull=true;}
  const midpoint=(w:Bar[]|null)=>w?(high(w)+low(w))/2:null,tenkan=midpoint(w9),kijun=midpoint(w26);
  const pivot=this.previousDay?(this.previousDay.high+this.previousDay.low+this.previousDay.close)/3:null;
  return {sma20,sma50,sma200,wma20:w20?w20.reduce((s,b,n)=>s+b.close*(n+1),0)/210:null,vwma20,stochasticK,stochasticD:this.k.length===3?mean(this.k):null,stochRsi:this.rsi.length===14?(maxRSI===minRSI?50:100*(i.rsi!-minRSI)/(maxRSI-minRSI)):null,cci,williamsR:stochasticK===null?null:stochasticK-100,roc:this.bars.length>=13?100*(bar.close/this.bars.at(-13)!.close-1):null,momentum:this.bars.length>=11?bar.close-this.bars.at(-11)!.close:null,plusDI,minusDI,adx,vwap:this.volume?this.pv/this.volume:null,obv:this.obv,mfi,cmf,volumeZ,keltnerUpper:i.ema21!==null&&i.atr!==null?i.ema21+2*i.atr:null,keltnerLower:i.ema21!==null&&i.atr!==null?i.ema21-2*i.atr:null,donchianHigh:w20?high(w20):null,donchianLow:w20?low(w20):null,historicalVolatility,tenkan,kijun,senkouA:tenkan!==null&&kijun!==null?(tenkan+kijun)/2:null,senkouB:midpoint(w52),supertrend:this.upper!==null?(this.bull?this.lower:this.upper):null,supertrendBullish:this.upper!==null?this.bull:null,pivot,support1:pivot!==null?2*pivot-this.previousDay!.high:null,resistance1:pivot!==null?2*pivot-this.previousDay!.low:null,fibonacci382:w52?high(w52)-(high(w52)-low(w52))*.382:null,fibonacci618:w52?high(w52)-(high(w52)-low(w52))*.618:null,patterns:patterns(this.bars)};
 }
}
