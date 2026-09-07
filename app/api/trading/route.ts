import { identity } from '@/lib/trading/store';
import { tradingState, propose, approve, cancel, connectAccount, disconnect, setHalted, reconcile, exchangeAccount } from '@/lib/trading/service';
export async function GET(request:Request) {
 try {const user=identity(request), url=new URL(request.url); return Response.json(url.searchParams.get('exchange')==='true'?await exchangeAccount(user):await tradingState(user),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Trading service unavailable'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
export async function POST(request:Request) {
 try {
  const user=identity(request);if(Number(request.headers.get('content-length')??0)>8192)throw new Error('Request too large');
  const raw=await request.text();if(raw.length>8192)throw new Error('Request too large');const input=JSON.parse(raw);
  let result;
  switch(input.action){
   case 'propose': result=await propose(user,input);break;
   case 'approve': result=await approve(user,String(input.id),input.approved);break;
   case 'cancel': result=await cancel(user,String(input.id));break;
   case 'connect': result=await connectAccount(user,input);break;
   case 'disconnect': result=await disconnect(user);break;
   case 'halt': if(typeof input.halted!=='boolean')throw new Error('Invalid pause state');result=await setHalted(user,input.halted);break;
   case 'reconcile': result=await reconcile(user,String(input.id));break;
   default:throw new Error('Unknown trading action');
  }
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Trading request failed'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
