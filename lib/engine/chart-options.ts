import type { Indicators } from './indicators';
import type { Advanced } from './advanced';
type AdvancedNumber = Exclude<keyof Advanced, 'patterns' | 'supertrendBullish'>;
export interface ChartStudy { id:string; label:string; pane:boolean; core?: (keyof Indicators)[]; advanced?:AdvancedNumber[] }
export const CHART_STUDIES: ChartStudy[] = [
 ...([9,21,50,200] as const).map(n=>({id:`ema${n}`,label:`EMA ${n}`,pane:false,core:[`ema${n}` as keyof Indicators]})),
 {id:'bands',label:'Bollinger bands (20, 2)',pane:false,core:['bbUpper','bbMiddle','bbLower']},
 {id:'sma',label:'SMA 20 / 50 / 200',pane:false,advanced:['sma20','sma50','sma200']},
 {id:'wma',label:'WMA 20',pane:false,advanced:['wma20']}, {id:'vwma',label:'VWMA 20',pane:false,advanced:['vwma20']},
 {id:'vwap',label:'Session VWAP (UTC)',pane:false,advanced:['vwap']},
 {id:'keltner',label:'Keltner channel',pane:false,advanced:['keltnerUpper','keltnerLower']},
 {id:'donchian',label:'Donchian channel (20)',pane:false,advanced:['donchianHigh','donchianLow']},
 {id:'ichimoku',label:'Ichimoku (unshifted lines)',pane:false,advanced:['tenkan','kijun','senkouA','senkouB']},
 {id:'supertrend',label:'Supertrend (ATR 14 × 3)',pane:false,advanced:['supertrend']},
 {id:'pivots',label:'Previous UTC-day pivots',pane:false,advanced:['pivot','support1','resistance1']},
 {id:'fibonacci',label:'Fibonacci 38.2 / 61.8 (52 bars)',pane:false,advanced:['fibonacci382','fibonacci618']},
 {id:'volume',label:'Volume',pane:true}, {id:'rsi',label:'RSI 14',pane:true,core:['rsi']},
 {id:'macd',label:'MACD (12, 26, 9)',pane:true,core:['macd','signal']},
 {id:'atr',label:'ATR 14',pane:true,core:['atr']},
 {id:'stochastic',label:'Stochastic K / D',pane:true,advanced:['stochasticK','stochasticD']},
 {id:'stochrsi',label:'Stochastic RSI',pane:true,advanced:['stochRsi']},
 {id:'adx',label:'ADX / +DI / −DI',pane:true,advanced:['adx','plusDI','minusDI']},
 {id:'cci',label:'CCI 20',pane:true,advanced:['cci']},
 {id:'williams',label:'Williams %R',pane:true,advanced:['williamsR']},
 {id:'roc',label:'Rate of change (12)',pane:true,advanced:['roc']},
 {id:'momentum',label:'Momentum (10)',pane:true,advanced:['momentum']},
 {id:'obv',label:'On-balance volume',pane:true,advanced:['obv']},
 {id:'mfi',label:'Money flow index',pane:true,advanced:['mfi']},
 {id:'cmf',label:'Chaikin money flow',pane:true,advanced:['cmf']},
 {id:'volumez',label:'Volume Z-score',pane:true,advanced:['volumeZ']},
 {id:'volatility',label:'Historical volatility (20 bars)',pane:true,advanced:['historicalVolatility']},
 {id:'markers',label:'BUY / SELL markers',pane:false},
];
export const DEFAULT_CHART_STUDIES=['ema9','ema21','ema50','ema200','bands','volume','rsi','macd','markers'];
