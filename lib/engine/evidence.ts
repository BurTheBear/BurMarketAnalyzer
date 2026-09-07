import type { Point, Signal, Snapshot } from './pipeline';
import { STRATEGY } from './signals';
import { botEligibility, type BotParameters } from './bot-policy';
export interface DecisionEvidence {
 version: 'Bur Confluence v2'; generatedAt:number; source:string; symbol:string; interval:string;
 candle:Point['bar']; indicators:Point['indicators']; advanced:Point['advanced']; signal:Signal;
 factors:{name:string;reading:string;rule:string;value:number;weight:number;contribution:number}[];
 parameters:BotParameters; eligibility:{allowed:boolean;reason:string};
 history?:{count:number;firstTime:number;lastTime:number;sha256:string};
}
const n=(x:number|null|undefined)=>x==null?'unavailable':Number(x.toFixed(6)).toString();
/** Evidence is built from the exact committed point used for the score, never the changing live candle. */
export function decisionEvidence(snapshot:Snapshot,parameters:BotParameters):DecisionEvidence|null {
 const point=snapshot.points.at(-1),signal=snapshot.signal;if(!point||!signal||point.bar.time!==signal.time)return null;
 const i=point.indicators,a=point.advanced,b=point.bar;
 const readings:Record<string,[string,string]>={
  'Trend alignment':[`Close ${n(b.close)} · EMA 9 ${n(i.ema9)} · EMA 21 ${n(i.ema21)} · EMA 50 ${n(i.ema50)} · EMA 200 ${n(i.ema200)}`,'Average of signs: EMA9−EMA21, EMA21−EMA50, close−EMA200.'],
  'MACD momentum':[`MACD ${n(i.macd)} · signal ${n(i.signal)} · histogram ${n(i.histogram)} · ATR ${n(i.atr)}`,'Histogram ÷ (0.15 × ATR), clipped to −1…+1.'],
  'RSI balance':[`RSI 14 ${n(i.rsi)}`,'Above 70: −0.6. Below 30: +0.6. Otherwise (RSI−50)÷20, clipped.'],
  'Band position':[`Close ${n(b.close)} · upper ${n(i.bbUpper)} · middle ${n(i.bbMiddle)} · lower ${n(i.bbLower)} · ATR ${n(i.atr)}`,'(Close−middle) ÷ max(ATR, half band width), clipped.'],
  'Volume flow':[`CMF 20 ${n(a.cmf)} · candle volume ${n(b.volume)}`,'Chaikin money flow × 4, clipped.'],
  'Trend strength':[`ADX ${n(a.adx)} · +DI ${n(a.plusDI)} · −DI ${n(a.minusDI)}`,'Sign(+DI−−DI) × clamp((ADX−15)÷25, 0, 1).'],
  'VWAP position':[`Close ${n(b.close)} · UTC VWAP ${n(a.vwap)} · ATR ${n(i.atr)}`,'(Close−VWAP) ÷ (3 × ATR), clipped.'],
  'Candle patterns':[a.patterns.length?a.patterns.map(p=>`${p.name}: ${p.bias}, strength ${p.strength}`).join(' · '):'No recognized patterns on this candle.','Sum bullish strengths minus bearish strengths, clipped. Neutral patterns contribute zero.'],
 };
 return {version:'Bur Confluence v2',generatedAt:Date.now(),source:snapshot.source??'binance',symbol:snapshot.symbol,interval:snapshot.interval,candle:{...b},indicators:{...i},advanced:structuredClone(a),signal:structuredClone(signal),parameters:{...parameters},eligibility:botEligibility(signal,parameters),factors:signal.factors.map(f=>({ ...f, reading:readings[f.name]?.[0]??'Unavailable',rule:readings[f.name]?.[1]??'',contribution:f.value*f.weight }))};
}
export const decisionRule=`BUY at +${STRATEGY.threshold} or above; SELL at −${STRATEGY.threshold} or below; otherwise HOLD.`;
