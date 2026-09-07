import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../lib/engine/pipeline';
import { decisionEvidence } from '../lib/engine/evidence';
import { DEFAULT_BOT_PARAMETERS } from '../lib/engine/bot-policy';
import { quoteCost, QUOTE,BASE } from '../lib/trading/paper';
import { parseSubscription } from '../lib/market/types';
test('decision evidence uses exact committed values and contributions; partial prices cannot rewrite it',()=>{
 const p=new Pipeline({symbol:'DOGEUSDT',interval:'1m'},'live');
 for(let j=0;j<260;j++){const open=.1+j*.0001;p.push({time:1700000040+j*60,open,high:open+.0004,low:open-.0002,close:open+.0001,volume:1000+j,closed:true});}
 const evidence=decisionEvidence(p.snapshot(),DEFAULT_BOT_PARAMETERS)!;
 assert.equal(evidence.symbol,'DOGEUSDT');assert.equal(evidence.factors.length,8);
 assert.ok(Math.abs(evidence.factors.reduce((n,f)=>n+f.contribution,0)-evidence.signal.score)<1e-9);
 assert.equal(evidence.indicators.ema9,p.snapshot().points.at(-1)!.indicators.ema9);
 const original=JSON.stringify(evidence);p.push({time:evidence.candle.time+60,open:.2,high:1,low:.1,close:.9,volume:99999,closed:false});
 assert.equal(decisionEvidence(p.snapshot(),DEFAULT_BOT_PARAMETERS)!.candle.time,evidence.candle.time);
 assert.equal(JSON.stringify(evidence),original);
});
test('micro-priced coin accounting preserves sub-micro-USDT unit prices',()=>{
 assert.equal(quoteCost(.00000012,1_000_000*BASE),.12*QUOTE);
 assert.equal(quoteCost(.00001234,1_000_000*BASE),12.34*QUOTE);
 assert.throws(()=>quoteCost(.1,Number.MAX_SAFE_INTEGER+1));
 assert.deepEqual(parseSubscription('DOGEUSDT','1m'),{symbol:'DOGEUSDT',interval:'1m'});
 assert.throws(()=>parseSubscription('../api/order','1m'));
});
