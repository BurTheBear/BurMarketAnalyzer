import { botEligibility, validBotParameters, DEFAULT_BOT_PARAMETERS, type BotParameters } from '../engine/bot-policy';
import { news, newsGate } from '../news/feed';
import { db } from './store';
import { vaultKey, vaultReady } from './vault';
import { initialAccount, applyFill, simulateFill, QUOTE, type PaperAccount } from './paper';
import { liveBook, seal, unseal, signed, validateQuantity, ExchangeError, type Credentials, type ExchangeAccount } from './exchange';
import { Pipeline } from '../engine/pipeline';
import { BinanceConnector } from '../market/binance';
import { parseSubscription, type Symbol } from '../market/types';
import type { Proposal, Target } from './types';
interface AccountRow { user_id: string; data: string; version: number; halted: number }
interface OrderRow { id: string; user_id: string; data: string; status: string; created_at: number; expires_at: number; target: Target }
async function accountRow(user: string): Promise<AccountRow> {
  await db().prepare('INSERT INTO accounts (user_id,data,version,halted) VALUES (?,?,0,0) ON CONFLICT(user_id) DO NOTHING').bind(user,JSON.stringify(initialAccount())).run();
  return (await db().prepare('SELECT * FROM accounts WHERE user_id=?').bind(user).first<AccountRow>())!;
}
async function credentials(user: string) {
  const row=await db().prepare('SELECT encrypted FROM connections WHERE user_id=?').bind(user).first<{encrypted:string}>();
  const key=await vaultKey();
  if (!row||!key) throw new Error('Connect your Binance account first'); return unseal(row.encrypted,key,user);
}
export async function tradingState(user: string) {
  const a=await accountRow(user), orders=await db().prepare('SELECT data,status FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user).all<{data:string;status:string}>();
  const connection=await db().prepare('SELECT updated_at FROM connections WHERE user_id=?').bind(user).first();
  return { account:JSON.parse(a.data) as PaperAccount, halted:!!a.halted, connected:!!connection, vaultReady:vaultReady(), orders:orders.results.map(r=>({...JSON.parse(r.data),status:r.status})) as Proposal[] };
}
export async function connectAccount(user:string, input: Credentials) {
  if (typeof input.apiKey!=='string'||typeof input.secret!=='string'||input.apiKey.length<20||input.secret.length<20||input.apiKey.length>256||input.secret.length>256) throw new Error('Enter a valid Binance API key and secret');
  const key=await vaultKey(); if(!key)throw new Error('The operator must configure the encrypted credential vault before connections are available');
  const account=await signed<ExchangeAccount>(input,'GET','/api/v3/account'); if(!account.canTrade)throw new Error('This API key does not permit spot trading');
  await db().prepare('INSERT INTO connections (user_id,encrypted,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted=excluded.encrypted,updated_at=excluded.updated_at').bind(user,await seal(input,key,user),Date.now()).run();
  return { connected:true };
}
export async function disconnect(user:string) {
 await db().batch([db().prepare('DELETE FROM connections WHERE user_id=?').bind(user),db().prepare("UPDATE orders SET status='CANCELLED' WHERE user_id=? AND target='binance' AND status='PENDING'").bind(user)]); return {connected:false};
}
export async function setHalted(user:string,halted:boolean) {
 await accountRow(user);
 await db().batch([db().prepare('UPDATE accounts SET halted=? WHERE user_id=?').bind(halted?1:0,user),...(halted?[db().prepare("UPDATE orders SET status='CANCELLED' WHERE user_id=? AND status='PENDING'").bind(user)]:[])]);return {halted};
}
async function checkLimits(user:string,target:Target) {
 const account=await accountRow(user);if(account.halted)throw new Error('Trading is paused. Resume trading before reviewing an order.');
 if(target==='binance'){
  await credentials(user);
  const unresolved=await db().prepare("SELECT id FROM orders WHERE user_id=? AND target='binance' AND status IN ('SUBMITTING','UNKNOWN','OPEN') LIMIT 1").bind(user).first();if(unresolved)throw new Error('Reconcile the unresolved Binance order before placing another.');
 }
 await db().prepare("UPDATE orders SET status='EXPIRED' WHERE user_id=? AND status='PENDING' AND expires_at<=?").bind(user,Date.now()).run();
 const count=await db().prepare("SELECT COUNT(*) as n FROM orders WHERE user_id=? AND created_at>? AND status NOT IN ('CANCELLED','EXPIRED','REJECTED')").bind(user,Date.now()-86400000).first<{n:number}>();
 if((count?.n??0)>=100)throw new Error('Daily limit of 100 reviewed orders reached.');
 return account;
}
export async function propose(user:string,input:{symbol:string;interval:string;side:string;quantity:number;target:string;bot?:boolean;parameters?:BotParameters}) {
 const r=parseSubscription(input.symbol,input.interval);if(input.target!=='paper'&&input.target!=='binance')throw new Error('Invalid trading destination');
 const target=input.target as Target;
 if(input.side!=='BUY'&&input.side!=='SELL')throw new Error('Invalid order side');
 if(!Number.isFinite(input.quantity)||input.quantity<=0||input.quantity>100000)throw new Error('Invalid quantity');
 const a=await checkLimits(user,target);let side=input.side as 'BUY'|'SELL',reason='Manual spot market order',estimate;
 if(input.bot){
  const gate=newsGate(await news(),r.symbol);if(!gate.allowed)throw new Error(gate.reason);
  const bars=await new BinanceConnector().history(r);const p=new Pipeline(r,'live');bars.filter(b=>b.closed).forEach(b=>p.push(b));const s=p.snapshot().signal;
  if(!s||s.action==='HOLD')throw new Error('The bot is holding. No trade is proposed until the factors align.');
  const parameters=input.parameters??DEFAULT_BOT_PARAMETERS;if(!validBotParameters(parameters))throw new Error('Invalid bot parameters');const eligibility=botEligibility(s,parameters);if(!eligibility.allowed)throw new Error(eligibility.reason);
  side=s.action;estimate=s.estimate;reason=`Bur Confluence v2: ${s.score.toFixed(1)} score on the last completed ${r.interval} candle.`;
 }
 const book=await liveBook(r.symbol),fill=simulateFill(book,side,input.quantity);
 if(fill.cost/QUOTE>1000)throw new Error('Maximum order size is 1,000 USDT. Reduce the quantity.');
 await validateQuantity(r.symbol,input.quantity,fill.price);
 if(target==='paper')applyFill(JSON.parse(a.data),r.symbol,side,fill);
 const id=`bur${crypto.randomUUID().replaceAll('-','')}`;
 const proposal:Proposal={id,symbol:r.symbol,side,quantity:input.quantity,target,referencePrice:fill.price,estimatedNotional:fill.cost/QUOTE,estimatedFee:fill.fee/QUOTE,maxSlippage:.005,expiresAt:Date.now()+30000,bot:!!input.bot,reason,estimate,status:'PENDING'};
 // One outstanding proposal per user; old approvals cannot later execute unexpectedly.
 await db().batch([db().prepare("UPDATE orders SET status='CANCELLED' WHERE user_id=? AND status='PENDING'").bind(user),db().prepare('INSERT INTO orders (id,user_id,target,status,data,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id,user,target,'PENDING',JSON.stringify(proposal),Date.now(),proposal.expiresAt)]);
 return proposal;
}
async function order(user:string,id:string){const o=await db().prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(id,user).first<OrderRow>();if(!o)throw new Error('Order not found');return o;}
export async function cancel(user:string,id:string){await db().prepare("UPDATE orders SET status='CANCELLED' WHERE id=? AND user_id=? AND status='PENDING'").bind(id,user).run();return {cancelled:true};}
export async function approve(user:string,id:string,approved:boolean){
 if(approved!==true)throw new Error('Explicit order approval is required');
 const row=await order(user,id),p=JSON.parse(row.data) as Proposal;
 if(row.status!=='PENDING')return {...p,status:row.status};
 if(Date.now()>row.expires_at){await db().prepare("UPDATE orders SET status='EXPIRED' WHERE id=? AND user_id=?").bind(id,user).run();throw new Error('Quote expired. Request a new order review.');}
 if(p.bot){const gate=newsGate(await news(),p.symbol);if(!gate.allowed)throw new Error(gate.reason);}
 const a=await checkLimits(user,p.target),book=await liveBook(p.symbol),fill=simulateFill(book,p.side,p.quantity);
 if(Math.abs(fill.price/p.referencePrice-1)>p.maxSlippage)throw new Error('Market moved more than 0.5%. Request a new review.');
 if(fill.cost/QUOTE>1000)throw new Error('Order now exceeds the 1,000 USDT cap.');
 await validateQuantity(p.symbol,p.quantity,fill.price);
 if(p.target==='paper'){
  const next=applyFill(JSON.parse(a.data),p.symbol,p.side,fill),result={...p,status:'FILLED',fill:{price:fill.price,quantity:p.quantity,fee:fill.fee/QUOTE}};
  // D1 batch is transactional. CAS + last_order gates the ledger update and receipt against concurrent approvals.
  const r=await db().batch([
   db().prepare("UPDATE accounts SET data=?,version=version+1,last_order=? WHERE user_id=? AND version=? AND halted=0 AND EXISTS (SELECT 1 FROM orders WHERE id=? AND user_id=? AND status='PENDING' AND expires_at>?)").bind(JSON.stringify(next),id,user,a.version,id,user,Date.now()),
   db().prepare("UPDATE orders SET status='FILLED',data=? WHERE id=? AND user_id=? AND status='PENDING' AND EXISTS (SELECT 1 FROM accounts WHERE user_id=? AND last_order=?)").bind(JSON.stringify(result),id,user,user,id)
  ]);
  if(!r[0].meta.changes)throw new Error('Account changed or order expired. Refresh and review again.');return result;
 }
 const c=await credentials(user);
 // Atomically claim a live proposal before any external side effect. Approval is never retried automatically.
 const claim=await db().prepare("UPDATE orders SET status='SUBMITTING' WHERE id=? AND user_id=? AND status='PENDING' AND expires_at>? AND EXISTS (SELECT 1 FROM accounts WHERE user_id=? AND halted=0) AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id=? AND target='binance' AND status IN ('SUBMITTING','UNKNOWN','OPEN'))").bind(id,user,Date.now(),user,user).run();
 if(!claim.meta.changes)throw new Error('Approval was already processed, expired, or trading is paused.');
 try{
  const exchange=await signed(c,'POST','/api/v3/order',{symbol:p.symbol,side:p.side,type:'MARKET',quantity:p.quantity.toFixed(8).replace(/0+$/,'').replace(/\.$/,''),newClientOrderId:id,newOrderRespType:'FULL'});
  const result={...p,status:exchange.status==='FILLED'?'FILLED':'OPEN',exchange};
  await db().prepare('UPDATE orders SET status=?,data=? WHERE id=? AND user_id=?').bind(result.status,JSON.stringify(result),id,user).run();return result;
 }catch(error){
  const uncertain=!(error instanceof ExchangeError)||error.uncertain,status=uncertain?'UNKNOWN':'REJECTED';
  await db().prepare('UPDATE orders SET status=?,data=? WHERE id=? AND user_id=?').bind(status,JSON.stringify({...p,status,error:error instanceof Error?error.message:'Unknown exchange response'}),id,user).run();throw error;
 }
}
export async function reconcile(user:string,id:string){const row=await order(user,id),p=JSON.parse(row.data) as Proposal;if(p.target!=='binance')throw new Error('Only Binance orders require reconciliation');const exchange=await signed(await credentials(user),'GET','/api/v3/order',{symbol:p.symbol,origClientOrderId:id});const result={...p,exchange,status:exchange.status==='FILLED'?'FILLED': ['CANCELED','EXPIRED','REJECTED'].includes(exchange.status)?exchange.status:'OPEN'};await db().prepare('UPDATE orders SET status=?,data=? WHERE id=? AND user_id=?').bind(result.status,JSON.stringify(result),id,user).run();return result;}
export async function exchangeAccount(user:string){const a=await signed<ExchangeAccount>(await credentials(user),'GET','/api/v3/account');return {canTrade:a.canTrade,balances:a.balances.filter((b:{free:string;locked:string})=>+b.free>0||+b.locked>0)};}
