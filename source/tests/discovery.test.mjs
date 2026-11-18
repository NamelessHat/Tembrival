import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import dgram from 'node:dgram';import {randomBytes,createHmac} from 'node:crypto';
import {startSync} from '../desktop/sync.mjs';import {networkAddresses,localIPv4} from '../desktop/discovery.mjs';import {Library} from '../desktop/library.mjs';
test('LAN addresses favor physical Wi-Fi over VPN interfaces and reject public addresses',()=>{
 const nic=address=>[{family:'IPv4',internal:false,address}];const list=networkAddresses(47832,{'WireGuard VPN':nic('10.1.1.2'),Ethernet:nic('192.168.1.20'),'Wi-Fi':nic('192.168.43.50'),Public:nic('8.8.8.8')});assert.deepEqual(list.map(a=>a.name),['Wi-Fi','Ethernet','WireGuard VPN']);assert.ok(localIPv4('172.31.2.3'));assert.ok(!localIPv4('172.32.2.3'));assert.ok(!localIPv4('192.168.300.1'));
});
test('Discovery, pairing QR and authenticated identity survive a PC port change without disclosing credentials',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-discovery-'));let sync,socket;
 try{let library=await new Library(root).init();sync=await startSync(library,{port:0,discoveryPort:0});const first=sync.serverId,base='http://127.0.0.1:'+sync.port,nonce=randomBytes(16).toString('hex');socket=dgram.createSocket('udp4');
  const reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No discovery reply')),2000);socket.once('message',bytes=>{clearTimeout(timer);resolve(JSON.parse(bytes));});});socket.send(Buffer.from(JSON.stringify({type:'luma-discover-v1',nonce})),sync.discovery.port,'127.0.0.1');const info=await reply;assert.equal(info.nonce,nonce);assert.equal(info.serverId,first);assert.equal(info.port,sync.securePort);assert.equal(info.protocol,2);assert.equal(info.token,undefined);assert.equal(info.tracks,undefined);socket.close();socket=null;
  const pairing=sync.pairInfo();assert.match(pairing.fingerprint,/^[a-f0-9]{64}$/);assert.ok(pairing.addresses.every(a=>a.url.startsWith("https://")));
  const response=await fetch(base+'/v1/pair',{method:'POST',body:JSON.stringify({pin:pairing.pin,name:'Test phone'})}),paired=await response.json();assert.equal(paired.serverId,first);
  async function probe(base){const response=await fetch(base+'/v1/probe',{method:'POST',body:JSON.stringify({deviceId:paired.deviceId,nonce})});assert.equal(response.status,200);const result=await response.json();assert.equal(result.serverId,first);assert.equal(result.proof,createHmac('sha256',paired.token).update(first+'|'+paired.deviceId+'|'+nonce).digest('hex'));return result;}
  await probe(base);assert.equal((await fetch(base+'/v1/identity')).status,401);const identity=await(await fetch(base+'/v1/identity',{headers:{Authorization:'Bearer '+paired.token}})).json();assert.equal(identity.serverId,first);
  assert.equal((await fetch(base+'/v1/probe',{method:'POST',headers:{Origin:'https://evil.test'},body:JSON.stringify({deviceId:paired.deviceId,nonce})})).status,403);
  await new Promise(r=>sync.server.close(r));library=await new Library(root).init();sync=await startSync(library,{port:0,discoveryPort:0});assert.equal(sync.serverId,first);const next='http://127.0.0.1:'+sync.port;await probe(next);
  library.data.devices=[];await library.save();assert.equal((await fetch(next+'/v1/probe',{method:'POST',body:JSON.stringify({deviceId:paired.deviceId,nonce})})).status,401);
 }finally{if(socket)socket.close();if(sync?.server.listening)await new Promise(r=>sync.server.close(r));await fs.rm(root,{recursive:true,force:true});}
});
