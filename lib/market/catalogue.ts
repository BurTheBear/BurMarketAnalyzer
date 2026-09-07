import { publicData, type Filter } from '../trading/exchange';
import type { Symbol } from './types';
export interface ListedMarket {symbol:Symbol;baseAsset:string;quoteAsset:'USDT';stepSize:number;minNotional:number}
let cached:{markets:ListedMarket[];updatedAt:number}|null=null;let pending:Promise<{markets:ListedMarket[];updatedAt:number}>|null=null;
export async function marketCatalogue(){
 if(cached&&Date.now()-cached.updatedAt<600000)return cached;if(pending)return pending;
 pending=(async()=>{const result=await publicData<{symbols:{symbol:string;baseAsset:string;quoteAsset:string;status:string;isSpotTradingAllowed:boolean;filters:Filter[]}[]}>('/api/v3/exchangeInfo');
 const markets=result.symbols.filter(s=>s.status==='TRADING'&&s.isSpotTradingAllowed&&s.quoteAsset==='USDT'&&/^[A-Z0-9]{2,24}USDT$/.test(s.symbol)).map(s=>({symbol:s.symbol as Symbol,baseAsset:s.baseAsset,quoteAsset:'USDT' as const,stepSize:Math.max(...s.filters.filter(f=>f.filterType==='LOT_SIZE'||f.filterType==='MARKET_LOT_SIZE').map(f=>Number(f.stepSize)||0),1e-8),minNotional:Math.max(...s.filters.map(f=>Number(f.minNotional)||0))})).sort((a,b)=>a.baseAsset.localeCompare(b.baseAsset));
 cached={markets,updatedAt:Date.now()};return cached;})();try{return await pending;}finally{pending=null;}
}
