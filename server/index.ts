/** Optional dedicated market fanout service. The hosted app uses the same pipeline in a browser worker. */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { MarketSession } from '../lib/market/session';
import { BinanceConnector } from '../lib/market/binance';
import { ReplayConnector } from '../lib/market/replay';
import { parseSubscription, type Mode } from '../lib/market/types';
import type { Snapshot } from '../lib/engine/pipeline';
import { WireEncoder } from '../lib/market/wire';
const port=Number(process.env.MARKET_PORT??8080),host=process.env.MARKET_HOST??'127.0.0.1';
const origins=new Set((process.env.MARKET_ALLOWED_ORIGINS??'http://localhost:3000').split(','));
const sessions=new Map<string,{session:MarketSession;clients:Map<WebSocket,WireEncoder>;last?:Snapshot}>();
const server=createServer((request,response)=>{response.setHeader('Content-Type','application/json');response.setHeader('X-Content-Type-Options','nosniff');if(request.url==='/healthz'){response.writeHead(200);response.end(JSON.stringify({status:'ok',sessions:sessions.size,clients:wss.clients.size}));}else{response.writeHead(404);response.end('{"error":"Not found"}');}});
const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false,clientTracking:true});
server.on('upgrade',(request,socket,head)=>{
 try{
  if(!request.headers.origin||!origins.has(request.headers.origin)||wss.clients.size>=100)throw new Error('Denied');
  const url=new URL(request.url??'','http://localhost');if(url.pathname!=='/stream')throw new Error('Not found');
  const r=parseSubscription(url.searchParams.get('symbol'),url.searchParams.get('interval')),mode=url.searchParams.get('mode')??'live';if(mode!=='live'&&mode!=='replay')throw new Error('Invalid mode');
  wss.handleUpgrade(request,socket,head,client=>{
   wss.emit('connection',client,request);
   const id=`${r.symbol}:${r.interval}:${mode}`;let shared=sessions.get(id);
   if(!shared){const clients=new Map<WebSocket,WireEncoder>();const session=new MarketSession(mode==='live'?new BinanceConnector():new ReplayConnector(),r,mode as Mode,snapshot=>{const state=sessions.get(id);if(!state)return;state.last=snapshot;for(const [ws,encoder] of clients){if(ws.readyState!==WebSocket.OPEN)continue;if(ws.bufferedAmount>1_000_000){ws.close(1013,'Slow consumer; reconnect to resync');continue;}ws.send(JSON.stringify(encoder.encode(snapshot)));}});shared={session,clients};sessions.set(id,shared);}
   const encoder=new WireEncoder();shared.clients.set(client,encoder);if(shared.last)client.send(JSON.stringify(encoder.encode(shared.last)));else if(shared.clients.size===1)void shared.session.start();
   client.on('error',()=>client.terminate());client.on('message',()=>client.close(1008,'This is a read-only stream'));
   client.on('close',()=>{const state=sessions.get(id);state?.clients.delete(client);if(state&&!state.clients.size){state.session.stop();sessions.delete(id);}});
  });
 }catch{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();}
});
const alive=new WeakSet<WebSocket>();wss.on('connection',socket=>{alive.add(socket);socket.on('pong',()=>alive.add(socket));});
// handleUpgrade callback doesn't emit connection automatically.
const timer=setInterval(()=>{for(const socket of wss.clients){if(!alive.has(socket)){socket.terminate();continue;}alive.delete(socket);socket.ping();}},30000);
const shutdown=()=>{clearInterval(timer);for(const s of sessions.values())s.session.stop();for(const socket of wss.clients)socket.close(1001,'Server shutdown');wss.close();server.close();setTimeout(()=>process.exit(0),1000).unref();};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
server.listen(port,host,()=>console.info(JSON.stringify({event:'market_server_started',host,port})));
