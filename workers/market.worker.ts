import { YahooConnector, type Source } from '../lib/market/alternate';
import { WireEncoder } from '../lib/market/wire';
import { BinanceConnector } from '../lib/market/binance';
import { ReplayConnector } from '../lib/market/replay';
import { MarketSession } from '../lib/market/session';
import { SYMBOLS, type Interval, type Mode } from '../lib/market/types';
let sessions: MarketSession[] = [];
/** Indicator and calibration work stays off the UI thread. */
self.onmessage = (event: MessageEvent<{ source: Source; interval: Interval; origin: string }>) => {
  sessions.forEach(s => s.stop());
  const { source, interval, origin } = event.data; const mode:Mode=source==='replay'?'replay':'live';
  sessions = SYMBOLS.map(symbol => {const encoder=new WireEncoder();return new MarketSession(source==='yahoo'||source==='coinbase'?new YahooConnector(origin,source):mode === 'live' ? new BinanceConnector(origin, undefined, true,source==='binance-rest') : new ReplayConnector(), { symbol, interval }, mode, snapshot => self.postMessage(encoder.encode({...snapshot,source,quote:source==='yahoo'||source==='coinbase'?'USD':'USDT'})));});
  sessions.forEach(s => void s.start());
};
