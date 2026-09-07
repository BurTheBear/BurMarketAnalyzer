import { parseSubscription } from '@/lib/market/types';
import { validBotParameters } from '@/lib/engine/bot-policy';
import { verifyBinance } from '@/lib/engine/verify';
import { news, newsGate } from '@/lib/news/feed';
import { liveBook } from '@/lib/trading/exchange';
/** Public market analysis only. No account access, proposals, or trading side effects. */
export async function GET(request:Request){
 try{
  const url=new URL(request.url),r=parseSubscription(url.searchParams.get('symbol'),url.searchParams.get('interval'));
  const parameters={minimumReliability:Number(url.searchParams.get('minimumReliability')??60),minimumSamples:Number(url.searchParams.get('minimumSamples')??30)};
  if(!validBotParameters(parameters))throw new Error('Invalid bot parameters');
  const [analysis,coverage,depth]=await Promise.all([verifyBinance(r,parameters),news().then(n=>({gate:newsGate(n,r.symbol),fetchedAt:n.fetchedAt})).catch(()=>({gate:{allowed:false,reason:'News unavailable'},fetchedAt:0})),liveBook(r.symbol).then(b=>({available:true,receivedAt:b.time,bid:b.bids[0]?.[0]??null,ask:b.asks[0]?.[0]??null})).catch(()=>({available:false,receivedAt:0,bid:null,ask:null}))]);
  return Response.json({...analysis,news:coverage,book:depth,verifiedAt:Date.now(),sourceUrl:`https://data-api.binance.vision/api/v3/klines?symbol=${r.symbol}&interval=${r.interval}&limit=1000`,scope:'Fresh Binance data, same disclosed calculation. This is not independent proof of prediction accuracy; no trade was created.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Verification unavailable'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
