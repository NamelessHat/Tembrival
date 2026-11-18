import http from 'node:http';
import https from 'node:https';
import { randomBytes, randomInt, timingSafeEqual, randomUUID, createHmac } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Uploads} from './uploads.mjs';
import {sha256} from './library.mjs';
import {networkAddresses,startDiscovery} from './discovery.mjs';
import {loadIdentity,verificationCode} from './tls-identity.mjs';
import {installPage} from './install-page.mjs';

const mime={'.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.opus':'audio/ogg','.wav':'audio/wav','.wma':'audio/x-ms-wma','.aiff':'audio/aiff'};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function startSync(library,{port=47832,installPort=47834,discoveryPort=47833,apkPath=null,appVersion='0.16.0',versionCode=21,protect,unprotect}={}) {
  if(!library.data.syncServerId){library.data.syncServerId=randomUUID();await library.save();}
  const serverId=library.data.syncServerId,serverName=os.hostname().slice(0,80);
  const desktopToken=randomBytes(32).toString('hex');
  const identity=await loadIdentity(library.root,{protect,unprotect});
  const uploads=new Uploads(library);let apkCache;
  const bodyJson=async(req,limit=65536)=>{let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new Error('Слишком большой запрос');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
  let pairing=null, attempts=new Map(),installUntil=0,pairingRevision=0;
  // Presence is a short, in-memory lease, never a persisted connection claim.
  const presence=new Map(),presenceTTL=45000;
  const touch=device=>presence.set(device.id,Date.now());
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const handler=async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if(!req.socket.encrypted&&!loopback)return json(res,403,{error:'TLS required'});
      if(req.method==='GET'&&url.pathname==='/v1/hello')return json(res,200,{serverId,name:serverName,protocol:2});
      // This service has no browser-facing write API, and never accepts cross-origin browser requests.
      if(req.headers.origin&&!(req.headers.origin==='null'&&req.method==='GET'&&/^\/v1\/audio\/[a-f0-9]{64}$/.test(url.pathname))) return json(res,403,{error:'Browser requests are not allowed'});
      if(req.method==='POST'&&url.pathname==='/v1/probe'){
        const body=await bodyJson(req,4096),device=library.data.devices.find(d=>d.id===body.deviceId);
        if(!device||(req.socket.encrypted&&device.protocol!==2)||! /^[a-f0-9]{32}$/.test(body.nonce||''))return json(res,401,{error:'Доступ отключён. Подключите телефон заново по QR.',serverId});
        return json(res,200,{serverId,name:serverName,proof:createHmac('sha256',device.token).update(serverId+'|'+device.id+'|'+body.nonce).digest('hex')});
      }
      if(req.method==='GET'&&url.pathname==='/install'&&!req.socket.encrypted&&loopback){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(installPage({name:serverName,version:appVersion,enabled:Date.now()<installUntil}));}
      if((req.method==='GET'||req.method==='HEAD')&&url.pathname==='/Luma-Music-Android.apk'&&apkPath){
        if(req.socket.encrypted&&!library.data.devices.some(d=>d.protocol===2&&equal((req.headers.authorization||'').replace(/^Bearer /,''),d.token)))return json(res,401,{error:'Требуется подключение к ПК'});const size=(await fs.stat(apkPath)).size;res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="Tembrival-Android.apk"','Content-Length':size});if(req.method==='HEAD')return res.end();const stream=createReadStream(apkPath);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      if(req.method==='POST'&&url.pathname==='/v1/pair') {
        if(attempts.size>512)for(const [key,value]of attempts)if(value.until<Date.now())attempts.delete(key);if(attempts.size>512)return json(res,429,{error:'Повторите позже'});
        const ip=req.socket.remoteAddress;const attempt=attempts.get(ip)||{count:0,until:Date.now()+60000};
        if(attempt.until<Date.now()) {attempt.count=0;attempt.until=Date.now()+60000;}
        attempts.set(ip,attempt);
        if(++attempt.count>10) return json(res,429,{error:'Слишком много попыток. Подождите минуту.'});
        let raw=''; for await(const chunk of req) {raw+=chunk;if(raw.length>4096) return json(res,413,{error:'Too large'});}
        let body;try{body=JSON.parse(raw);}catch{return json(res,400,{error:'Invalid JSON'});}
        if(!pairing||pairing.expires<Date.now()||!equal(String(body.pin),pairing.pin)) return json(res,401,{error:'Код неверен или истёк. Откройте подключение заново на ПК.'});
        const installationId=/^[a-f0-9]{32}$/.test(body.installationId||'')?body.installationId:null;
        // A PIN authorizes pairing. A random installation ID identifies repeat
        // pairings; an existing token proves which legacy record may migrate.
        const previous=library.data.devices.find(d=>d.id===body.previousDeviceId&&equal(d.token,body.previousToken));
        const existing=(installationId&&library.data.devices.find(d=>d.installationId===installationId))||previous;
        const device={id:existing?.id||randomBytes(12).toString('hex'),name:String(body.name||'Android').slice(0,80),token:randomBytes(32).toString('hex'),pairedAt:Date.now(),protocol:2};
        if(installationId)device.installationId=installationId;
        library.data.devices=library.data.devices.filter(d=>d!==existing&&d!==previous&&!(installationId&&d.installationId===installationId));
        pairing=null;pairingRevision++;library.data.devices.push(device);touch(device);await library.save();
        return json(res,200,{token:device.token,deviceId:device.id,server:'Tembrival',serverId,serverName});
      }
      const token=(req.headers.authorization||'').replace(/^Bearer /,'')||(loopback&&!req.socket.encrypted?url.searchParams.get('token'):null);
      const desktop=equal(token,desktopToken)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const phone=library.data.devices.find(d=>(!req.socket.encrypted||d.protocol===2)&&equal(token,d.token));
      if(!desktop&&!phone) return json(res,401,{error:'Подключите телефон заново через защищённое сопряжение'});
      if(phone){if(req.method==='POST'&&url.pathname==='/v1/presence'&&req.headers['x-presence']==='offline')presence.delete(phone.id);else touch(phone);}
      if(req.method==='POST'&&url.pathname==='/v1/presence')return json(res,200,{ok:true});
      if(req.method==='GET'&&url.pathname==='/v1/identity')return json(res,200,{serverId,name:serverName});
      if(req.method==='POST'&&url.pathname==='/v1/replacements')return json(res,200,{replacements:await library.mergeReplacements((await bodyJson(req,2*1024*1024)).replacements||{})});
      if(req.method==='POST'&&url.pathname==='/v1/playlists')return json(res,200,{records:await library.mergePlaylists((await bodyJson(req,16*1024*1024)).records||[])});
      if(req.method==='POST'&&url.pathname==='/v1/favorites')return json(res,200,{records:await library.mergeFavorites((await bodyJson(req,16*1024*1024)).records||[])});
      if(req.method==='POST'&&url.pathname==='/v1/collections')return json(res,200,{records:await library.mergeCollections((await bodyJson(req,16*1024*1024)).records||[])});
      if(req.method==='POST'&&url.pathname==='/v1/upload/start')return json(res,200,await uploads.start((await bodyJson(req,1024*1024)).track));
      const upload=/^\/v1\/upload\/([a-f0-9]{64})(\/finish)?$/.exec(url.pathname);
      if(upload&&req.method==='PUT'&&!upload[2])return json(res,200,await uploads.chunk(upload[1],Number(req.headers['x-offset']),req));
      if(upload&&req.method==='POST'&&upload[2])return json(res,200,await uploads.finish(upload[1]));
      if(req.method!=='GET'&&req.method!=='HEAD') return json(res,405,{error:'Method not allowed'});
      if(url.pathname==='/v1/update'&&apkPath){const stat=await fs.stat(apkPath);if(!apkCache||apkCache.mtime!==stat.mtimeMs)apkCache={mtime:stat.mtimeMs,sha256:await sha256(apkPath)};return json(res,200,{version:appVersion,versionCode,size:stat.size,sha256:apkCache.sha256,path:'/Luma-Music-Android.apk'});}
      if(url.pathname==='/v1/manifest') return json(res,200,{version:1,tracks:library.data.tracks.map(({sourcePath,...track})=>track)});
      const match=/^\/v1\/(audio|art)\/([a-f0-9]{64})$/.exec(url.pathname);
      const track=match&&library.data.tracks.find(t=>t.id===match[2]);
      if(!track||(match[1]==='art'&&!track.cover)) return json(res,404,{error:'Not found'});
      const file=match[1]==='audio'?library.file(track):path.join(library.root,'art',track.id);
      const size=(await fs.stat(file)).size;let start=0,end=size-1,status=200;
      const headers={'Access-Control-Allow-Origin':'null','Content-Type':match[1]==='audio'?(mime[track.ext]||'application/octet-stream'):(track.coverType||'image/jpeg'),'Accept-Ranges':'bytes','Cache-Control':'private, no-store'};
      if(req.headers.range) {
        const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if(!range||(!range[1]&&!range[2])) {res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
        if(!range[1]) start=Math.max(0,size-Number(range[2]));
        else {start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
        if(start>end||start>=size) {res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length']=end-start+1;res.writeHead(status,headers);
      if(req.method==='HEAD') return res.end();
      const stream=createReadStream(file,{start,end}); stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch(e) {if(!res.headersSent)json(res,e.code?500:400,{error:e.code?'Ошибка локального хранилища':e.message});else res.destroy();}
  };
  // Renderer audio is HTTP on loopback only. LAN credentials never cross this listener.
  const server=http.createServer(handler);
  const tlsServer=https.createServer({key:identity.key,cert:identity.cert,minVersion:'TLSv1.2'},handler);
  const installServer=http.createServer(async(req,res)=>{
    try{
      if(req.headers.origin||!['GET','HEAD'].includes(req.method))return json(res,403,{error:'Доступ запрещён'});
      if(Date.now()>installUntil)return json(res,410,{error:'Откройте окно установки на ПК'});
      const url=new URL(req.url,'http://localhost');
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      if(url.pathname==='/install'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});return res.end(installPage({name:serverName,version:appVersion,enabled:true}));
      }
      if(url.pathname!=='/Luma-Music-Android.apk'||!apkPath)return json(res,404,{error:'Not found'});
      const size=(await fs.stat(apkPath)).size;res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="Tembrival-Android.apk"','Content-Length':size});if(req.method==='HEAD')return res.end();const stream=createReadStream(apkPath);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch{if(!res.headersSent)json(res,500,{error:'Файл недоступен'});else res.destroy();}
  });
  for(const s of [server,tlsServer,installServer]){s.requestTimeout=30000;s.headersTimeout=10000;s.maxHeadersCount=64;s.keepAliveTimeout=2000;}
  const listen=(s,p,host)=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(p,host,resolve);});
  try{await listen(tlsServer,port,'0.0.0.0');await listen(server,0,'127.0.0.1');await listen(installServer,installPort===47834&&port===0?0:installPort,'0.0.0.0');}
  catch(e){for(const s of [server,tlsServer,installServer])if(s.listening)s.close();throw e;}
  const actualPort=server.address().port;
  const securePort=tlsServer.address().port;
  const discovery=await startDiscovery({port:discoveryPort,info:()=>({serverId,name:serverName,port:securePort,protocol:2})});server.once('close',()=>{discovery.close();tlsServer.close();installServer.close();tlsServer.closeAllConnections();installServer.closeAllConnections();});
  return {server,tlsServer,installServer,securePort,port:actualPort,desktopToken,serverId,name:serverName,discovery,fingerprint:identity.fingerprint,
    get pairingRevision(){return pairingRevision;},
    devices(){return library.data.devices.map(({token,installationId,...device})=>({...device,lastSeen:presence.get(device.id)||null,online:presence.has(device.id)&&Date.now()-presence.get(device.id)<presenceTTL}));},
    addresses(){return networkAddresses(securePort).map(a=>({...a,url:a.url.replace('http:','https:')}));},
    installInfo(){installUntil=Date.now()+300000;return {expires:installUntil,addresses:networkAddresses(installServer.address().port)};},
    pairInfo() {pairing={pin:String(randomInt(100000,1000000)),expires:Date.now()+300000};attempts=new Map();return {...pairing,protocol:2,serverId,name:serverName,fingerprint:identity.fingerprint,verificationCode:verificationCode(identity.fingerprint),addresses:this.addresses()};},
    stopPairing(){pairing=null;installUntil=0;},
  };
}

