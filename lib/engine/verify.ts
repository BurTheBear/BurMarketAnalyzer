import { BinanceConnector } from '../market/binance';
import { INTERVALS, type Subscription } from '../market/types';
import { Pipeline } from './pipeline';
import { decisionEvidence } from './evidence';
import type { BotParameters } from './bot-policy';
/** An independent data fetch using the same disclosed algorithm. It does not validate profitability. */
export async function verifyBinance(request:Subscription,parameters:BotParameters){
 const bars=(await new BinanceConnector().history(request)).filter(b=>b.closed);
 const pipeline=new Pipeline(request,'live');bars.forEach(bar=>pipeline.push(bar));
 const snapshot=pipeline.snapshot();snapshot.source='binance';
 const evidence=decisionEvidence(snapshot,parameters);if(!evidence)throw new Error('Not enough completed Binance history to calculate a decision.');
 for(let j=1;j<bars.length;j++)if(bars[j].time-bars[j-1].time!==INTERVALS[request.interval])throw new Error('Binance history contains a gap. No verified decision is available.');
 if(Date.now()/1000-evidence.candle.time>INTERVALS[request.interval]*2+15)throw new Error('Binance completed-candle history is stale.');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(bars)));
 evidence.history={count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1)!.time,sha256:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')};
 return {evidence,bars};
}
