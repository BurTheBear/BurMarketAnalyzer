import { marketCatalogue } from '@/lib/market/catalogue';
export async function GET(){try{return Response.json(await marketCatalogue(),{headers:{'Cache-Control':'private, max-age=60'}});}catch{return Response.json({error:'Binance market list unavailable. The default markets remain available; retry shortly.'},{status:502});}}
