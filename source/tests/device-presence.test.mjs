import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Library} from '../desktop/library.mjs';
import {startSync} from '../desktop/sync.mjs';
import {tlsRequest,prepareTLS} from './tls-client.mjs';

test('repeat pairing, legacy migration and transient authenticated device presence',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tembrival-devices-'));let sync;
 t.after(async()=>{if(sync?.server.listening)await new Promise(r=>sync.server.close(r));await fs.rm(root,{recursive:true,force:true});});
 let lib=await new Library(root).init();sync=await prepareTLS(await startSync(lib,{port:0,discoveryPort:0}),root);
 const request=(route,options)=>tlsRequest(sync,route,options);
 const pair=async(extra={})=>{const pin=sync.pairInfo().pin;const res=await request('/v1/pair',{method:'POST',body:JSON.stringify({pin,name:'Same model',...extra})});assert.equal(res.status,200);return res.json();};
 const legacy=await pair(),id='a'.repeat(32);const migrated=await pair({installationId:id,previousDeviceId:legacy.deviceId,previousToken:legacy.token});
 assert.equal(migrated.deviceId,legacy.deviceId);assert.equal(lib.data.devices.length,1);assert.notEqual(migrated.token,legacy.token);
 let phone=migrated;
 for(let i=0;i<10;i++){phone=await pair({installationId:id});assert.equal(phone.deviceId,legacy.deviceId);assert.equal(lib.data.devices.length,1);}
 assert.equal(sync.pairingRevision,12);
 // Identical model names are not sufficient evidence to merge devices.
 const other=await pair({installationId:'b'.repeat(32),previousDeviceId:phone.deviceId,previousToken:'incorrect'});
 assert.notEqual(other.deviceId,phone.deviceId);assert.equal(lib.data.devices.length,2);
 const headers={Authorization:'Bearer '+phone.token};
 assert.equal((await request('/v1/presence',{method:'POST',headers})).status,200);assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,true);
 assert.equal((await request('/v1/presence',{method:'POST',headers:{...headers,'X-Presence':'offline'}})).status,200);assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,false);
 // Probe proves the PC to the phone; it does not authenticate the phone.
 await request('/v1/probe',{method:'POST',body:JSON.stringify({deviceId:phone.deviceId,nonce:'c'.repeat(32)})});
 assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,false);
 assert.equal((await request('/v1/presence',{method:'POST',headers:{Authorization:'Bearer '+legacy.token}})).status,401);
 assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,false);
 await request('/v1/manifest',{headers});assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,true);
 const now=Date.now;try{const later=now()+45001;Date.now=()=>later;assert.equal(sync.devices().find(d=>d.id===phone.deviceId).online,false);}finally{Date.now=now;}
 assert.ok(sync.devices().every(d=>!('token'in d)&&!('installationId'in d)));
 // Reopening the PC retains pairing identity, but does not revive stale presence.
 await new Promise(r=>sync.server.close(r));lib=await new Library(root).init();sync=await prepareTLS(await startSync(lib,{port:0,discoveryPort:0}),root);
 assert.ok(sync.devices().every(d=>!d.online));assert.equal(lib.data.devices.length,2);
 phone=await pair({installationId:id});assert.equal(phone.deviceId,legacy.deviceId);assert.equal(lib.data.devices.length,2);
 lib.data.devices=lib.data.devices.filter(d=>d.id!==phone.deviceId);await lib.save();
 assert.equal((await request('/v1/presence',{method:'POST',headers:{Authorization:'Bearer '+phone.token}})).status,401);
});
