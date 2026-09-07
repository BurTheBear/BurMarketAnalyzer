/** Real provider prices, simulated execution only. Run explicitly against a local development server. */
import assert from 'node:assert/strict';
const origin='http://localhost:3000',user=`verification-${crypto.randomUUID()}`;
async function call(body?:unknown,options:{origin?:string;user?:string}={}){const response=await fetch(origin+'/api/trading',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:options.origin??origin,'oai-authenticated-user-id':options.user??user},body:body?JSON.stringify(body):undefined});const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data={error:text};}return {ok:response.ok,data};}
const before=await call();assert.ok(before.ok);
const wrongOrigin=await call({action:'halt',halted:true},{origin:'https://evil.invalid'});assert.equal(wrongOrigin.ok,false);
const propose=()=>call({action:'propose',symbol:'BTCUSDT',interval:'1m',side:'BUY',quantity:.001,target:'paper'});
const p=await propose();assert.ok(p.ok,JSON.stringify(p.data));assert.equal(p.data.status,'PENDING');
const unapproved=await call({action:'approve',id:p.data.id,approved:false});assert.equal(unapproved.ok,false);
const first=await call({action:'approve',id:p.data.id,approved:true});assert.ok(first.ok,JSON.stringify(first.data));assert.equal(first.data.status,'FILLED');
const after=await call();const duplicate=await call({action:'approve',id:p.data.id,approved:true});assert.ok(duplicate.ok);const afterDuplicate=await call();assert.deepEqual(after.data.account,afterDuplicate.data.account);

await call({action:'halt',halted:true});assert.equal((await propose()).ok,false);await call({action:'halt',halted:false});
const p2=await propose();assert.ok(p2.ok,JSON.stringify(p2.data));await call({action:'cancel',id:p2.data.id});const cancelled=await call({action:'approve',id:p2.data.id,approved:true});assert.equal(cancelled.data.status,'CANCELLED');
const p3=await propose();assert.ok(p3.ok,JSON.stringify(p3.data));const results=await Promise.all([call({action:'approve',id:p3.data.id,approved:true}),call({action:'approve',id:p3.data.id,approved:true})]);assert.ok(results.some(r=>r.ok));const final=await call();assert.equal(final.data.account.positions.BTCUSDT.quantity,(before.data.account.positions.BTCUSDT?.quantity??0)+200000);assert.equal(final.data.orders.filter((o:any)=>o.status==='FILLED').length,before.data.orders.filter((o:any)=>o.status==='FILLED').length+2);
console.log('PASS: live-priced paper fills, explicit consent, duplicate/concurrent approval, cancellation, pause, origin checks.');
