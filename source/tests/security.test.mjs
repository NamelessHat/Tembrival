import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import http from 'node:http';import tls from 'node:tls';
import {Library} from '../desktop/library.mjs';import {startSync} from '../desktop/sync.mjs';import {tlsRequest,prepareTLS} from './tls-client.mjs';

test('TLS pins identity, blocks downgrade, expires pairing, revokes credentials and gates installer',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-security-'));let sync;t.after(async()=>{if(sync?.server.listening)await new Promise(r=>sync.server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const lib=await new Library(root).init(),apk=path.join(root,'test.apk');await fs.writeFile(apk,'installer');
 sync=await prepareTLS(await startSync(lib,{port:0,discoveryPort:0,apkPath:apk}),root);
 assert.equal(sync.server.address().address,'127.0.0.1');assert.ok(sync.addresses().every(a=>a.url.startsWith('https://')));
 await assert.rejects(tlsRequest(sync,'/v1/hello',{pin:'0'.repeat(64)}),/PIN_MISMATCH/);
 const plain='http://127.0.0.1:'+sync.installServer.address().port;
 assert.equal((await fetch(plain+'/install')).status,410);sync.installInfo();assert.match(await(await fetch(plain+'/install')).text(),/HTTP/);assert.equal((await fetch(plain+'/v1/manifest')).status,404);assert.equal(await(await fetch(plain+'/Luma-Music-Android.apk')).text(),'installer');
 const pairing=sync.pairInfo(),pair=pin=>tlsRequest(sync,'/v1/pair',{method:'POST',body:JSON.stringify({pin,name:'Secure phone'})});
 assert.match(pairing.verificationCode,/^(?:[A-F0-9]{4} ){7}[A-F0-9]{4}$/);assert.equal((await pair('000000')).status,401);
 const paired=await(await pair(pairing.pin)).json();assert.match(paired.token,/^[a-f0-9]{64}$/);assert.equal((await pair(pairing.pin)).status,401);
 const headers={Authorization:'Bearer '+paired.token};assert.equal((await tlsRequest(sync,'/v1/manifest',{headers})).status,200);assert.equal((await tlsRequest(sync,'/v1/manifest?token='+paired.token)).status,401);
 assert.equal((await tlsRequest(sync,'/v1/manifest',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
 assert.equal((await tlsRequest(sync,'/v1/pair',{method:'POST',body:'x'.repeat(4097)})).status,413);
 lib.data.devices.push({id:'old-http-device',token:'1'.repeat(64)});assert.equal((await tlsRequest(sync,'/v1/manifest',{headers:{Authorization:'Bearer '+'1'.repeat(64)}})).status,401);
 const expired=sync.pairInfo(),now=Date.now;try{const later=now()+300001;Date.now=()=>later;assert.equal((await pair(expired.pin)).status,401);}finally{Date.now=now;}
 sync.pairInfo();for(let n=0;n<10;n++)assert.equal((await pair('wrong')).status,401);assert.equal((await pair('wrong')).status,429);
 lib.data.devices=[];await lib.save();assert.equal((await tlsRequest(sync,'/v1/manifest',{headers})).status,401);
 const id=sync.fingerprint;await new Promise(r=>sync.server.close(r));sync=await prepareTLS(await startSync(await new Library(root).init(),{port:0,discoveryPort:0}),root);assert.equal(sync.fingerprint,id);
 const socket=tls.connect({host:'127.0.0.1',port:sync.securePort,minVersion:'TLSv1',maxVersion:'TLSv1.1',rejectUnauthorized:false});await new Promise(resolve=>{socket.on('error',resolve);socket.on('secureConnect',()=>assert.fail('TLS < 1.2 accepted'));});socket.destroy();
 sync.stopPairing();assert.equal((await fetch('http://127.0.0.1:'+sync.installServer.address().port+'/install')).status,410);
});

test('paired tokens are encrypted on disk and recover without changing device identity',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'luma-secrets-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 // An injected codec exercises the persistence contract; actual Windows DPAPI is tested in Electron.
 const codec={protect:value=>Buffer.from(value.split('').reverse().join('')).toString('base64'),unprotect:value=>Buffer.from(value,'base64').toString().split('').reverse().join('')};
 const lib=await new Library(root,codec).init();lib.data.devices.push({id:'test',token:'secret-device-token',protocol:2});await lib.save();assert.ok(!(await fs.readFile(path.join(root,'library.json'),'utf8')).includes('secret-device-token'));assert.equal((await new Library(root,codec).init()).data.devices[0].token,'secret-device-token');
});
